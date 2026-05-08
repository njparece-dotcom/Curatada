#!/usr/bin/env node

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// dotenv is only needed for local dev (env vars in .env.local). On hosted
// deploys env vars come from the platform, and dotenv may not be present in
// the production bundle (Next's standalone output only ships what routes
// import).
try {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
} catch {
  // not installed — fine in production
}

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  // Log the host:port:database without leaking the password — handy on hosted
  // deploys where you can't easily eyeball the var.
  try {
    const u = new URL(connectionString);
    console.log(`Target: ${u.hostname}:${u.port || "5432"} db=${u.pathname.slice(1)} user=${u.username}`);
  } catch {
    console.log("Target: <unparseable DATABASE_URL>");
  }

  // Hosted Postgres (Railway, Heroku, Render, RDS, ...) typically requires
  // TLS. Local dev against a docker-compose Postgres does not. Detect by
  // NODE_ENV; the rejectUnauthorized:false matches what every hosted vendor
  // expects (their certs aren't in Node's trust store).
  const ssl = process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString, ssl });

  try {
    console.log("Connecting to database...");
    const client = await pool.connect();

    // Tracking table — every migration we apply gets a row here so re-running
    // this script is a no-op once everything is up to date.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRows = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedRows.rows.map((r) => r.filename));

    const migrationsDir = path.join(__dirname, "../db/migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        ran++;
        console.log(`  ✓ ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    client.release();
    console.log(`\n${ran} new migration(s) applied; ${files.length - ran} already current.`);
  } catch (err) {
    // Dump as much as we can — pg errors carry useful fields beyond .message
    // (code, severity, detail, hint, position) and on connection failures the
    // .message itself can be empty.
    console.error("Migration failed.");
    console.error("  message:  ", err && err.message ? err.message : "(empty)");
    if (err && err.code) console.error("  code:     ", err.code);
    if (err && err.severity) console.error("  severity: ", err.severity);
    if (err && err.detail) console.error("  detail:   ", err.detail);
    if (err && err.hint) console.error("  hint:     ", err.hint);
    if (err && err.position) console.error("  position: ", err.position);
    if (err && err.where) console.error("  where:    ", err.where);
    if (err && err.stack) console.error(err.stack);
    if (!err || (typeof err === "object" && Object.keys(err).length === 0)) {
      console.error("  raw:      ", err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
