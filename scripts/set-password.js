#!/usr/bin/env node
//
// One-off admin tool to set / reset a user's password on a hosted deploy.
// Hashes <password> with bcrypt cost 12 (matching the /api/auth/register
// flow) and writes it to users.password_hash for the row with the given
// email. Fails loudly if the user doesn't exist.
//
// Usage (local CLI talking to a remote DB):
//
//   railway run node scripts/set-password.js <email> <password>
//
// Or with an explicit DATABASE_URL:
//
//   DATABASE_URL='postgresql://...' node scripts/set-password.js <email> <password>
//
// Wrap the password in single quotes so the shell doesn't interpret special
// characters. Don't paste plaintext passwords into commit messages or PRs.

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
} catch {
  // dotenv only matters for local-dev convenience; safe to skip
}

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Usage: node scripts/set-password.js <email> <password>");
    process.exit(2);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  // Same SSL heuristic as the migrate script — hosted Postgres requires TLS.
  let ssl;
  try {
    const host = new URL(connectionString).hostname;
    if (process.env.NODE_ENV === "production" || !/^(localhost|127\.0\.0\.1)$/.test(host)) {
      ssl = { rejectUnauthorized: false };
    }
  } catch {
    /* fall back to no ssl */
  }

  const pool = new Pool({ connectionString, ssl });
  try {
    const hash = await bcrypt.hash(password, 12);
    const res = await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING id, email",
      [hash, email],
    );
    if (res.rowCount === 0) {
      console.error(`No user with email ${email}.`);
      process.exit(1);
    }
    console.log(`Password updated for ${res.rows[0].email} (id=${res.rows[0].id}).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed.");
  console.error("  message:", err && err.message ? err.message : "(empty)");
  if (err && err.code) console.error("  code:   ", err.code);
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});
