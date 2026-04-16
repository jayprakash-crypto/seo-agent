/**
 * Alerts controller — all MySQL query operations for the alerts table.
 * Routes in alerts.routes.ts call these functions; no HTTP objects here.
 */

import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────
export interface Alert extends RowDataPacket {
  id: string;                                  // VARCHAR(36) UUID
  site_id: number;                             // INT
  module: string;                              // VARCHAR(64)
  severity: "critical" | "warning" | "info";  // VARCHAR(16)
  title: string;                               // VARCHAR(255)
  detail: string;                              // TEXT
  status: "open" | "acknowledged" | "resolved"; // VARCHAR(16)
  created_at: Date;                            // DATETIME(3)
  resolved_at: Date | null;                    // DATETIME(3) | NULL
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
  await pool.query<ResultSetHeader>(
    `INSERT INTO alerts
       (id, site_id, module, severity, title, detail, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', NOW(3))`,
    [data.id, data.site_id, data.module, data.severity, data.title, data.detail],
  );
  const alert = await getAlertById(data.id);
  return alert!;
}

// ── LIST ──────────────────────────────────────────────────────────────
export async function listAlerts(filters: {
  status?: string;
  severity?: string;
  site_id?: number;
}): Promise<{ alerts: AlertJSON[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status)   { conditions.push("status = ?");   params.push(filters.status); }
  if (filters.severity) { conditions.push("severity = ?"); params.push(filters.severity); }
  if (filters.site_id)  { conditions.push("site_id = ?");  params.push(filters.site_id); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query<Alert[]>(
    `SELECT * FROM alerts ${where} ORDER BY created_at DESC`,
    params,
  );
  const alerts = (rows as Alert[]).map(toJSON);
  return { alerts, total: alerts.length };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getAlertById(id: string): Promise<AlertJSON | null> {
  const [rows] = await pool.query<Alert[]>(
    "SELECT * FROM alerts WHERE id = ?",
    [id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── ACKNOWLEDGE ───────────────────────────────────────────────────────
export async function acknowledgeAlert(id: string): Promise<AlertJSON | null> {
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE alerts SET status = 'acknowledged' WHERE id = ?",
    [id],
  );
  if (result.affectedRows === 0) return null;
  return getAlertById(id);
}

// ── RESOLVE ───────────────────────────────────────────────────────────
export async function resolveAlert(id: string): Promise<AlertJSON | null> {
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE alerts SET status = 'resolved', resolved_at = NOW(3) WHERE id = ?",
    [id],
  );
  if (result.affectedRows === 0) return null;
  return getAlertById(id);
}

// ── SCHEMA BOOTSTRAP ──────────────────────────────────────────────────
export async function createAlertsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id          VARCHAR(36)  NOT NULL PRIMARY KEY,
      site_id     INT          NOT NULL,
      module      VARCHAR(64)  NOT NULL,
      severity    VARCHAR(16)  NOT NULL,
      title       VARCHAR(255) NOT NULL,
      detail      TEXT         NOT NULL,
      status      VARCHAR(16)  NOT NULL DEFAULT 'open',
      created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      resolved_at DATETIME(3)  NULL,
      INDEX idx_alerts_status_severity (status, severity),
      INDEX idx_alerts_site_id (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
