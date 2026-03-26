import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";

const SERVER_NAME = "cms-connector";
const SERVER_VERSION = "1.0.0";

// ── Site config ───────────────────────────────────────────────────────
const SITE_DOMAINS: Record<number, string> = {
  1: "https://lifecircle.in",
};

function getSiteUrl(siteId: number): string {
  const domain = SITE_DOMAINS[siteId];
  if (!domain)
    throw new Error(
      `Unknown site_id: ${siteId}. Valid IDs: ${Object.keys(SITE_DOMAINS).join(", ")}`,
    );
  return domain;
}

// ── WordPress REST client ─────────────────────────────────────────────
function buildWpClient(siteId: number) {
  const baseUrl = process.env[`CMS_API_URL_SITE_${siteId}`];
  const apiKey = process.env[`CMS_API_KEY_SITE_${siteId}`];
  if (!baseUrl) throw new Error(`Missing env var: CMS_API_URL_SITE_${siteId}`);
  if (!apiKey) throw new Error(`Missing env var: CMS_API_KEY_SITE_${siteId}`);
  // apiKey format: "username:application_password"
  const auth = `Basic ${Buffer.from(apiKey).toString("base64")}`;

  async function request<T = unknown>(
    path: string,
    opts: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...opts,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        ...(opts.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WP API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    get: <T = unknown>(path: string) => request<T>(path),
    patch: <T = unknown>(path: string, body: object) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  };
}

// ── GSC client (same pattern as keyword-tracker) ──────────────────────
function buildGscClient(siteId: number) {
  const envKey = `GSC_OAUTH_SITE_${siteId}`;
  const raw = process.env[envKey];
  if (!raw) throw new Error(`Missing env var: ${envKey}`);
  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error(
      `${envKey} must be valid JSON (service account credentials)`,
    );
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return google.searchconsole({ version: "v1", auth });
}

// ── Date helpers ──────────────────────────────────────────────────────
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}
function today(): string {
  return formatDate(new Date());
}

// ── Helpers ───────────────────────────────────────────────────────────
function extractJsonLd(html: string): object[] {
  const schemas: object[] = [];
  const rx =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(rx)) {
    try {
      schemas.push(JSON.parse(m[1]));
    } catch {
      /* skip malformed */
    }
  }
  return schemas;
}

type WpPost = {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  modified: string;
  link: string;
  status: string;
  yoast_head_json?: { description?: string };
};

type WpClient = ReturnType<typeof buildWpClient>;

async function findPostByUrl(wp: WpClient, url: string): Promise<WpPost> {
  const slug = new URL(url).pathname.replace(/\/$/, "").split("/").pop() ?? "";
  let results = await wp.get<WpPost[]>(
    `/posts?slug=${encodeURIComponent(slug)}&_fields=id,title,excerpt,content,modified,link,status,yoast_head_json`,
  );
  if (!results.length) {
    results = await wp.get<WpPost[]>(
      `/pages?slug=${encodeURIComponent(slug)}&_fields=id,title,excerpt,content,modified,link,status,yoast_head_json`,
    );
  }
  if (!results.length) throw new Error(`No post/page found for URL: ${url}`);
  return results[0];
}

// ── Tool implementations ──────────────────────────────────────────────

async function getPage(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const url = args.url as string;
  const wp = buildWpClient(siteId);

  console.log("========== Getting Pages/Post ==========");
  const post = await findPostByUrl(wp, url);
  console.log(`========== Fetched Page ${url} ==========`);

  return {
    site_id: siteId,
    id: post.id,
    url: post.link,
    title: post.title.rendered,
    meta_description:
      post.yoast_head_json?.description ??
      post.excerpt.rendered.replace(/<[^>]+>/g, "").trim(),
    body: post.content.rendered,
    schema: extractJsonLd(post.content.rendered),
    last_modified: post.modified,
    status: post.status,
  };
}

