import { randomUUID } from "node:crypto";
import https from "node:https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { google } from "googleapis";

const SERVER_NAME = "reporting";
const SERVER_VERSION = "1.0.0";

// ── Slack helpers ──────────────────────────────────────────────────────
type SlackResponse = {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
};

const sites: Record<string, string> = {
  "1": "https://lifecircle.in",
};

export async function callSlackApi(
  endpoint: string,
  token: string,
  body: object,
): Promise<SlackResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: "slack.com",
        path: `/api/${endpoint}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk: string) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf) as SlackResponse);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ── Sheets helpers ─────────────────────────────────────────────────────
function getSheetsClient(siteId: number) {
  const envKey = `GSC_OAUTH_SITE_${siteId}`;
  const raw = process.env[envKey];
  if (!raw) throw new Error(`Missing env var ${envKey} for site_id=${siteId}`);
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function getSpreadsheetId(): string {
  const id = process.env.SHEETS_ID?.trim();
  if (!id) throw new Error("Missing env var SHEETS_ID");
  return id;
}

// ── Tool implementations ──────────────────────────────────────────────

export async function postSlackMessage(
  message: string,
  blocks?: object[],
  channel?: string,
) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Missing env var SLACK_BOT_TOKEN");
  const ch = channel ?? process.env.SLACK_CHANNEL_ID;
  if (!ch) throw new Error("Missing env var SLACK_CHANNEL_ID");

  const body: Record<string, unknown> = { channel: ch, text: message };
  if (blocks) body.blocks = blocks;

  console.log("========== Calling Slack Post API **********");
  const result = await callSlackApi("chat.postMessage", token, body);
  console.log("========== Message Sent **********", result.ok);
  if (!result.ok)
    throw new Error(`Slack API error: ${result.error ?? "unknown"}`);
  return { ok: true, ts: result.ts, channel: result.channel };
}

export function createWeeklyDigest(
  siteId: number,
  rankings: Array<{
    keyword: string;
    position: number | null;
    clicks: number;
    impressions: number;
    ctr: number;
  }>,
  summary: string,
  cmsOpportunities?: Array<{
    url: string;
    impressions: number;
    current_ctr: number;
    current_title: string;
    current_description: string;
    suggested_title: string;
    suggested_description: string;
    reasoning?: string;
  }>,
  schemaGaps?: Array<{
    url: string;
    page_type: string;
    missing_types: string[];
    has_gaps: boolean;
  }>,
  competitorAlerts?: Array<{
    keyword: string;
    competitor_position: number;
    competitor_volume: number;
  }>,
) {
  const today = new Date().toISOString().split("T")[0];

  const rankLines = rankings.length
    ? rankings
        .map(
          (r) =>
            `• *${r.keyword}*: pos ${r.position ?? "N/A"}, ${r.clicks} clicks, ${(r.ctr * 100).toFixed(1)}% CTR`,
        )
        .join("\n")
    : "No ranking data available.";
  console.log("========== Rankings Processed **********");

  // Build CMS meta suggestions section
  const opportunities = cmsOpportunities ?? [];
  const cmsLines = opportunities.length
    ? opportunities
        .map((o) => {
          console.log("============= Processing CMS Opportunity ***************\n", o);
          const page = o.url;
          const ctr = (o.current_ctr * 100).toFixed(1);
          return (
            `• *${page}* (${o.impressions.toLocaleString()} impr, ${ctr}% CTR)\n` +
            `    *Current:*\n` +
            `        _Title:_ ${o.current_title}\n` +
            `        _Desc:_ ${o.current_description}\n\n` +
            `    *Suggestion:*\n` +
            `        _Title:_ ${o.suggested_title}\n` +
            `        _Desc:_ ${o.suggested_description}\n\n` +
            `    _Reasoning:_ ${o.reasoning ?? "N/A"}`
          );
        })
        .join("\n\n")
    : "No low-CTR opportunities identified this week.";
  console.log("========== CMS Opportunities Processed **********");

  // Build schema gaps section
  const gaps = schemaGaps ?? [];
  const schemaLines = gaps.filter((g) => g.has_gaps).length
    ? gaps
        .filter((g) => g.has_gaps)
        .map(
          (g) =>
            `• *${g.url}* (${g.page_type})\n    Missing: ${g.missing_types.join(", ")}`,
        )
        .join("\n")
    : "No schema gaps identified this week.";

  // Build competitor alerts section
  const alerts = competitorAlerts ?? [];
  const competitorLines = alerts.length
    ? alerts
        .slice(0, 10)
        .map(
          (a) =>
            `• *${a.keyword}* — competitor pos ${a.competitor_position}, vol ${a.competitor_volume.toLocaleString()}`,
        )
        .join("\n")
    : "No competitor keyword gaps identified this week.";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 Weekly SEO Report — Site ${sites[String(siteId)]}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Report date:* ${today}` }],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*🔑 Keyword Rankings*\n${rankLines}` },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*✏️ Meta Suggestions (Low-CTR Pages)*\n${cmsLines}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🧩 Schema Gaps*\n${schemaLines}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🕵️ Competitor Keyword Gaps*\n${competitorLines}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*💡 Summary & Actions*\n${summary || "No summary available."}`,
      },
    },
  ];

  console.log("========== Weekly Digest Created **********");
  return {
    site_id: siteId,
    date: today,
    blocks,
    fallback_text: `Weekly SEO Report — Site ${siteId} — ${today}`,
  };
}

