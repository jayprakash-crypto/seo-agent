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

const SERVER_NAME = "keyword-tracker";
const SERVER_VERSION = "1.0.0";

// ── GSC Auth helper ────────────────────────────────────────────────────
export function getGscAuth(siteId: number | string) {
  const envKey = `GSC_OAUTH_SITE_${siteId}`;
  const raw = process.env[envKey];
  if (!raw) {
    throw new Error(`Missing env var ${envKey} for site_id=${siteId}`);
  }
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return auth;
}

export function getSiteUrl(siteId: number | string): string {
  const map: Record<string, string> = {
    "1": "https://lifecircle.in",
  };
  const url = map[String(siteId)];
  if (!url) throw new Error(`Unknown site_id=${siteId}`);
  return url;
}

export function validateSiteId(siteId: unknown): number {
  const id = Number(siteId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`Invalid site_id: ${siteId}. Must be a positive integer.`);
  }
  return id;
}

// ── Tool implementations ──────────────────────────────────────────────

export async function getRankings(siteId: number, keywords: string[]) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error("keywords must be a non-empty array");
  }

  console.log(
    "============= Ranking GSC Auth *************** site_id:",
    siteId,
  );
  const auth = getGscAuth(siteId);
  const siteUrl = getSiteUrl(siteId);
  const searchConsole = google.searchconsole({ version: "v1", auth });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  console.log("============= Ranking GSC Search Query ***************");
  const results = await Promise.all(
    keywords.map(async (keyword) => {
      const response = await searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query"],
          dimensionFilterGroups: [
            {
              filters: [
                { dimension: "query", operator: "equals", expression: keyword },
              ],
            },
          ],
          rowLimit: 1,
        },
      });

      const row = response.data.rows?.[0];
      return {
        keyword,
        position: row?.position ?? null,
        clicks: row?.clicks ?? 0,
        impressions: row?.impressions ?? 0,
        ctr: row?.ctr ?? 0,
      };
    }),
  );

  console.log(
    "============= GSC Search Query Results ***************",
    results.length,
  );
  return { site_id: siteId, site_url: siteUrl, rankings: results };
}

export async function getRankingHistory(
  siteId: number,
  keyword: string,
  days: number,
) {
  if (!keyword || typeof keyword !== "string") {
    throw new Error("keyword must be a non-empty string");
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("days must be an integer between 1 and 365");
  }

  console.log(
    "============= Ranking History GSC Auth *************** site_id:",
    siteId,
  );
  const auth = getGscAuth(siteId);
  const siteUrl = getSiteUrl(siteId);
  const searchConsole = google.searchconsole({ version: "v1", auth });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  console.log(
    "============= Ranking History GSC Search Query *************** site_id:",
    siteId,
  );
  const response = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ["query", "date"],
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "query", operator: "equals", expression: keyword },
          ],
        },
      ],
      rowLimit: days,
    },
  });

  const history = (response.data.rows ?? []).map((row) => ({
    date: row.keys?.[1] ?? "",
    position: row.position ?? null,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
  }));

  // Sort ascending by date
  history.sort((a, b) => a.date.localeCompare(b.date));
  console.log(
    "============= Ranking History GSC Results ***************",
    history.length,
  );

  return { site_id: siteId, site_url: siteUrl, keyword, days, history };
}

export async function getTopMovers(
  siteId: number,
  threshold: number,
  direction: "up" | "down" | "both",
) {
  if (typeof threshold !== "number" || threshold <= 0) {
    throw new Error("threshold must be a positive number");
  }
  if (!["up", "down", "both"].includes(direction)) {
    throw new Error('direction must be "up", "down", or "both"');
  }

  console.log("============= Top GSC Auth *************** site_id:", siteId);
  const auth = getGscAuth(siteId);
  const siteUrl = getSiteUrl(siteId);
  const searchConsole = google.searchconsole({ version: "v1", auth });

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // Current period: last 7 days
  const endCurrent = new Date();
  const startCurrent = new Date();
  startCurrent.setDate(endCurrent.getDate() - 7);

  // Previous period: 8–14 days ago
  const endPrev = new Date();
  endPrev.setDate(endPrev.getDate() - 8);
  const startPrev = new Date();
  startPrev.setDate(endPrev.getDate() - 6);

  console.log("============ Top GSC Search Query ***************");
  const [currentRes, prevRes] = await Promise.all([
    searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(startCurrent),
        endDate: fmt(endCurrent),
        dimensions: ["query"],
        rowLimit: 500,
      },
    }),
    searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(startPrev),
        endDate: fmt(endPrev),
        dimensions: ["query"],
        rowLimit: 500,
      },
    }),
  ]);

  const currentMap = new Map<string, number>();
  for (const row of currentRes.data.rows ?? []) {
    const kw = row.keys?.[0];
    if (kw && row.position != null) currentMap.set(kw, row.position);
  }

  const prevMap = new Map<string, number>();
  for (const row of prevRes.data.rows ?? []) {
    const kw = row.keys?.[0];
    if (kw && row.position != null) prevMap.set(kw, row.position);
  }

  const movers: Array<{
    keyword: string;
    previous_position: number;
    current_position: number;
    change: number;
    direction: "up" | "down";
  }> = [];

  for (const [kw, currentPos] of currentMap) {
    const prevPos = prevMap.get(kw);
    if (prevPos == null) continue;

    // Positive change = moved up (lower position number = better rank)
    const change = prevPos - currentPos;
    const dir: "up" | "down" = change > 0 ? "up" : "down";

    if (Math.abs(change) >= threshold) {
      if (direction === "both" || direction === dir) {
        movers.push({
          keyword: kw,
          previous_position: Math.round(prevPos * 10) / 10,
          current_position: Math.round(currentPos * 10) / 10,
          change: Math.round(change * 10) / 10,
          direction: dir,
        });
      }
    }
  }

  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  console.log("============ Top Movers ***************", movers.length);

  return {
    site_id: siteId,
    site_url: siteUrl,
    threshold,
    direction,
    movers,
  };
}

