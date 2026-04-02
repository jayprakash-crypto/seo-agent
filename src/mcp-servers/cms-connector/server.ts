import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { google } from "googleapis";

const SERVER_NAME = "cms-connector";
const SERVER_VERSION = "1.0.0";

// ── GSC Auth helpers (reused from keyword-tracker) ────────────────────
export function getGscAuth(siteId: number | string) {
  const envKey = `GSC_OAUTH_SITE_${siteId}`;
  const raw = process.env[envKey];
  if (!raw) throw new Error(`Missing env var ${envKey} for site_id=${siteId}`);
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

export function getSiteUrl(siteId: number | string): string {
  const map: Record<string, string> = {
    "1": "https://lifecircle.in",
  };
  const url = map[String(siteId)];
  if (!url) throw new Error(`Unknown site_id=${siteId}`);
  return url;
}

// ── WP Auth helper ────────────────────────────────────────────────────
export function getWpAuth(siteId: number | string): {
  baseUrl: string;
  authHeader: string;
} {
  const urlKey = `CMS_API_URL_SITE_${siteId}`;
  const keyKey = `CMS_API_KEY_SITE_${siteId}`;
  const baseUrl = process.env[urlKey]?.trim();
  const apiKey = process.env[keyKey]?.trim();
  if (!baseUrl) throw new Error(`Missing env var ${urlKey}`);
  if (!apiKey) throw new Error(`Missing env var ${keyKey}`);
  // apiKey format: "username:application_password"
  const authHeader = `Basic ${Buffer.from(apiKey).toString("base64")}`;
  return { baseUrl, authHeader };
}

// ── WP REST API fetch helper ──────────────────────────────────────────
export async function wpFetch(
  siteId: number | string,
  method: string,
  endpoint: string,
  body?: object,
): Promise<unknown> {
  const { baseUrl, authHeader } = getWpAuth(siteId);
  const url = `${baseUrl}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  console.log("============= WP Getting Page ***************\n", url);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const errMsg = (data as { message?: string }).message ?? res.statusText;
    throw new Error(`WP API error ${res.status}: ${errMsg}`);
  }
  return data;
}

// ── GSC date helpers ──────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

// ── Tool: get_page ────────────────────────────────────────────────────
export async function getPage(siteId: number, pageUrl: string) {
  // Extract slug from URL path
  const parsed = new URL(pageUrl);
  const slug =
    parsed.pathname
      .replace(/^\/|\/$/g, "")
      .split("/")
      .pop() ?? "";

  // Try pages first, then posts
  let wpPage: Record<string, unknown> | null = null;
  console.log("============= CMS Getting Page ***************", pageUrl, slug);
  for (const postType of ["pages", "posts"]) {
    const results = (await wpFetch(
      siteId,
      "GET",
      `/${postType}?slug=${encodeURIComponent(slug)}&_fields=id,title,content,modified,link,rank_math_meta,meta`,
    )) as Record<string, unknown>[];
    if (results.length > 0) {
      wpPage = results[0];
      break;
    }
  }
  if (!wpPage) throw new Error(`Page not found for URL: ${pageUrl}`);
  console.log("============= CMS Page Found ***************");

  // Extract meta description (RankMath preferred, custom meta fallback)
  const rank_math = wpPage.rank_math_meta as
    | Record<string, unknown>
    | undefined
    | null;
  const meta = wpPage.meta as Record<string, unknown> | undefined | null;
  const metaDescription =
    (rank_math?.description as string | undefined) ??
    (meta?.meta_description as string | undefined) ??
    null;

  // Extract JSON-LD schema from page HTML (best-effort)
  // let schema: unknown = null;
  // try {
  //   const html = await fetch(pageUrl).then((r) => r.text());
  //   const schemaMatches = [
  //     ...html.matchAll(
  //       /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  //     ),
  //   ];
  //   if (schemaMatches.length > 0) {
  //     schema =
  //       schemaMatches.length === 1
  //         ? JSON.parse(schemaMatches[0][1])
  //         : schemaMatches.map((m) => JSON.parse(m[1]));
  //   }
  // } catch {
  //   schema = null;
  // }

  const title = wpPage.title as { rendered: string };
  const content = wpPage.content as { rendered: string };

  return {
    id: wpPage.id as number,
    url: (wpPage.link as string) ?? pageUrl,
    title: title.rendered,
    meta_description: metaDescription,
    // schema,
    last_modified: wpPage.modified as string,
  };
}

// ── Tool: list_pages ──────────────────────────────────────────────────
export async function listPages(siteId: number, limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  // Fetch WP pages
  console.log("============= CMS Listing Pages ***************");
  const wpPages = (await wpFetch(
    siteId,
    "GET",
    `/pages?per_page=${limit}&offset=${offset}&status=publish&_fields=id,title,link,modified`,
  )) as Array<{
    id: number;
    title: { rendered: string };
    link: string;
    modified: string;
  }>;

  // Fetch GSC metrics for all pages in a single query (last 28 days)
  const auth = getGscAuth(siteId);
  const siteUrl = getSiteUrl(siteId);
  const searchConsole = google.searchconsole({ version: "v1", auth });
  const { startDate, endDate } = dateRange(28);

  const gscResponse = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 1000,
    },
  });

  // Build URL → GSC metrics map
  type GscRow = {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number | null;
  };
  const gscByUrl = new Map<string, GscRow>();
  for (const row of gscResponse.data.rows ?? []) {
    const pageKey = row.keys?.[0] ?? "";
    gscByUrl.set(pageKey, {
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? null,
    });
  }

  const pages = wpPages.map((page) => {
    const gsc = gscByUrl.get(page.link) ?? {
      impressions: 0,
      clicks: 0,
      ctr: 0,
      position: null,
    };
    return {
      id: page.id,
      url: page.link,
      title: page.title.rendered,
      modified: page.modified,
      impressions: gsc.impressions,
      clicks: gsc.clicks,
      ctr: gsc.ctr,
      position: gsc.position,
    };
  });

  return { site_id: siteId, total: wpPages.length, offset, pages };
}

// ── Tool: get_page_metrics ────────────────────────────────────────────
export async function getPageMetrics(siteId: number, pageUrl: string) {
  const auth = getGscAuth(siteId);
  const siteUrl = getSiteUrl(siteId);
  const searchConsole = google.searchconsole({ version: "v1", auth });
  const { startDate, endDate } = dateRange(28);

  console.log("============= CMS Getting Page Metrics ***************");
  const response = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "page", operator: "equals", expression: pageUrl },
          ],
        },
      ],
      rowLimit: 1,
    },
  });

  const row = response.data.rows?.[0];
  return {
    site_id: siteId,
    url: pageUrl,
    impressions: row?.impressions ?? 0,
    clicks: row?.clicks ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? null,
    date_range: { startDate, endDate },
  };
}

// ── Tool: update_page_meta ────────────────────────────────────────────
export async function updatePageMeta(
  siteId: number,
  pageUrl: string,
  title: string,
  description: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _extraFields?: Record<string, any>,
) {
  // Build update payload — intentionally never includes 'status'
  // Rank Math stores meta description in 'rank_math_description' post meta.
  const payload: Record<string, unknown> = {
    title,
    meta: { rank_math_description: description },
  };

  // Merge extra fields (used in tests to verify the publish guard)
  if (_extraFields) Object.assign(payload, _extraFields);

  // ── PERMANENT PUBLISH GUARD ───────────────────────────────────────
  // update_page_meta MUST NEVER set post_status to 'publish'.
  // This guard is a hard stop regardless of how the function is called.
  if (payload.status === "publish" || payload.post_status === "publish") {
    throw new Error(
      "PUBLISH GUARD: update_page_meta must never set post_status to 'publish'",
    );
  }
  // ─────────────────────────────────────────────────────────────────

  // Resolve page ID by URL
  const page = await getPage(siteId, pageUrl);

  // PUT to WP REST API
  const updated = (await wpFetch(
    siteId,
    "PUT",
    `/pages/${page.id}`,
    payload,
  )) as { id: number; link: string; title: { rendered: string } };

  return {
    ok: true,
    id: updated.id,
    url: updated.link,
    title: updated.title.rendered,
  };
}

// ── Tool: get_impressions_vs_ctr ──────────────────────────────────────
export async function getImpressionsVsCtr(siteId: number, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("days must be an integer between 1 and 90");
  }

  const auth = getGscAuth(siteId);
  const siteUrl = getSiteUrl(siteId);
  const searchConsole = google.searchconsole({ version: "v1", auth });
  const { startDate, endDate } = dateRange(days);

  const response = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 1000,
    },
  });

  // Pages with high impressions but low CTR = content improvement opportunities
  const opportunities = (response.data.rows ?? [])
    .filter((row) => (row.impressions ?? 0) > 100 && (row.ctr ?? 0) < 0.03)
    .map((row) => ({
      url: row.keys?.[0] ?? "",
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? null,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return {
    site_id: siteId,
    days,
    threshold: { min_impressions: 100, max_ctr: 0.03 },
    opportunities,
  };
}

// ── MCP Server factory ────────────────────────────────────────────────
function createMcpServer(): Server {
  const s = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  s.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_page",
        description:
          "Fetch a WordPress page's title, meta description, body HTML, JSON-LD schema, and last modified date.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            url: { type: "string", description: "Full URL of the page" },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "list_pages",
        description:
          "Return a paginated list of published WordPress pages enriched with GSC impressions, clicks, CTR, and average position.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            limit: {
              type: "number",
              description: "Max pages to return (1–100, default 20)",
            },
            offset: {
              type: "number",
              description: "Pagination offset (default 0)",
            },
          },
          required: ["site_id"],
        },
      },
      {
        name: "get_page_metrics",
        description:
          "Return GSC impressions, clicks, CTR, and average position for a specific page URL over the last 28 days.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            url: { type: "string", description: "Full URL of the page" },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "update_page_meta",
        description:
          "Update a WordPress page's title and meta description. NEVER sets post status — the publish guard prevents status=publish from being sent.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            url: { type: "string", description: "Full URL of the page" },
            title: { type: "string", description: "New page title" },
            description: {
              type: "string",
              description: "New meta description",
            },
          },
          required: ["site_id", "url", "title", "description"],
        },
      },
      {
        name: "get_impressions_vs_ctr",
        description:
          "Return pages where impressions > 100 but CTR < 3%, sorted by impressions descending. Identifies content improvement opportunities.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            days: {
              type: "number",
              description: "Lookback window in days (1–90)",
            },
          },
          required: ["site_id", "days"],
        },
      },
    ],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "get_page": {
          console.log("========== GET PAGES ==========");
          const result = await getPage(
            Number(args.site_id),
            args.url as string,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "list_pages": {
          console.log("========== LIST PAGES ==========");
          const result = await listPages(
            Number(args.site_id),
            Number(args.limit ?? 20),
            Number(args.offset ?? 0),
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "get_page_metrics": {
          console.log("========== GET PAGE METRICS ==========");
          const result = await getPageMetrics(
            Number(args.site_id),
            args.url as string,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "update_page_meta": {
          console.log("========== UPDATE PAGE META ==========");
          // PUBLISH GUARD at handler level (belt-and-suspenders)
          if (args.status === "publish" || args.post_status === "publish") {
            throw new Error(
              "PUBLISH GUARD: update_page_meta must never set post_status to 'publish'",
            );
          }
          const result = await updatePageMeta(
            Number(args.site_id),
            args.url as string,
            args.title as string,
            args.description as string,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "get_impressions_vs_ctr": {
          const result = await getImpressionsVsCtr(
            Number(args.site_id),
            Number(args.days),
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
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

  return s;
}

// ── HTTP server ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: expected initialize" },
          id: null,
        });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await createMcpServer().connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) =>
  res.status(405).set("Allow", "POST").send("Method Not Allowed"),
);

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId) {
    const t = transports.get(sessionId);
    if (t) {
      await t.close();
      transports.delete(sessionId);
    }
  }
  res.status(200).send("OK");
});

app.get("/health", (_req, res) =>
  res.json({ status: "ok", server: SERVER_NAME }),
);

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`${SERVER_NAME} running on port ${PORT}`));
}
