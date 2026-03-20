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

const SERVER_NAME = "keyword-tracker";
const SERVER_VERSION = "1.0.0";

// ── Site config (add new sites as env vars are added) ─────────────────
const SITE_DOMAINS: Record<number, string> = {
  1: "https://lifecircle.in",
};

function getSiteUrl(siteId: number): string {
  const domain = SITE_DOMAINS[siteId];
  if (!domain) {
    throw new Error(
      `Unknown site_id: ${siteId}. Valid IDs: ${Object.keys(SITE_DOMAINS).join(", ")}`,
    );
  }
  return domain;
}

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
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function today(): string {
  return formatDate(new Date());
}

// ── Tool implementations ──────────────────────────────────────────────

async function getRankings(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const startDate = (args.start_date as string | undefined) ?? daysAgo(7);
  const endDate = (args.end_date as string | undefined) ?? today();
  const limit = (args.limit as number | undefined) ?? 100;

  console.log("============= GSC Auth *************** site_id:", siteId);
  const sc = buildGscClient(siteId);
  console.log("============= Site Query ***************");
  const res = await sc.searchanalytics.query({
    siteUrl: getSiteUrl(siteId),
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: limit,
    },
  });

  console.log("============= Get Rankings ***************");
  const rankings = (
    (res.data.rows ?? []) as Array<{
      keys?: string[];
      position?: number;
      clicks?: number;
      impressions?: number;
      ctr?: number;
    }>
  )
    .map((row) => ({
      keyword: row.keys?.[0] ?? "",
      position: Math.round((row.position ?? 0) * 10) / 10,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr_pct: Math.round((row.ctr ?? 0) * 10000) / 100,
    }))
    .sort((a, b) => a.position - b.position);

  console.log("======== Keywords Ranking ========");
  console.log(rankings);
  console.log("==================================");

  return {
    site_id: siteId,
    date_range: { start: startDate, end: endDate },
    total: rankings.length,
    rankings,
  };
}

async function getRankingHistory(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const keyword = args.keyword as string;
  const days = (args.days as number | undefined) ?? 90;

  const sc = buildGscClient(siteId);
  const res = await sc.searchanalytics.query({
    siteUrl: getSiteUrl(siteId),
    requestBody: {
      startDate: daysAgo(days),
      endDate: today(),
      dimensions: ["query", "date"],
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "query", operator: "equals", expression: keyword },
          ],
        },
      ],
      rowLimit: 1000,
    },
  });

  const history = (res.data.rows ?? [])
    .map((row) => ({
      date: row.keys?.[1] ?? "",
      position: Math.round((row.position ?? 0) * 10) / 10,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr_pct: Math.round((row.ctr ?? 0) * 10000) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { site_id: siteId, keyword, days, history };
}

async function getTopMovers(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const days = (args.days as number | undefined) ?? 7;
  const limit = (args.limit as number | undefined) ?? 20;
  const direction = (args.direction as string | undefined) ?? "both";

  const siteUrl = getSiteUrl(siteId);
  const sc = buildGscClient(siteId);

  const [currentRes, previousRes] = await Promise.all([
    sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: daysAgo(days),
        endDate: today(),
        dimensions: ["query"],
        rowLimit: 1000,
      },
    }),
    sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: daysAgo(days * 2),
        endDate: daysAgo(days + 1),
        dimensions: ["query"],
        rowLimit: 1000,
      },
    }),
  ]);

  const currentMap = new Map<string, number>();
  for (const row of currentRes.data.rows ?? []) {
    currentMap.set(row.keys?.[0] ?? "", row.position ?? 0);
  }

  const previousMap = new Map<string, number>();
  for (const row of previousRes.data.rows ?? []) {
    previousMap.set(row.keys?.[0] ?? "", row.position ?? 0);
  }

  type Mover = {
    keyword: string;
    current_position: number;
    previous_position: number;
    change: number; // positive = improved (position number decreased)
  };

  const movers: Mover[] = [];
  for (const [keyword, currentPos] of currentMap) {
    const prevPos = previousMap.get(keyword);
    if (prevPos === undefined) continue; // skip new entries
    const change = Math.round((prevPos - currentPos) * 10) / 10;
    movers.push({
      keyword,
      current_position: Math.round(currentPos * 10) / 10,
      previous_position: Math.round(prevPos * 10) / 10,
      change,
    });
  }

  const filtered =
    direction === "up"
      ? movers.filter((m) => m.change > 0)
      : direction === "down"
        ? movers.filter((m) => m.change < 0)
        : movers;

  const sorted = filtered
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit);

  return { site_id: siteId, period_days: days, direction, movers: sorted };
}