export async function getRankVelocity(
  siteId: number,
  keyword: string,
  windowDays: number,
) {
  if (!keyword || typeof keyword !== "string") {
    throw new Error("keyword must be a non-empty string");
  }
  if (!Number.isInteger(windowDays) || windowDays < 2 || windowDays > 90) {
    throw new Error("window_days must be an integer between 2 and 90");
  }

  const history = await getRankingHistory(siteId, keyword, windowDays);
  const points = history.history.filter((h) => h.position !== null);

  if (points.length < 2) {
    return {
      site_id: siteId,
      keyword,
      window_days: windowDays,
      velocity: null,
      trend: "insufficient_data",
      data_points: points.length,
      message: "Not enough data points to calculate velocity",
    };
  }

  // Simple linear regression over position values
  const n = points.length;
  const positions = points.map((p) => p.position as number);

  // Use index as x-axis (0 = oldest, n-1 = newest)
  const sumX = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY = positions.reduce((a, b) => a + b, 0);
  const sumXY = positions.reduce((acc, pos, i) => acc + i * pos, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  // Negative slope = improving (position number going down = better rank)
  const velocity = Math.round(slope * 100) / 100;

  let trend: string;
  if (Math.abs(velocity) < 0.1) trend = "stable";
  else if (velocity < 0) trend = "improving";
  else trend = "declining";

  console.log("============= Velocity ***************", velocity, trend);

  return {
    site_id: siteId,
    site_url: history.site_url,
    keyword,
    window_days: windowDays,
    velocity,
    trend,
    data_points: n,
    interpretation: `Position changing by ${Math.abs(velocity)} places/day (${trend})`,
  };
}

// ── MCP Server factory ────────────────────────────────────────────────
// Creates a fresh Server instance with all handlers registered.
// Called once per MCP session so each connection gets its own instance.
function createMcpServer(): Server {
  const s = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  s.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_rankings",
        description:
          "Get current Google Search Console rankings for a list of keywords. Returns position, clicks, impressions, and CTR for each keyword over the last 28 days.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID from config (1, 2, 3...)",
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "List of keywords to look up rankings for",
            },
          },
          required: ["site_id", "keywords"],
        },
      },
      {
        name: "get_ranking_history",
        description:
          "Get the position trend for a single keyword over N days. Returns a date-sorted array of daily position data.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID from config (1, 2, 3...)",
            },
            keyword: {
              type: "string",
              description: "The keyword to get history for",
            },
            days: {
              type: "number",
              description: "Number of days of history to retrieve (1–365)",
            },
          },
          required: ["site_id", "keyword", "days"],
        },
      },
      {
        name: "get_top_movers",
        description:
          "Get keywords that moved significantly in position. Compares last 7 days vs prior 7 days and returns keywords that moved more than threshold positions.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID from config (1, 2, 3...)",
            },
            threshold: {
              type: "number",
              description:
                "Minimum position change to include (e.g. 3 = moved 3+ spots)",
            },
            direction: {
              type: "string",
              enum: ["up", "down", "both"],
              description:
                'Filter by direction: "up" (improved), "down" (declined), or "both"',
            },
          },
          required: ["site_id", "threshold", "direction"],
        },
      },
      {
        name: "get_rank_velocity",
        description:
          "Calculate the rate of change (velocity) of a keyword's ranking over a time window. Returns positions per day and trend direction.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID from config (1, 2, 3...)",
            },
            keyword: { type: "string", description: "The keyword to analyse" },
            window_days: {
              type: "number",
              description:
                "Rolling window size in days for velocity calculation (2–90)",
            },
          },
          required: ["site_id", "keyword", "window_days"],
        },
      },
    ],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "get_rankings": {
          const siteId = validateSiteId(args?.site_id);
          const keywords = args?.keywords as string[];
          if (!Array.isArray(keywords))
            throw new Error("keywords must be an array");
          console.log("========== GET RANKINGS ==========");
          const result = await getRankings(siteId, keywords);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "get_ranking_history": {
          const siteId = validateSiteId(args?.site_id);
          const keyword = args?.keyword as string;
          const days = Number(args?.days);
          console.log("========== GET RANKING HISTORY ==========");
          const result = await getRankingHistory(siteId, keyword, days);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "get_top_movers": {
          const siteId = validateSiteId(args?.site_id);
          const threshold = Number(args?.threshold);
          const direction = args?.direction as "up" | "down" | "both";
          console.log("========== GET TOP MOVERS ==========");
          const result = await getTopMovers(siteId, threshold, direction);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "get_rank_velocity": {
          const siteId = validateSiteId(args?.site_id);
          const keyword = args?.keyword as string;
          const windowDays = Number(args?.window_days);
          console.log("========== GET RANK VELOCITY ==========");
          const result = await getRankVelocity(siteId, keyword, windowDays);
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

// ── STEP 3: Start Streamable HTTP server ─────────────────────────────
const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res
          .status(400)
          .json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: expected initialize",
            },
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
      res
        .status(500)
        .json({
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