export async function writeToSheet(
  siteId: number,
  tabName: string,
  rows: unknown[][],
) {
  console.log("============= Sheets GSC Auth *************** site_id:", siteId);
  const sheets = getSheetsClient(siteId);
  const spreadsheetId = getSpreadsheetId();

  console.log("========== Appending to Sheet **********");
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });

  console.log("========== Sheet Updated **********");
  return {
    ok: true,
    tab: tabName,
    updated_rows: result.data.updates?.updatedRows ?? 0,
  };
}

export async function logRecommendation(
  siteId: number,
  module: string,
  recommendation: string,
  outcome: string,
) {
  const VALID_OUTCOMES = ["pending", "accepted", "rejected", "successful"];
  if (!VALID_OUTCOMES.includes(outcome)) {
    throw new Error(`outcome must be one of: ${VALID_OUTCOMES.join(", ")}`);
  }
  const date = new Date().toISOString();
  const rows = [[date, siteId, module, recommendation, outcome]];
  return writeToSheet(siteId, "Recommendation Outcomes", rows);
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
        name: "post_slack_message",
        description:
          "Post a formatted message to Slack. Supports optional Block Kit blocks for rich formatting.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Fallback plain-text message",
            },
            blocks: {
              type: "array",
              items: { type: "object" },
              description: "Slack Block Kit blocks (optional)",
            },
            channel: {
              type: "string",
              description:
                "Slack channel ID (defaults to SLACK_CHANNEL_ID env var)",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "create_weekly_digest",
        description:
          "Format keyword performance, CMS meta suggestions, schema gaps, and competitor alerts into a structured Slack Block Kit digest. Returns blocks and fallback_text ready to pass to post_slack_message.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            rankings: {
              type: "array",
              items: { type: "object" },
              description: "Array of keyword ranking objects from get_rankings",
            },
            top_movers: {
              type: "object",
              description: "Top movers object from get_top_movers",
            },
            velocity: {
              type: "object",
              description: "Velocity object from get_rank_velocity",
            },
            summary: {
              type: "string",
              description:
                "Human-readable summary and action items for the week",
            },
            cms_opportunities: {
              type: "array",
              items: { type: "object" },
              description:
                "Optional array of low-CTR page objects from cms-connector, each with url, impressions, current_ctr, suggested_title, suggested_description",
            },
            schema_gaps: {
              type: "array",
              items: { type: "object" },
              description:
                "Optional array of schema gap objects from schema-manager, each with url, page_type, missing_types, has_gaps",
            },
            competitor_alerts: {
              type: "array",
              items: { type: "object" },
              description:
                "Optional array of competitor keyword gap objects from competitor-intel, each with keyword, competitor_position, competitor_volume",
            },
          },
          required: [
            "site_id",
            "rankings",
            "top_movers",
            "velocity",
            "summary",
          ],
        },
      },
      {
        name: "write_to_sheet",
        description:
          "Append rows to a Google Sheets tab. Uses the GSC service account credentials for the given site_id.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description:
                "Site ID (used to select service account credentials)",
            },
            tab_name: {
              type: "string",
              description: "Sheet tab name (e.g. 'Weekly Rankings')",
            },
            rows: {
              type: "array",
              items: { type: "array" },
              description: "Array of row arrays to append",
            },
          },
          required: ["site_id", "tab_name", "rows"],
        },
      },
      {
        name: "log_recommendation",
        description:
          "Log a Claude recommendation and its outcome to the 'Recommendation Outcomes' tab in Google Sheets for accuracy tracking over time.",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "number", description: "Site ID" },
            module: {
              type: "string",
              description:
                "Module that generated the recommendation (e.g. 'keyword-tracker')",
            },
            recommendation: {
              type: "string",
              description: "The recommendation text",
            },
            outcome: {
              type: "string",
              enum: ["pending", "accepted", "rejected", "successful"],
              description: "Current outcome status",
            },
          },
          required: ["site_id", "module", "recommendation", "outcome"],
        },
      },
    ],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "post_slack_message": {
          console.log("========== POST SLACK MESSAGE ==========");
          const result = await postSlackMessage(
            args.message as string,
            args.blocks as object[] | undefined,
            args.channel as string | undefined,
          );
          console.log("========== Slack Response **********", result);

          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "create_weekly_digest": {
          console.log("========== CREATE WEEKLY DIGEST ==========");
          const result = createWeeklyDigest(
            Number(args.site_id),
            args.rankings as Array<{
              keyword: string;
              position: number | null;
              clicks: number;
              impressions: number;
              ctr: number;
            }>,
            args.summary as string,
            args.cms_opportunities as
              | Array<{
                  url: string;
                  impressions: number;
                  current_ctr: number;
                  current_title: string;
                  current_description: string;
                  suggested_title: string;
                  suggested_description: string;
                  reasoning?: string;
                }>
              | undefined,
            args.schema_gaps as
              | Array<{
                  url: string;
                  page_type: string;
                  missing_types: string[];
                  has_gaps: boolean;
                }>
              | undefined,
            args.competitor_alerts as
              | Array<{
                  keyword: string;
                  competitor_position: number;
                  competitor_volume: number;
                }>
              | undefined,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "write_to_sheet": {
          console.log("========== WRITE TO SHEET ==========");
          const result = await writeToSheet(
            Number(args.site_id),
            args.tab_name as string,
            args.rows as unknown[][],
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "log_recommendation": {
          console.log("========== LOG RECOMMENDATION ==========");
          const result = await logRecommendation(
            Number(args.site_id),
            args.module as string,
            args.recommendation as string,
            args.outcome as string,
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