async function getRankVelocity(args: Record<string, unknown>) {
  const siteId = args.site_id as number;
  const keyword = args.keyword as string | undefined;
  const days = (args.days as number | undefined) ?? 30;
  const limit = (args.limit as number | undefined) ?? 10;

  const sc = buildGscClient(siteId);
  const res = await sc.searchanalytics.query({
    siteUrl: getSiteUrl(siteId),
    requestBody: {
      startDate: daysAgo(days),
      endDate: today(),
      dimensions: ["query", "date"],
      ...(keyword
        ? {
            dimensionFilterGroups: [
              {
                filters: [
                  {
                    dimension: "query",
                    operator: "equals",
                    expression: keyword,
                  },
                ],
              },
            ],
          }
        : {}),
      rowLimit: 25000,
    },
  });

  // Group daily positions by keyword
  const keywordData = new Map<
    string,
    Array<{ date: string; position: number }>
  >();
  for (const row of res.data.rows ?? []) {
    const kw = row.keys?.[0] ?? "";
    const date = row.keys?.[1] ?? "";
    if (!keywordData.has(kw)) keywordData.set(kw, []);
    keywordData.get(kw)!.push({ date, position: row.position ?? 0 });
  }

  // Linear regression slope = position change per day
  // Negative slope = improving (position number goes down = ranking higher)
  const velocities = Array.from(keywordData.entries()).map(([kw, points]) => {
    const sorted = points.sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;

    if (n < 2) {
      return { keyword: kw, velocity: 0, trend: "stable", data_points: n };
    }

    const xs = sorted.map((_, i) => i);
    const ys = sorted.map((d) => d.position);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    const velocity = Math.round(slope * 100) / 100;
    const trend =
      Math.abs(velocity) < 0.1
        ? "stable"
        : velocity < 0
          ? "improving"
          : "declining";

    return { keyword: kw, velocity, trend, data_points: n };
  });

  const result = velocities
    .sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity))
    .slice(0, limit);

  return { site_id: siteId, days, keywords: result };
}

// ── MCP Server ────────────────────────────────────────────────────────

export const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_rankings",
      description:
        "Get current keyword rankings for a site from Google Search Console. Returns position, clicks, impressions, and CTR for each keyword.",
      inputSchema: {
        type: "object",
        properties: {
          site_id: { type: "number", description: "Site ID (1=lifecircle.in)" },
          start_date: {
            type: "string",
            description: "Start date YYYY-MM-DD (default: 7 days ago)",
          },
          end_date: {
            type: "string",
            description: "End date YYYY-MM-DD (default: today)",
          },
          limit: {
            type: "number",
            description: "Max keywords to return (default: 100)",
          },
        },
        required: ["site_id"],
      },
    },
    {
      name: "get_ranking_history",
      description:
        "Get daily position history for a specific keyword from Google Search Console.",
      inputSchema: {
        type: "object",
        properties: {
          site_id: {
            type: "number",
            description: "Site ID (1=resume-82552.web.app)",
          },
          keyword: {
            type: "string",
            description: "Exact keyword to retrieve history for",
          },
          days: {
            type: "number",
            description: "Number of days back to fetch (default: 90)",
          },
        },
        required: ["site_id", "keyword"],
      },
    },
    {
      name: "get_top_movers",
      description:
        "Get keywords with the biggest position changes between the current period and the previous period of the same length.",
      inputSchema: {
        type: "object",
        properties: {
          site_id: {
            type: "number",
            description: "Site ID (1=resume-82552.web.app)",
          },
          days: {
            type: "number",
            description: "Period length in days to compare (default: 7)",
          },
          limit: {
            type: "number",
            description: "Max keywords to return (default: 20)",
          },
          direction: {
            type: "string",
            enum: ["up", "down", "both"],
            description: "Filter by direction of movement (default: both)",
          },
        },
        required: ["site_id"],
      },
    },
    {
      name: "get_rank_velocity",
      description:
        "Calculate ranking velocity (position change per day) using linear regression over a date range. Negative velocity = improving rank.",
      inputSchema: {
        type: "object",
        properties: {
          site_id: {
            type: "number",
            description: "Site ID (1=resume-82552.web.app)",
          },
          keyword: {
            type: "string",
            description:
              "Specific keyword to analyse (omit for top movers by velocity)",
          },
          days: {
            type: "number",
            description: "Date range in days (default: 30)",
          },
          limit: {
            type: "number",
            description:
              "Max keywords to return when no keyword is specified (default: 10)",
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
      case "get_rankings":
        console.log("========== GET RANKINGS ==========");
        return {
          content: [
            { type: "text", text: JSON.stringify(await getRankings(a)) },
          ],
        };
      case "get_ranking_history":
        return {
          content: [
            { type: "text", text: JSON.stringify(await getRankingHistory(a)) },
          ],
        };
      case "get_top_movers":
        return {
          content: [
            { type: "text", text: JSON.stringify(await getTopMovers(a)) },
          ],
        };
      case "get_rank_velocity":
        return {
          content: [
            { type: "text", text: JSON.stringify(await getRankVelocity(a)) },
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

// ── Streamable HTTP server ────────────────────────────────────────────

const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
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
    await server.connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
});

app.get("/health", (_req, res) =>
  res.json({ status: "ok", server: SERVER_NAME }),
);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`${SERVER_NAME} running on port ${PORT}`));
