import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const SERVER_NAME = "schema-manager";
const SERVER_VERSION = "1.0.0";

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
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const errMsg = (data as { message?: string }).message ?? res.statusText;
    throw new Error(`WP API error ${res.status}: ${errMsg}`);
  }
  return data;
}

// ── Page type detection ────────────────────────────────────────────────
export type PageType = "home" | "service" | "faq" | "blog" | "contact" | "default";

export const RECOMMENDED_SCHEMA: Record<PageType, string[]> = {
  home: ["Organization", "WebSite", "LocalBusiness"],
  service: ["Service", "LocalBusiness"],
  faq: ["FAQPage"],
  blog: ["BlogPosting", "Article"],
  contact: ["LocalBusiness", "ContactPage"],
  default: ["WebPage"],
};

export function detectPageType(url: string): PageType {
  const path = new URL(url).pathname.toLowerCase();
  if (path === "/" || path === "") return "home";
  if (path.includes("faq") || path.includes("question")) return "faq";
  if (path.includes("contact")) return "contact";
  if (
    path.includes("blog") ||
    path.includes("post") ||
    path.includes("article") ||
    path.includes("news")
  )
    return "blog";
  if (
    path.includes("service") ||
    path.includes("care") ||
    path.includes("solution") ||
    path.includes("treatment")
  )
    return "service";
  return "default";
}

// ── Tool: get_current_schema ──────────────────────────────────────────
export async function getCurrentSchema(siteId: number, pageUrl: string) {
  console.log("========== Fetching Current Schema **********\n", pageUrl);
  const html = await fetch(pageUrl).then((r) => r.text());
  const matches = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  const schemas: unknown[] = [];
  for (const m of matches) {
    try {
      schemas.push(JSON.parse(m[1]));
    } catch {
      // skip malformed blocks
    }
  }
  console.log("========== Current Schema Retrieved **********\n", pageUrl);

  return {
    site_id: siteId,
    url: pageUrl,
    schema_count: schemas.length,
    schemas,
  };
}

// ── Tool: get_paa_questions ───────────────────────────────────────────
export async function getPaaQuestions(siteId: number, keyword: string) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Missing env var SERPAPI_KEY");

  console.log("========== Calling SerpAPI **********");
  const serpUrl = `https://www.searchapi.io/api/v1/search?engine=google&q=${encodeURIComponent(keyword)}&api_key=${apiKey}&location="India"`;
  const res = await fetch(serpUrl);
  if (!res.ok) {
    throw new Error(`SerpAPI error ${res.status}: ${res.statusText}`);
  }
  console.log("========== SerpAPI Fetched **********");
  const data = (await res.json()) as {
    related_questions?: Array<{
      question: string;
      snippet?: string;
      answer?: string;
    }>;
  };

  const questions = (data.related_questions ?? []).map((q) => ({
    question: q.question,
    snippet: q.snippet ?? q.answer ?? null,
  }));

  return {
    site_id: siteId,
    keyword,
    questions_count: questions.length,
    questions,
  };
}

// ── Tool: suggest_schema_improvements ────────────────────────────────
export async function suggestSchemaImprovements(
  siteId: number,
  pageUrl: string,
) {
  console.log("========== Running Schema Improvement **********\n", pageUrl);
  const current = await getCurrentSchema(siteId, pageUrl);
  const pageType = detectPageType(pageUrl);
  const recommended = RECOMMENDED_SCHEMA[pageType];

  // Extract @type values from existing schemas
  const existingTypes = new Set<string>();
  for (const schema of current.schemas) {
    const s = schema as Record<string, unknown>;
    const t = s["@type"];
    if (typeof t === "string") existingTypes.add(t);
    else if (Array.isArray(t)) t.forEach((v) => existingTypes.add(String(v)));
  }

  const missing = recommended.filter((t) => !existingTypes.has(t));
  const extra = [...existingTypes].filter((t) => !recommended.includes(t));
  console.log("========== Schema Improvement Finish **********\n", pageUrl);

  return {
    site_id: siteId,
    url: pageUrl,
    page_type: pageType,
    existing_types: [...existingTypes],
    recommended_types: recommended,
    missing_types: missing,
    extra_types: extra,
    has_gaps: missing.length > 0,
    suggestions: missing.map((type) => ({
      action: "add",
      schema_type: type,
      reason: `${type} schema is recommended for ${pageType} pages but is missing`,
    })),
  };
}

