/**
 * Alerts controller — all PostgreSQL query operations for the alerts table.
 * Routes in approvals.ts call these functions; no HTTP objects here.
 */

// ── MySQL (commented out) ─────────────────────────────────────────────
// import { ResultSetHeader } from "mysql2/promise";
// MySQL schema used:
//   id          VARCHAR(36)   PRIMARY KEY
//   severity    VARCHAR(16)
//   status      VARCHAR(16)   DEFAULT 'open'
//   created_at  DATETIME(3)   DEFAULT CURRENT_TIMESTAMP(3)
//   resolved_at DATETIME(3)
// MySQL used ? placeholders, [rows] destructure, result.affectedRows

// ── PostgreSQL ────────────────────────────────────────────────────────
import pool from "../db.js";

// ── Types (PostgreSQL-aligned) ────────────────────────────────────────
// id          → UUID        (pg returns as string)
// severity    → VARCHAR(16) constrained to critical | warning | info
// status      → VARCHAR(16) constrained to open | acknowledged | resolved
// created_at  → TIMESTAMPTZ (pg returns as Date)
// resolved_at → TIMESTAMPTZ | null

export interface Alert {
  id: string;                              // UUID
  site_id: number;                         // INTEGER
  module: string;                          // VARCHAR(64)
  severity: "critical" | "warning" | "info"; // VARCHAR(16)
  title: string;                           // VARCHAR(255)
  detail: string;                          // TEXT
  status: "open" | "acknowledged" | "resolved"; // VARCHAR(16)
  created_at: Date;                        // TIMESTAMPTZ
  resolved_at: Date | null;               // TIMESTAMPTZ | NULL
}

// Serialised form returned over HTTP (dates as ISO strings for JSON)
export interface AlertJSON {
  id: string;
  site_id: number;
  module: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

// ── Row serialiser ────────────────────────────────────────────────────
// pg returns TIMESTAMPTZ as a JS Date — convert to ISO string for HTTP.
function toJSON(row: Alert): AlertJSON {
  return {
    ...row,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    resolved_at: row.resolved_at
      ? row.resolved_at instanceof Date
        ? row.resolved_at.toISOString()
        : String(row.resolved_at)
      : null,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────
export async function createAlert(
  data: Pick<Alert, "id" | "site_id" | "module" | "severity" | "title" | "detail">,
): Promise<AlertJSON> {
  const { rows } = await pool.query<Alert>(
    `INSERT INTO alerts
       (id, site_id, module, severity, title, detail, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW())
     RETURNING *`,
    [data.id, data.site_id, data.module, data.severity, data.title, data.detail],
  );
  return toJSON(rows[0]);
}

// ── LIST ──────────────────────────────────────────────────────────────
export async function listAlerts(filters: {
  status?: string;
  severity?: string;
  site_id?: number;
}): Promise<{ alerts: AlertJSON[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters.status)   { conditions.push(`status = $${i++}`);   params.push(filters.status); }
  if (filters.severity) { conditions.push(`severity = $${i++}`); params.push(filters.severity); }
  if (filters.site_id)  { conditions.push(`site_id = $${i++}`);  params.push(filters.site_id); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<Alert>(
    `SELECT * FROM alerts ${where} ORDER BY created_at DESC`,
    params,
  );
  const alerts = rows.map(toJSON);
  return { alerts, total: alerts.length };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getAlertById(id: string): Promise<AlertJSON | null> {
  const { rows } = await pool.query<Alert>(
    "SELECT * FROM alerts WHERE id = $1",
    [id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── ACKNOWLEDGE ───────────────────────────────────────────────────────
export async function acknowledgeAlert(id: string): Promise<AlertJSON | null> {
  const { rows } = await pool.query<Alert>(
    "UPDATE alerts SET status = 'acknowledged' WHERE id = $1 RETURNING *",
    [id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── RESOLVE ───────────────────────────────────────────────────────────
export async function resolveAlert(id: string): Promise<AlertJSON | null> {
  const { rows } = await pool.query<Alert>(
    "UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = $1 RETURNING *",
    [id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── SCHEMA BOOTSTRAP ──────────────────────────────────────────────────
export async function createAlertsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id     INTEGER     NOT NULL,
      module      VARCHAR(64) NOT NULL,
      severity    VARCHAR(16) NOT NULL,
      title       VARCHAR(255) NOT NULL,
      detail      TEXT        NOT NULL,
      status      VARCHAR(16) NOT NULL DEFAULT 'open',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_status_severity ON alerts (status, severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_site_id ON alerts (site_id);
  `);
}
