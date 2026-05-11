// In-memory sliding-window rate limiter for /api/mgmt/v1/* routes.
//
// Per the playbook contract: 60 requests/min per caller across all mgmt
// routes. "Caller" is keyed by source IP (after the proxy header) — there's
// only one shared token across all callers, so IP is the next-best identity.
//
// Singleton stored on globalThis so it survives Next dev hot-reloads AND
// production module re-evaluations (same pattern as the pg Pool). Single
// instance is fine for a single-replica Railway deploy; if you ever scale
// out, swap in a Redis-backed limiter — the call sites need not change.

declare global {
  // eslint-disable-next-line no-var
  var _mgmtRateState: Map<string, number[]> | undefined;
}

const WINDOW_MS = 60_000;
const LIMIT = 60;

function getState(): Map<string, number[]> {
  if (!globalThis._mgmtRateState) {
    globalThis._mgmtRateState = new Map<string, number[]>();
  }
  return globalThis._mgmtRateState;
}

/**
 * Returns true if the caller is within budget; false if they've exceeded
 * the limit. Side effect: records the current request's timestamp.
 */
export function rateLimitAllow(key: string, now: number = Date.now()): boolean {
  const state = getState();
  const cutoff = now - WINDOW_MS;
  const recent = (state.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= LIMIT) {
    state.set(key, recent); // prune even on reject
    return false;
  }
  recent.push(now);
  state.set(key, recent);

  // Occasional cleanup of stale keys so the Map doesn't grow unboundedly
  // when many different callers hit the endpoint. Using `.forEach` instead
  // of `for...of` keeps us compatible with the project's default TS target
  // (avoids needing downlevelIteration).
  if (Math.random() < 0.01) {
    state.forEach((timestamps, k) => {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) state.delete(k);
      else state.set(k, fresh);
    });
  }
  return true;
}
