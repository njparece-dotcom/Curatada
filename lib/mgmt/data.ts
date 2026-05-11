// Data-layer helpers for the management API. Kept separate from the route
// files so the data shapes stay portable (callable from tests or other
// internal tooling without dragging in the Next request/response surface).

import { query, queryOne } from "@/lib/db";

// ── /summary ─────────────────────────────────────────────────────────────────
//
// `users_active_30d` definition for Curatada: users with `last_login_at`
// within 30 days AND at least one item added or updated in any collection
// in the same window. This matches the playbook's pattern (KnutriX uses
// "logged in 30d AND ≥1 meal logged 30d"). Single recent login isn't
// enough — a user who signed in once and never returned shouldn't count.

export interface MgmtSummary {
  users_total: number;
  users_active_30d: number;
  new_users_7d: number;
  new_users_30d: number;
}

export async function getMgmtSummary(): Promise<MgmtSummary> {
  const row = await queryOne<{
    users_total: string;
    users_active_30d: string;
    new_users_7d: string;
    new_users_30d: string;
  }>(`
    WITH active_window AS (
      SELECT id FROM users
      WHERE last_login_at >= NOW() - INTERVAL '30 days'
    ),
    active_with_item AS (
      SELECT id FROM active_window WHERE EXISTS (
        SELECT 1 FROM guitar_items         WHERE user_id = active_window.id AND updated_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT 1 FROM watch_items          WHERE user_id = active_window.id AND updated_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT 1 FROM automobiles          WHERE user_id = active_window.id AND updated_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT 1 FROM items_of_distinction WHERE user_id = active_window.id AND updated_at >= NOW() - INTERVAL '30 days'
      )
    )
    SELECT
      (SELECT COUNT(*) FROM users)                                                              AS users_total,
      (SELECT COUNT(*) FROM active_with_item)                                                    AS users_active_30d,
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days')                AS new_users_7d,
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days')               AS new_users_30d
  `);

  return {
    users_total:      parseInt(row?.users_total      ?? "0", 10),
    users_active_30d: parseInt(row?.users_active_30d ?? "0", 10),
    new_users_7d:     parseInt(row?.new_users_7d     ?? "0", 10),
    new_users_30d:    parseInt(row?.new_users_30d    ?? "0", 10),
  };
}

// ── /users (cursor-paginated) ────────────────────────────────────────────────
//
// Stable order: (created_at ASC, id ASC). Cursor is the previous page's
// last id; we look its (created_at, id) up and ask for everything strictly
// greater. New sign-ups during a fetch can't cause skipped or duplicated
// rows across pages.
//
// `active_30d` per row mirrors the summary definition: signed in within
// 30d AND has an item updated within 30d.

export interface MgmtUserRow {
  user_id: string;
  email: string;
  name: string | null;
  joined_at: string;
  last_login_at: string | null;
  active_30d: boolean;
}

export interface ListMgmtUsersResult {
  users: MgmtUserRow[];
  next_cursor: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function listMgmtUsers(
  cursor: string | null,
  rawLimit: number | null,
): Promise<ListMgmtUsersResult> {
  const limit = Math.max(1, Math.min(rawLimit ?? DEFAULT_LIMIT, MAX_LIMIT));

  // We fetch limit+1 to know whether there's another page without a second
  // round trip. Cursor is just the trailing row's id; the SQL resolves its
  // (created_at, id) via a subquery so the order key stays stable.
  const sql = `
    SELECT
      u.id                       AS user_id,
      u.email                    AS email,
      u.name                     AS name,
      u.created_at               AS joined_at,
      u.last_login_at            AS last_login_at,
      (u.last_login_at IS NOT NULL
        AND u.last_login_at >= NOW() - INTERVAL '30 days'
        AND EXISTS (
          SELECT 1 FROM guitar_items         WHERE user_id = u.id AND updated_at >= NOW() - INTERVAL '30 days'
          UNION ALL
          SELECT 1 FROM watch_items          WHERE user_id = u.id AND updated_at >= NOW() - INTERVAL '30 days'
          UNION ALL
          SELECT 1 FROM automobiles          WHERE user_id = u.id AND updated_at >= NOW() - INTERVAL '30 days'
          UNION ALL
          SELECT 1 FROM items_of_distinction WHERE user_id = u.id AND updated_at >= NOW() - INTERVAL '30 days'
        )
      )                          AS active_30d
    FROM users u
    ${cursor ? `WHERE (u.created_at, u.id) > (SELECT created_at, id FROM users WHERE id = $1)` : ""}
    ORDER BY u.created_at ASC, u.id ASC
    LIMIT ${cursor ? "$2" : "$1"}
  `;
  const params: unknown[] = cursor ? [cursor, limit + 1] : [limit + 1];

  const rows = await query<{
    user_id: string;
    email: string;
    name: string | null;
    joined_at: Date;
    last_login_at: Date | null;
    active_30d: boolean;
  }>(sql, params);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    users: page.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      name: r.name,
      joined_at: r.joined_at.toISOString(),
      last_login_at: r.last_login_at ? r.last_login_at.toISOString() : null,
      active_30d: !!r.active_30d,
    })),
    next_cursor: hasMore ? page[page.length - 1].user_id : null,
  };
}

// ── /health: latest pursuit-search run ───────────────────────────────────────
//
// We don't maintain a "cron last run" table, but `pursuit_findings.last_seen_at`
// is touched on every cron tick (the upsert refreshes it for every listing
// the search returns). MAX of that column is a faithful proxy.

export async function getLastPursuitSearchRun(): Promise<string | null> {
  try {
    const row = await queryOne<{ last_run: Date | null }>(
      `SELECT MAX(last_seen_at) AS last_run FROM pursuit_findings`,
    );
    return row?.last_run ? row.last_run.toISOString() : null;
  } catch {
    // Table may not exist in some local dev states; the health route
    // surfaces a separate db: ok|error indicator, so we just return null
    // here on any read failure.
    return null;
  }
}

export async function pingDb(): Promise<boolean> {
  try {
    await query(`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
