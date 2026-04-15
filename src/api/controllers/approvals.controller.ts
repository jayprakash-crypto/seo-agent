/**
 * Approvals controller — all PostgreSQL query operations for the approvals table.
 * Routes in approvals.ts call these functions; no HTTP objects here.
 */

// ── MySQL (commented out) ─────────────────────────────────────────────
// import { ResultSetHeader } from "mysql2/promise";
// MySQL schema used:
//   id            VARCHAR(36)   PRIMARY KEY
//   priority      TINYINT       DEFAULT 3
//   content       JSON
//   created_at    DATETIME(3)   DEFAULT CURRENT_TIMESTAMP(3)
//   actioned_at   DATETIME(3)
// MySQL used ? placeholders, [rows] destructure, result.affectedRows

// ── PostgreSQL ────────────────────────────────────────────────────────
import pool from "../db.js";
import { updatePageMeta } from "../services/wordpress.service.js";

// ── Types (PostgreSQL-aligned) ────────────────────────────────────────
// id          → UUID  (pg returns as string)
// content     → JSONB (pg returns as parsed object, no JSON.parse needed on read)
// priority    → SMALLINT (1=critical, 2=high, 3=medium)
// created_at  → TIMESTAMPTZ (pg returns as Date)
// actioned_at → TIMESTAMPTZ | null

export interface Approval {
  id: string;                   // UUID
  site_id: number;              // INTEGER
  module: string;               // VARCHAR(64)
  type: string;                 // VARCHAR(64)
  priority: number;             // SMALLINT — 1=critical, 2=high, 3=medium
  title: string;                // VARCHAR(255)
  content: Record<string, unknown>; // JSONB
  preview_url: string | null;   // VARCHAR(512) | NULL
  status: "pending" | "approved" | "rejected" | "deferred"; // VARCHAR(16)
  created_at: Date;             // TIMESTAMPTZ
  actioned_at: Date | null;     // TIMESTAMPTZ | NULL
  actioned_by: string | null;   // VARCHAR(64)  | NULL
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
// pg returns JSONB as a parsed object and TIMESTAMPTZ as a JS Date —
// we only need to convert Date → ISO string for the HTTP response.
function toJSON(row: Approval): ApprovalJSON {
  return {
    ...row,
    created_at: row.created_at instanceof Date
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
  data: Pick<Approval, "id" | "site_id" | "module" | "type" | "priority" | "title" | "content" | "preview_url">,
): Promise<ApprovalJSON> {
  const { rows } = await pool.query<Approval>(
    `INSERT INTO approvals
       (id, site_id, module, type, priority, title, content, preview_url, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
     RETURNING *`,
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
  return toJSON(rows[0]);
}

// ── LIST ──────────────────────────────────────────────────────────────
export async function listApprovals(filters: {
  status?: string;
  site_id?: number;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<{ approvals: ApprovalJSON[]; total: number; limit: number; offset: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters.status)  { conditions.push(`status = $${i++}`);  params.push(filters.status); }
  if (filters.site_id) { conditions.push(`site_id = $${i++}`); params.push(filters.site_id); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const order = filters.sort === "priority"
    ? "ORDER BY priority ASC"
    : "ORDER BY created_at DESC";

  const limit  = Math.min(filters.limit  ?? 10, 100);
  const offset = filters.offset ?? 0;

  const [countResult, rowsResult] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM approvals ${where}`, params),
    pool.query<Approval>(
      `SELECT * FROM approvals ${where} ${order} LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset],
    ),
  ]);

  const total    = Number(countResult.rows[0].count);
  const approvals = rowsResult.rows.map(toJSON);
  return { approvals, total, limit, offset };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getApprovalById(id: string): Promise<ApprovalJSON | null> {
  const { rows } = await pool.query<Approval>(
    "SELECT * FROM approvals WHERE id = $1",
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
  const sets = ["status = 'approved'", "actioned_at = NOW()", "actioned_by = $1"];
  const params: unknown[] = [actionedBy];
  let i = 2;

  if (content) {
    sets.push(`content = $${i++}`);
    params.push(JSON.stringify(content));
  }
  params.push(id);

  const { rows } = await pool.query<Approval>(
    `UPDATE approvals SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params,
  );

  if (!rows.length) return null;

  const approval = toJSON(rows[0]);

  // If the approved item is a meta_rewrite, push the change to WordPress.
  // content.url, content.suggested_title, content.suggested_description
  // are set by the cms-connector when it creates the approval.
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
        // Log the failure but don't roll back the DB approval —
        // the operator can retry via the CMS connector manually.
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
  const { rows } = await pool.query<Approval>(
    `UPDATE approvals
     SET status = 'rejected', actioned_at = NOW(), actioned_by = $1, reject_reason = $2
     WHERE id = $3
     RETURNING *`,
    [actionedBy, reason, id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── DEFER ─────────────────────────────────────────────────────────────
export async function deferApproval(id: string): Promise<ApprovalJSON | null> {
  const { rows } = await pool.query<Approval>(
    "UPDATE approvals SET status = 'deferred', actioned_at = NOW() WHERE id = $1 RETURNING *",
    [id],
  );
  return rows.length ? toJSON(rows[0]) : null;
}

// ── SCHEMA BOOTSTRAP ──────────────────────────────────────────────────
export async function createApprovalsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approvals (
      id            UUID          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id       INTEGER       NOT NULL,
      module        VARCHAR(64)   NOT NULL,
      type          VARCHAR(64)   NOT NULL,
      priority      SMALLINT      NOT NULL DEFAULT 3,
      title         VARCHAR(255)  NOT NULL,
      content       JSONB         NOT NULL DEFAULT '{}',
      preview_url   VARCHAR(512),
      status        VARCHAR(16)   NOT NULL DEFAULT 'pending',
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      actioned_at   TIMESTAMPTZ,
      actioned_by   VARCHAR(64),
      reject_reason VARCHAR(255)
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_status_priority ON approvals (status, priority);
    CREATE INDEX IF NOT EXISTS idx_approvals_site_id ON approvals (site_id);
  `);
}
