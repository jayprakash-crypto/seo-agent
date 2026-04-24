/**
 * Approvals controller — all MySQL query operations for the approvals table.
 * Routes in approvals.routes.ts call these functions; no HTTP objects here.
 */

import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "../db.js";
import { updatePageMeta } from "../services/wordpress.service.js";

// ── Types ─────────────────────────────────────────────────────────────
export interface Approval extends RowDataPacket {
  id: string; // VARCHAR(36) UUID
  site_id: number; // INT
  module: string; // VARCHAR(64)
  type: string; // VARCHAR(64)
  priority: number; // TINYINT — 1=critical, 2=high, 3=medium
  title: string; // VARCHAR(255)
  content: Record<string, unknown>; // JSON (parsed by mysql2)
  preview_url: string | null; // VARCHAR(512) | NULL
  status: "pending" | "approved" | "rejected" | "deferred"; // VARCHAR(16)
  created_at: Date; // DATETIME(3)
  actioned_at: Date | null; // DATETIME(3) | NULL
  actioned_by: string | null; // VARCHAR(64) | NULL
  reject_reason: string | null; // VARCHAR(255) | NULL
}

// Serialised form returned over HTTP (dates as ISO strings for JSON)
export interface ApprovalJSON {
  id: string;
  site_id: number;
  module: string;
  type: string;
  priority: number;
  title: string;
  content: Record<string, unknown>;
  preview_url: string | null;
  status: "pending" | "approved" | "rejected" | "deferred";
  created_at: string;
  actioned_at: string | null;
  actioned_by: string | null;
  reject_reason: string | null;
}

// ── Row serialiser ────────────────────────────────────────────────────
function toJSON(row: Approval): ApprovalJSON {
  return {
    ...row,
    content:
      typeof row.content === "string"
        ? (JSON.parse(row.content) as Record<string, unknown>)
        : row.content,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    actioned_at: row.actioned_at
      ? row.actioned_at instanceof Date
        ? row.actioned_at.toISOString()
        : String(row.actioned_at)
      : null,
  };
}

// ── CREATE ────────────────────────────────────────────────────────────
export async function createApproval(
  data: Pick<
    Approval,
    | "id"
    | "site_id"
    | "module"
    | "type"
    | "priority"
    | "title"
    | "content"
    | "preview_url"
  >,
): Promise<ApprovalJSON> {
  await pool.query<ResultSetHeader>(
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
  const approval = await getApprovalById(data.id);
  return approval!;
}

// ── LIST ──────────────────────────────────────────────────────────────
export async function listApprovals(filters: {
  status?: string;
  site_id?: number;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  approvals: ApprovalJSON[];
  total: number;
  limit: number;
  offset: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.site_id) {
    conditions.push("site_id = ?");
    params.push(filters.site_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const order =
    filters.sort === "priority"
      ? "ORDER BY priority ASC"
      : "ORDER BY ap.created_at DESC";

  const limit = Math.min(filters.limit ?? 10, 100);
  const offset = filters.offset ?? 0;

  const [[countRow], [rows]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM approvals ${where}`,
      params,
    ),
    pool.query<Approval[]>(
      `SELECT ap.*, u.name AS actioned_user_name FROM approvals ap LEFT JOIN users u ON ap.actioned_by = u.id ${where} ${order} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
  ]);

  const total = Number((countRow as RowDataPacket[])[0].count);
  const approvals = (rows as Approval[]).map(toJSON);
  return { approvals, total, limit, offset };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getApprovalById(
  id: string,
): Promise<ApprovalJSON | null> {
  const [rows] = await pool.query<Approval[]>(
    "SELECT * FROM approvals WHERE id = ?",
    [id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── APPROVE ───────────────────────────────────────────────────────────
export async function approveApproval(
  id: string,
  actionedBy: string,
  content?: Record<string, unknown>,
): Promise<ApprovalJSON | null> {
  const sets = [
    "status = 'approved'",
    "actioned_at = NOW(3)",
    "actioned_by = ?",
  ];
  const params: unknown[] = [actionedBy];

  if (content) {
    sets.push("content = ?");
    params.push(JSON.stringify(content));
  }
  params.push(id);

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE approvals SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );

  if (result.affectedRows === 0) return null;

  const approval = await getApprovalById(id);
  if (!approval) return null;

  // If the approved item is a meta_rewrite, push the change to WordPress.
  if (approval.type === "meta_rewrite") {
    const c = approval.content as {
      url?: string;
      suggested_title?: string;
      suggested_description?: string;
    };

    if (c.url && c.suggested_title && c.suggested_description) {
      const wpResult = await updatePageMeta(
        approval.site_id,
        c.url,
        c.suggested_title,
        c.suggested_description,
      );

      if (!wpResult.ok) {
        console.error(
          `[approveApproval] WordPress update failed for approval ${id}:`,
          wpResult.error,
        );
      } else {
        console.log(
          `[approveApproval] WordPress meta updated for ${c.url} (approval ${id})`,
        );
      }
    }
  }

  return approval;
}

// ── REJECT ────────────────────────────────────────────────────────────
export async function rejectApproval(
  id: string,
  actionedBy: string,
  reason: string,
): Promise<ApprovalJSON | null> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE approvals
     SET status = 'rejected', actioned_at = NOW(3), actioned_by = ?, reject_reason = ?
     WHERE id = ?`,
    [actionedBy, reason, id],
  );
  if (result.affectedRows === 0) return null;
  return getApprovalById(id);
}

// ── DEFER ─────────────────────────────────────────────────────────────
export async function deferApproval(
  id: string,
  actionedBy: string,
): Promise<ApprovalJSON | null> {
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE approvals SET status = 'deferred', actioned_at = NOW(3), actioned_by = ? WHERE id = ?",
    [actionedBy, id],
  );
  if (result.affectedRows === 0) return null;
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
      INDEX idx_approvals_status_priority (status, priority),
      INDEX idx_approvals_site_id (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