async function listPages(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const limit = (args.limit as number | undefined) ?? 20;
  const offset = (args.offset as number | undefined) ?? 0;
  const wp = buildWpClient(siteId);
  const sc = buildGscClient(siteId);

  const [posts, gscRes] = await Promise.all([
    wp.get<WpPost[]>(
      `/posts?per_page=${limit}&offset=${offset}&status=publish&_fields=id,title,link,modified,status`,
    ),
    sc.searchanalytics.query({
      siteUrl: getSiteUrl(siteId),
      requestBody: {
        startDate: daysAgo(28),
        endDate: today(),
        dimensions: ["page"],
        rowLimit: 5000,
      },
    }),
  ]);

  const gscMap = new Map<
    string,
    { clicks: number; impressions: number; ctr_pct: number; position: number }
  >();
  for (const row of gscRes.data.rows ?? []) {
    const pageUrl = row.keys?.[0] ?? "";
    gscMap.set(pageUrl, {
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr_pct: Math.round((row.ctr ?? 0) * 10000) / 100,
      position: Math.round((row.position ?? 0) * 10) / 10,
    });
  }

  const pages = posts.map((p) => ({
    id: p.id,
    title: p.title.rendered,
    url: p.link,
    last_modified: p.modified,
    gsc: gscMap.get(p.link) ?? null,
  }));

  return { site_id: siteId, total: pages.length, offset, pages };
}

async function getPageMetrics(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const url = args.url as string;
  const sc = buildGscClient(siteId);
  const res = await sc.searchanalytics.query({
    siteUrl: getSiteUrl(siteId),
    requestBody: {
      startDate: daysAgo(28),
      endDate: today(),
      dimensions: ["page"],
      dimensionFilterGroups: [
        {
          filters: [{ dimension: "page", operator: "equals", expression: url }],
        },
      ],
      rowLimit: 1,
    },
  });
  const row = (res.data.rows ?? [])[0];
  if (!row) {
    return {
      site_id: siteId,
      url,
      clicks: 0,
      impressions: 0,
      ctr_pct: 0,
      avg_position: null,
    };
  }
  return {
    site_id: siteId,
    url,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr_pct: Math.round((row.ctr ?? 0) * 10000) / 100,
    avg_position: Math.round((row.position ?? 0) * 10) / 10,
  };
}

async function updatePageMeta(args: Record<string, unknown>) {
  // ── PERMANENT GUARD: never publish ───────────────────────────────────
  if (args.status === "publish" || args.post_status === "publish") {
    throw new Error(
      "FORBIDDEN: update_page_meta must never publish posts. Remove status=publish from the request.",
    );
  }

  const siteId = args.site_id as number;
  const url = args.url as string;
  const title = args.title as string | undefined;
  const description = args.description as string | undefined;
  if (!title && !description)
    throw new Error("At least one of title or description is required.");

  const wp = buildWpClient(siteId);
  const post = await findPostByUrl(wp, url);

  const payload: Record<string, unknown> = {};
  if (title) {
    payload.title = title;
    payload.meta = { _yoast_wpseo_title: title };
  }
  if (description) {
    payload.meta = {
      ...((payload.meta as object) ?? {}),
      _yoast_wpseo_metadesc: description,
    };
  }

  // Second guard: ensure the built payload never contains publish
  if (payload.status === "publish") {
    throw new Error(
      "FORBIDDEN: payload contains status=publish — this operation is not allowed.",
    );
  }

  const updated = await wp.patch<WpPost>(`/posts/${post.id}`, payload);
  return {
    site_id: siteId,
    id: post.id,
    url: updated.link,
    title_updated: !!title,
    description_updated: !!description,
    status: updated.status,
  };
}

async function getImpressionsVsCtr(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const days = (args.days as number | undefined) ?? 28;
  const minImpressions = (args.min_impressions as number | undefined) ?? 100;
  const maxCtrPct = (args.max_ctr_pct as number | undefined) ?? 3;
  const sc = buildGscClient(siteId);
  const res = await sc.searchanalytics.query({
    siteUrl: getSiteUrl(siteId),
    requestBody: {
      startDate: daysAgo(days),
      endDate: today(),
      dimensions: ["page"],
      rowLimit: 5000,
    },
  });

  const opportunities = (res.data.rows ?? [])
    .map((row) => ({
      url: row.keys?.[0] ?? "",
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr_pct: Math.round((row.ctr ?? 0) * 10000) / 100,
      avg_position: Math.round((row.position ?? 0) * 10) / 10,
    }))
    .filter((r) => r.impressions >= minImpressions && r.ctr_pct < maxCtrPct)
    .sort((a, b) => b.impressions - a.impressions);

  return {
    site_id: siteId,
    days,
    filters: { min_impressions: minImpressions, max_ctr_pct: maxCtrPct },
    total: opportunities.length,
    opportunities,
  };
}

