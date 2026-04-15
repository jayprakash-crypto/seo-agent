/**
 * PostgreSQL connection pool — single shared instance for the entire process.
 * Import `pool` from here; never create a new pool elsewhere.
 */

// ── MySQL (commented out) ─────────────────────────────────────────────
// import mysql from "mysql2/promise";
// const pool = mysql.createPool({
//   uri: process.env.DATABASE_URL ?? "mysql://root:@localhost:3306/seo_agent",
//   waitForConnections: true,
//   connectionLimit: 10,
//   timezone: "Z",
// });

// ── PostgreSQL ────────────────────────────────────────────────────────
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
});

pool.on("error", (err: Error) => {
  console.error("[db] idle client error:", err);
});

export default pool;
