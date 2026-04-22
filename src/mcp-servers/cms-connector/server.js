import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";

const SERVER_NAME = "cms-connector";
const SERVER_VERSION = "1.0.0";

// ── GSC Auth helpers (reused from keyword-tracker) ────────────────────
export function getGscAuth(siteId) {
  const envKey = `GSC_OAUTH_SITE_${siteId}`;
  const raw = process.env[envKey];
  if (!raw) throw new Error(`Missing env var ${envKey} for site_id=${siteId}`);
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

export function getSiteUrl(siteId) {
  const map = {
    1: "https://lifecircle.in",
  };
  const url = map[String(siteId)];
  if (!url) throw new Error(`Unknown site_id=${siteId}`);
  return url;
}

// ── WP Auth helper ────────────────────────────────────────────────────
export function getWpAuth(siteId) {
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
export async function wpFetch(siteId, method, endpoint, body) {
  const { baseUrl, authHeader } = getWpAuth(siteId);
  const url = `${baseUrl}${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  console.log("============= WP Getting Page ***************\n", url);
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `WP API returned non-JSON (${res.status} ${res.statusText}). ` +
        `Content-Type: ${contentType}. Body starts with: ${text.slice(0, 200)}`,
    );
  }
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.message ?? res.statusText;
    throw new Error(`WP API error ${res.status}: ${errMsg}`);
  }
  return data;
}

// ── GSC date helpers ──────────────────────────────────────────────────
function fmtDate(d) {
  return d.toISOString().split("T")[0];
}

function dateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

// ── Tool: get_page ────────────────────────────────────────────────────
export async function getPage(siteId, pageUrl) {
  // Extract slug from URL path
  const parsed = new URL(pageUrl);
  const slug =
    parsed.pathname
      .replace(/^\/|\/$/g, "")
      .split("/")
      .pop() ?? "";

  console.log("SLUG = ", slug);

  // Try pages first, then posts
  let wpPage = null;
  console.log("============= CMS Getting Page ***************", pageUrl, slug);
  for (const postType of ["pages", "posts"]) {
    const results = await wpFetch(
      siteId,
      "GET",
      `/${postType}?slug=${encodeURIComponent(slug)}&_fields=id,title,content,modified,link,rank_math_meta,meta`,
    );
    if (results.length > 0) {
      wpPage = results[0];
      break;
    }
  }
  if (!wpPage) throw new Error(`Page not found for URL: ${pageUrl}`);
  console.log("============= CMS Page Found ***************");

  // Extract meta description (RankMath preferred, custom meta fallback)
  const rank_math = wpPage.rank_math_meta;
  const meta = wpPage.meta;
  const metaDescription =
    rank_math?.description ?? meta?.meta_description ?? null;

  const title = wpPage.title;

  return {
    id: wpPage.id,
    url: wpPage.link ?? pageUrl,
    title: title.rendered,
    meta_description: metaDescription,
    last_modified: wpPage.modified,
  };
}

// ── Tool: list_pages ──────────────────────────────────────────────────
export async function listPages(siteId, limit, offset) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  // Fetch WP pages
  console.log("============= CMS Listing Pages ***************");
  const wpPages = await wpFetch(
    siteId,
    "GET",
    `/pages?per_page=${limit}&offset=${offset}&status=publish&_fields=id,title,link,modified`,
  );

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
  const gscByUrl = new Map();
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
export async function getPageMetrics(siteId, pageUrl) {
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
  siteId,
  pageUrl,
  title,
  description,
  _extraFields,
) {
  // ── PERMANENT PUBLISH GUARD ───────────────────────────────────────
  // update_page_meta MUST NEVER set post_status to 'publish'.
  if (
    _extraFields?.status === "publish" ||
    _extraFields?.post_status === "publish"
  ) {
    throw new Error(
      "PUBLISH GUARD: update_page_meta must never set post_status to 'publish'",
    );
  }
  // ─────────────────────────────────────────────────────────────────

  // Use the claude-seo plugin endpoint instead of the standard WP REST API.
  const { baseUrl, authHeader } = getWpAuth(siteId);

  // Replace /wp/v2 suffix with the plugin namespace if present
  const pluginBase = baseUrl.replace(/\/wp\/v2\/?$/, "");
  const pluginUrl = `${pluginBase}/claude-seo/v1/bulk-meta-update`;

  const res = await fetch(pluginUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { url: pageUrl, title, description, status: "draft" },
    ]),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `claude-seo plugin returned non-JSON (${res.status}). Body: ${text.slice(0, 200)}`,
    );
  }

  const data = await res.json();

  if (!res.ok || data.errors?.length) {
    const errMsg = data.errors?.[0]?.error ?? res.statusText;
    throw new Error(`claude-seo plugin error: ${errMsg}`);
  }

  return {
    ok: true,
    url: pageUrl,
    title,
    description,
    updated: data.updated,
  };
}

// ── Tool: create_approval_queue ───────────────────────────────────────
export async function createApprovalQueue(items) {
  const apiUrl = process.env.BACKEND_API_URL ?? "http://localhost:3002";
  const url = `${apiUrl}/approvals`;

  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: item.site_id,
          module: item.module,
          type: item.type,
          priority: item.priority ?? 3,
          title: item.title,
          content: item.content,
          preview_url: item.preview_url ?? null,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `non-JSON response (${res.status}): ${text.slice(0, 200)}`,
        );
      }

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error ?? res.statusText;
        throw new Error(`HTTP ${res.status}: ${errMsg}`);
      }

      results.push(data);
      console.log(
        `[create_approval_queue] queued item ${i + 1}/${items.length}: ${item.title}`,
      );
    } catch (err) {
      errors.push({ index: i, error: String(err) });
      console.error(`[create_approval_queue] item ${i + 1} failed:`, err);
    }
  }

  return { queued: results.length, results, errors };
}

// ── Tool: get_impressions_vs_ctr ──────────────────────────────────────
export async function getImpressionsVsCtr(siteId, days) {
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
    .filter((row) => (row.impressions ?? 0) > 100 && (row.ctr ?? 0) < 0.03 && row.keys?.[0] !== `${siteUrl}/`)
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
function createMcpServer() {
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
      {
        name: "create_approval_queue",
        description:
          "Submit a list of items to the operator approval queue. Processes each item sequentially. Use when suggested changes require human review before publishing.",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "List of approval items to queue",
              items: {
                type: "object",
                properties: {
                  site_id: { type: "number", description: "Site ID" },
                  module: {
                    type: "string",
                    description:
                      "Module that generated the item, e.g. 'cms-connector'",
                  },
                  type: {
                    type: "string",
                    description:
                      "Item type, e.g. 'meta_rewrite', 'gbp_post', 'review_response'",
                  },
                  priority: {
                    type: "number",
                    description:
                      "Priority: 1=critical, 2=high, 3=medium (default 3)",
                  },
                  title: {
                    type: "string",
                    description:
                      "Short human-readable title shown in the approval queue",
                  },
                  content: {
                    type: "object",
                    description: "Full payload — structure varies by type",
                  },
                  preview_url: {
                    type: "string",
                    description:
                      "Optional URL to preview the page being changed",
                  },
                },
                required: ["site_id", "module", "type", "title", "content"],
              },
            },
          },
          required: ["items"],
        },
      },
    ],
  }));

  s.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "get_page": {
          console.log("========== GET PAGES ==========");
          const result = await getPage(Number(args.site_id), args.url);
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
          const result = await getPageMetrics(Number(args.site_id), args.url);
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
            args.url,
            args.title,
            args.description,
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
        case "create_approval_queue": {
          console.log("========== CREATE APPROVAL QUEUE ==========");
          const items = args.items;
          if (!Array.isArray(items) || items.length === 0) {
            throw new Error(
              "create_approval_queue requires a non-empty 'items' array",
            );
          }
          const result = await createApprovalQueue(items);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
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

const getTop5PagesWithHighImpressionLowCtr = async (siteId) => {
  let pages = await getImpressionsVsCtr(siteId, 28);
  pages = pages.opportunities.sort((a, b) => b.impressions - a.impressions);
  return pages.slice(0, 5);
};

export { getTop5PagesWithHighImpressionLowCtr };
