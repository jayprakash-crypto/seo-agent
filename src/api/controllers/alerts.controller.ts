/**
 * Alerts controller — all MySQL query operations for the alerts table.
 * Routes in approvals.ts call these functions; no HTTP objects here.
 */

import { ResultSetHeader } from "mysql2/promise";
import pool from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────
export interface Alert {
  id: string;
  site_id: number;
  module: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  resolved_at?: string;
}

// ── Row deserialiser ──────────────────────────────────────────────────
function toAlert(row: Record<string, unknown>): Alert {
  return {
    ...(row as unknown as Alert),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    resolved_at: row.resolved_at
      ? row.resolved_at instanceof Date
        ? row.resolved_at.toISOString()
        : String(row.resolved_at)
      : undefined,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────
export async function createAlert(
  data: Pick<Alert, "id" | "site_id" | "module" | "severity" | "title" | "detail">,
): Promise<void> {
  await pool.query(
    `INSERT INTO alerts
       (id, site_id, module, severity, title, detail, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', NOW(3))`,
    [data.id, data.site_id, data.module, data.severity, data.title, data.detail],
  );
}

// ── LIST ──────────────────────────────────────────────────────────────
export async function listAlerts(filters: {
  status?: string;
  severity?: string;
  site_id?: number;
}): Promise<{ alerts: Alert[]; total: number }> {
  let sql = "SELECT * FROM alerts WHERE 1=1";
  const params: unknown[] = [];

  if (filters.status)   { sql += " AND status = ?";   params.push(filters.status); }
  if (filters.severity) { sql += " AND severity = ?"; params.push(filters.severity); }
  if (filters.site_id)  { sql += " AND site_id = ?";  params.push(filters.site_id); }

  sql += " ORDER BY created_at DESC";

  const [rows] = await pool.query(sql, params);
  const alerts = (rows as Record<string, unknown>[]).map(toAlert);
  return { alerts, total: alerts.length };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getAlertById(id: string): Promise<Alert | null> {
  const [rows] = await pool.query(
    "SELECT * FROM alerts WHERE id = ?",
    [id],
  );
  const list = rows as Record<string, unknown>[];
  return list.length ? toAlert(list[0]) : null;
}

// ── ACKNOWLEDGE ───────────────────────────────────────────────────────
export async function acknowledgeAlert(id: string): Promise<Alert | null> {
  const [result] = await pool.query(
    "UPDATE alerts SET status = 'acknowledged' WHERE id = ?",
    [id],
  ) as ResultSetHeader[];

  if (!result.affectedRows) return null;
  return getAlertById(id);
}

// ── RESOLVE ───────────────────────────────────────────────────────────
export async function resolveAlert(id: string): Promise<Alert | null> {
  const [result] = await pool.query(
    "UPDATE alerts SET status = 'resolved', resolved_at = NOW(3) WHERE id = ?",
    [id],
  ) as ResultSetHeader[];

  if (!result.affectedRows) return null;
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
      INDEX idx_status_severity (status, severity),
      INDEX idx_site_id (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
