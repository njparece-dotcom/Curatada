#!/usr/bin/env node

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

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
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