// ── MCP Server factory ────────────────────────────────────────────────
function createServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_page",
        description:
          "Fetch a WordPress page/post by URL. Returns title, meta description, body HTML, JSON-LD schema, and last modified date.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID (1=lifecircle.in)",
            },
            url: {
              type: "string",
              description: "Full URL of the page to fetch",
            },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "list_pages",
        description:
          "List published WordPress pages/posts with their GSC metrics (impressions, clicks, CTR, position). Supports pagination.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID (1=lifecircle.in)",
            },
            limit: {
              type: "number",
              description: "Pages per page (default: 20)",
            },
            offset: {
              type: "number",
              description: "Pagination offset (default: 0)",
            },
          },
          required: ["site_id"],
        },
      },
      {
        name: "get_page_metrics",
        description:
          "Get GSC metrics (impressions, clicks, CTR, avg position) for a specific page URL over the last 28 days.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID (1=lifecircle.in)",
            },
            url: { type: "string", description: "Full URL of the page" },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "update_page_meta",
        description:
          "Update the SEO title and/or meta description of a WordPress page/post via the REST API. NEVER sets post status to publish.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID (1=lifecircle.in)",
            },
            url: {
              type: "string",
              description: "Full URL of the page to update",
            },
            title: { type: "string", description: "New SEO title" },
            description: {
              type: "string",
              description: "New meta description",
            },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "get_impressions_vs_ctr",
        description:
          "Find pages with high impressions but low CTR (below threshold) — content improvement opportunities. Returns pages sorted by impressions descending.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID (1=lifecircle.in)",
            },
            days: {
              type: "number",
              description: "Date range in days (default: 28)",
            },
            min_impressions: {
              type: "number",
              description: "Minimum impressions to include (default: 100)",
            },
            max_ctr_pct: {
              type: "number",
              description: "Maximum CTR % to include (default: 3.0)",
            },
          },
          required: ["site_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args ?? {}) as Record<string, unknown>;
    try {
      switch (name) {
        case "get_page":
          console.log("========== GET PAGES ==========");
          return {
            content: [{ type: "text", text: JSON.stringify(await getPage(a)) }],
          };
        case "list_pages":
          console.log("========== LIST PAGES ==========");
          return {
            content: [
              { type: "text", text: JSON.stringify(await listPages(a)) },
            ],
          };
        case "get_page_metrics":
          console.log("========== GET PAGE METRICS ==========");
          return {
            content: [
              { type: "text", text: JSON.stringify(await getPageMetrics(a)) },
            ],
          };
        case "update_page_meta":
          console.log("========== UPDATE PAGE META ==========");
          return {
            content: [
              { type: "text", text: JSON.stringify(await updatePageMeta(a)) },
            ],
          };
        case "get_impressions_vs_ctr":
          console.log("========== GET IMPRESSIONS VS CTR ==========");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getImpressionsVsCtr(a)),
              },
            ],
          };
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: String(error) }) },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// ── Streamable HTTP server ────────────────────────────────────────────
const cms_connector_path = express();
cms_connector_path.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

cms_connector_path.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request" },
        id: null,
      });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport!);
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) transports.delete(transport!.sessionId);
    };
    await createServer().connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});

cms_connector_path.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
  res.on("close", () => clearInterval(keepAlive));
  await transport.handleRequest(req, res);
});

cms_connector_path.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
});

cms_connector_path.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    server: SERVER_NAME,
    transports: Array.from(transports.keys()),
  }),
);

export { createServer };
export default cms_connector_path;
