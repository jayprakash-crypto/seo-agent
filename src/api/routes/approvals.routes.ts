/**
 * Approvals router — /approvals endpoints.
 * Requires `io` (Socket.io server) injected via factory function.
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Server as SocketIOServer } from "socket.io";

import {
  createApproval,
  listApprovals,
  getApprovalById,
  approveApproval,
  rejectApproval,
  deferApproval,
} from "../controllers/approvals.controller.js";

// Request body shape for POST /approvals (all strings from JSON body)
interface CreateApprovalBody {
  site_id?: number;
  module?: string;
  type?: string;
  priority?: number;
  title?: string;
  content?: Record<string, unknown>;
  preview_url?: string;
}

export function approvalsRouter(io: SocketIOServer): Router {
  const router = Router();

  // POST /approvals
  router.post("/", async (req: Request, res: Response) => {
    const { site_id, module, type, priority = 3, title, content, preview_url } =
      req.body as CreateApprovalBody;

    if (!site_id || !module || !type || !title || !content) {
      res.status(400).json({
        error: "Missing required fields: site_id, module, type, title, content",
      });
      return;
    }

    try {
      const approval = await createApproval({
        id: randomUUID(),
        site_id: Number(site_id),
        module: String(module),
        type: String(type),
        priority: Number(priority),
        title: String(title),
        content: content as Record<string, unknown>,
        preview_url: preview_url ? String(preview_url) : null,
      });
      io.emit("approval:created", approval);
      res.status(201).json(approval);
    } catch (err) {
      console.error("[approvals] create error:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // GET /approvals
  router.get("/", async (req: Request, res: Response) => {
    const { status, sort, site_id, limit, offset } = req.query as Record<string, string>;
    try {
      const result = await listApprovals({
        status,
        site_id: site_id ? Number(site_id) : undefined,
        sort,
        limit:  limit  ? Number(limit)  : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      res.json(result);
    } catch (err) {
      console.error("[approvals] list error:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // GET /approvals/:id
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const approval = await getApprovalById(req.params.id);
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      res.json(approval);
    } catch (err) {
      console.error("[approvals] get error:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // POST /approvals/:id/approve
  router.post("/:id/approve", async (req: Request, res: Response) => {
    const { actioned_by, content } = req.body as {
      actioned_by?: string;
      content?: Record<string, unknown>;
    };
    try {
      const approval = await approveApproval(
        req.params.id,
        actioned_by ?? "operator",
        content,
      );
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      io.emit("approval:updated", approval);
      res.json(approval);
    } catch (err) {
      console.error("[approvals] approve error:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // POST /approvals/:id/reject
  router.post("/:id/reject", async (req: Request, res: Response) => {
    const { actioned_by, reason } = req.body as {
      actioned_by?: string;
      reason?: string;
    };
    if (!reason) {
      res.status(400).json({ error: "Reject reason is required" });
      return;
    }
    try {
      const approval = await rejectApproval(
        req.params.id,
        actioned_by ?? "operator",
        reason,
      );
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      io.emit("approval:updated", approval);
      res.json(approval);
    } catch (err) {
      console.error("[approvals] reject error:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // POST /approvals/:id/defer
  router.post("/:id/defer", async (req: Request, res: Response) => {
    try {
      const approval = await deferApproval(req.params.id);
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      io.emit("approval:updated", approval);
      res.json(approval);
    } catch (err) {
      console.error("[approvals] defer error:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  return router;
}
