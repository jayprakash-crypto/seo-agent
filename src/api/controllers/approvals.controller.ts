/**
 * Approvals controller — all MySQL query operations for the approvals table.
 * Routes in approvals.ts call these functions; no HTTP objects here.
 */

import { ResultSetHeader } from "mysql2/promise";
import pool from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────
export interface Approval {
  id: string;
  site_id: number;
  module: string;
  type: string;
  priority: number; // 1=critical, 2=high, 3=medium
  title: string;
  content: Record<string, unknown>;
  preview_url?: string;
  status: "pending" | "approved" | "rejected" | "deferred";
  created_at: string;
  actioned_at?: string;
  actioned_by?: string;
  reject_reason?: string;
}

// ── Row deserialiser ──────────────────────────────────────────────────
function toApproval(row: Record<string, unknown>): Approval {
  return {
    ...(row as unknown as Approval),
    content:
      typeof row.content === "string"
        ? (JSON.parse(row.content) as Record<string, unknown>)
        : (row.content as Record<string, unknown>),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    actioned_at: row.actioned_at
      ? row.actioned_at instanceof Date
        ? row.actioned_at.toISOString()
        : String(row.actioned_at)
      : undefined,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────
export async function createApproval(
  data: Pick<Approval, "id" | "site_id" | "module" | "type" | "priority" | "title" | "content" | "preview_url">,
): Promise<void> {
  await pool.query(
    `INSERT INTO approvals
       (id, site_id, module, type, priority, title, content, preview_url, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(3))`,
    [
      data.id,
      data.site_id,
      data.module,
      data.type,
      data.priority,
      data.title,
      JSON.stringify(data.content),
      data.preview_url ?? null,
    ],
  );
}

// ── LIST ──────────────────────────────────────────────────────────────
export async function listApprovals(filters: {
  status?: string;
  site_id?: number;
  sort?: string;
}): Promise<{ approvals: Approval[]; total: number }> {
  let sql = "SELECT * FROM approvals WHERE 1=1";
  const params: unknown[] = [];

  if (filters.status)  { sql += " AND status = ?";  params.push(filters.status); }
  if (filters.site_id) { sql += " AND site_id = ?"; params.push(filters.site_id); }

  sql += filters.sort === "priority"
    ? " ORDER BY priority ASC"
    : " ORDER BY created_at DESC";

  const [rows] = await pool.query(sql, params);
  const approvals = (rows as Record<string, unknown>[]).map(toApproval);
  return { approvals, total: approvals.length };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getApprovalById(id: string): Promise<Approval | null> {
  const [rows] = await pool.query(
    "SELECT * FROM approvals WHERE id = ?",
    [id],
  );
  const list = rows as Record<string, unknown>[];
  return list.length ? toApproval(list[0]) : null;
}

// ── APPROVE ───────────────────────────────────────────────────────────
export async function approveApproval(
  id: string,
  actionedBy: string,
  content?: Record<string, unknown>,
): Promise<Approval | null> {
  const sets = ["status = 'approved'", "actioned_at = NOW(3)", "actioned_by = ?"];
  const params: unknown[] = [actionedBy];

  if (content) {
    sets.push("content = ?");
    params.push(JSON.stringify(content));
  }
  params.push(id);

  const [result] = await pool.query(
    `UPDATE approvals SET ${sets.join(", ")} WHERE id = ?`,
    params,
  ) as ResultSetHeader[];

  if (!result.affectedRows) return null;
  return getApprovalById(id);
}

// ── REJECT ────────────────────────────────────────────────────────────
export async function rejectApproval(
  id: string,
  actionedBy: string,
  reason: string,
): Promise<Approval | null> {
  const [result] = await pool.query(
    `UPDATE approvals
     SET status = 'rejected', actioned_at = NOW(3), actioned_by = ?, reject_reason = ?
     WHERE id = ?`,
    [actionedBy, reason, id],
  ) as ResultSetHeader[];

  if (!result.affectedRows) return null;
  return getApprovalById(id);
}

// ── DEFER ─────────────────────────────────────────────────────────────
export async function deferApproval(id: string): Promise<Approval | null> {
  const [result] = await pool.query(
    "UPDATE approvals SET status = 'deferred', actioned_at = NOW(3) WHERE id = ?",
    [id],
  ) as ResultSetHeader[];

  if (!result.affectedRows) return null;
  return getApprovalById(id);
}

// ── SCHEMA BOOTSTRAP ──────────────────────────────────────────────────
export async function createApprovalsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approvals (
      id            VARCHAR(36)   NOT NULL PRIMARY KEY,
      site_id       INT           NOT NULL,
      module        VARCHAR(64)   NOT NULL,
      type          VARCHAR(64)   NOT NULL,
      priority      TINYINT       NOT NULL DEFAULT 3,
      title         VARCHAR(255)  NOT NULL,
      content       JSON          NOT NULL,
      preview_url   VARCHAR(512)  NULL,
      status        VARCHAR(16)   NOT NULL DEFAULT 'pending',
      created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      actioned_at   DATETIME(3)   NULL,
      actioned_by   VARCHAR(64)   NULL,
      reject_reason VARCHAR(255)  NULL,
      INDEX idx_status_priority (status, priority),
      INDEX idx_site_id (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