// ── Tool: push_schema_to_page ─────────────────────────────────────────
export async function pushSchemaToPage(
  siteId: number,
  pageUrl: string,
  schemaJson: unknown,
) {
  // Resolve page ID by slug
  const parsed = new URL(pageUrl);
  const slug =
    parsed.pathname
      .replace(/^\/|\/$/g, "")
      .split("/")
      .pop() ?? "";

  let pageId: number | null = null;
  for (const postType of ["pages", "posts"]) {
    const results = (await wpFetch(
      siteId,
      "GET",
      `/${postType}?slug=${encodeURIComponent(slug)}&_fields=id`,
    )) as Array<{ id: number }>;
    if (results.length > 0) {
      pageId = results[0].id;
      break;
    }
  }
  if (!pageId) throw new Error(`Page not found for URL: ${pageUrl}`);

  // ── PERMANENT PUBLISH GUARD ───────────────────────────────────────
  // push_schema_to_page MUST NEVER set post_status to 'publish'.
  // Only meta is written — page status is never touched.
  const payload: Record<string, unknown> = {
    meta: { _seo_agent_schema: JSON.stringify(schemaJson) },
  };
  // ─────────────────────────────────────────────────────────────────

  const updated = (await wpFetch(
    siteId,
    "PUT",
    `/pages/${pageId}`,
    payload,
  )) as { id: number; link: string };

  return {
    ok: true,
    id: updated.id,
    url: updated.link,
    schema_stored: true,
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
        name: "get_current_schema",
        description:
          "Fetch a page by URL and extract all JSON-LD schema markup blocks. Returns parsed schema objects.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            url: { type: "string", description: "Full URL of the page to inspect" },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "get_paa_questions",
        description:
          "Call SerpAPI to retrieve People Also Ask (PAA) questions for a given keyword. Useful for FAQ schema generation.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            keyword: { type: "string", description: "Keyword to look up PAA questions for" },
          },
          required: ["site_id", "keyword"],
        },
      },
      {
        name: "suggest_schema_improvements",
        description:
          "Analyse a page's current JSON-LD schema against best-practice recommendations for its detected page type (home/service/faq/blog/contact). Returns missing schema types and actionable suggestions.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            url: { type: "string", description: "Full URL of the page to analyse" },
          },
          required: ["site_id", "url"],
        },
      },
      {
        name: "push_schema_to_page",
        description:
          "Write a JSON-LD schema object to a WordPress page via the REST API. Stores the schema in the '_seo_agent_schema' post meta field. NEVER publishes — only updates meta.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            url: { type: "string", description: "Full URL of the target page" },
            schema_json: {
              type: "object",
              description: "Schema.org JSON-LD object to store (e.g. FAQPage, Service, etc.)",
            },
          },
          required: ["site_id", "url", "schema_json"],
        },
      },
    ],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "get_current_schema": {
          console.log("============= FETCHING CURRENT SCHEMA ============");
          const result = await getCurrentSchema(
            Number(args.site_id),
            args.url as string,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "get_paa_questions": {
          console.log("============= FETCHING PAA QUESTIONS ============");
          const result = await getPaaQuestions(
            Number(args.site_id),
            args.keyword as string,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "suggest_schema_improvements": {
          console.log("============= SUGGESTING SCHEMA IMPROVEMENTS ============");
          const result = await suggestSchemaImprovements(
            Number(args.site_id),
            args.url as string,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "push_schema_to_page": {
          console.log("============= PUSHING SCHEMA TO PAGE ============");
          const result = await pushSchemaToPage(
            Number(args.site_id),
            args.url as string,
            args.schema_json as unknown,
          );
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
  res.json({ status: "ok", server: SERVER_NAME, transports: transports }),
);

export default app;
