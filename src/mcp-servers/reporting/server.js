import { randomUUID } from "node:crypto";
import https from "node:https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";

const SERVER_NAME = "reporting";
const SERVER_VERSION = "1.0.0";

// ── Slack helpers ──────────────────────────────────────────────────────

const sites = {
  1: "https://lifecircle.in",
};

export async function callSlackApi(endpoint, token, body) {
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
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
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
function getSheetsClient(siteId) {
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

function getSpreadsheetId() {
  const id = process.env.SHEETS_ID?.trim();
  if (!id) throw new Error("Missing env var SHEETS_ID");
  return id;
}

// ── Tool implementations ──────────────────────────────────────────────

export async function postSlackMessage(message, blocks, channel) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Missing env var SLACK_BOT_TOKEN");
  const ch = channel ?? process.env.SLACK_CHANNEL_ID;
  console.log(ch, process.env.SLACK_CHANNEL_ID);

  if (!ch) throw new Error("Missing env var SLACK_CHANNEL_ID");

  console.log("========== Slack Message **********");
  const body = { channel: ch, text: message };
  if (blocks) body.blocks = blocks;

  console.log("========== Calling Slack Post API **********");
  const result = await callSlackApi("chat.postMessage", token, body);
  console.log("========== Message Sent **********", result.ok);
  if (!result.ok)
    throw new Error(`Slack API error: ${result.error ?? "unknown"}`);
  return { ok: true, ts: result.ts, channel: result.channel };
}

// Slack section text is capped at 3000 chars — truncate with a safe margin
function slackTrunc(text, max = 2950) {
  return text.length <= max ? text : text.slice(0, max - 3) + "...";
}

function sectionBlock(text) {
  return { type: "section", text: { type: "mrkdwn", text: slackTrunc(text) } };
}

export function createWeeklyDigest(siteId, data) {
  const today = new Date().toISOString().split("T")[0];
  const { rankings, summary, cmsOpportunities, schemaGaps, competitorsAlerts } =
    data || {};

  // Cap rankings at 15 to stay within block text limits
  const rankLines = rankings.length
    ? rankings
        .slice(0, 15)
        .map(
          (r) =>
            `• *${r.keyword}*: pos ${r.position ?? "N/A"}, ${r.clicks} clicks, ${(r.ctr * 100).toFixed(1)}% CTR`,
        )
        .join("\n")
    : "No ranking data available.";
  console.log("========== Rankings Processed **********");

  // Build schema gaps section
  const gaps = (schemaGaps ?? []).filter((g) => g.has_gaps);
  const schemaLines = gaps.length
    ? gaps
        .slice(0, 10)
        .map(
          (g) =>
            `• *${g.url}* (${g.page_type})\n    Missing: ${g.missing_types.join(", ")}`,
        )
        .join("\n")
    : "No schema gaps identified this week.";

  // Build competitor alerts section
  const compotitors = competitorsAlerts ?? [];
  const competitorsLines = compotitors.length
    ? compotitors
        .slice(0, 5)
        .map((competitor, index) => {
          let text = `${index + 1}. ${competitor.competitor_domain}: \n`;

          if (competitor.keywordGaps.length === 0) {
            text += "    No keyword gaps identified.";
          } else {
            competitor.keywordGaps.map((gap) => {
              text += `    • *${gap.keyword}* — competitor pos ${gap.competitor_position}, vol ${gap.competitor_volume.toLocaleString()}\n`;
            });
          }
          return text;
        })
        .join("\n")
    : "No competitor keyword gaps identified this week.";

  console.log(competitorsLines);

  // Header blocks
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Weekly SEO Report — ${sites[String(siteId)] ?? `Site ${siteId}`}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*Report date:* ${today}` }],
    },
    { type: "divider" },
    sectionBlock(`*Keyword Rankings*\n${rankLines}`),
    { type: "divider" },
    sectionBlock(`*Meta Suggestions (Low-CTR Pages)*`),
  ];

  // One block per CMS opportunity to avoid 3000-char limit
  const opportunities = (cmsOpportunities ?? []).slice(0, 5);
  if (opportunities.length === 0) {
    blocks.push(sectionBlock("No low-CTR opportunities identified this week."));
  } else {
    for (const o of opportunities) {
      console.log(
        "============= Processing CMS Opportunity ***************\n",
        o,
      );
      const ctr = (o.current_ctr * 100).toFixed(1);
      const text =
        `• *${o.url} * (${o.impressions.toLocaleString()} impr, ${ctr}% CTR)\n` +
        `    *Current:*\n` +
        `        _Title:_ ${o.current_title}\n` +
        `        _Desc:_ ${o.current_description}\n` +
        `    *Suggestion:*\n` +
        `        _Title:_ ${o.suggested_title}\n` +
        `        _Desc:_ ${o.suggested_description}\n` +
        `    *Reasoning:* ${o.reasoning ?? "N/A"}`;
      blocks.push(sectionBlock(text));
    }
  }
  console.log("========== CMS Opportunities Processed **********");

  blocks.push(
    { type: "divider" },
    sectionBlock(`*Schema Gaps*\n${schemaLines}`),
    { type: "divider" },
    sectionBlock(`*Competitor Keyword Gaps*\n${competitorsLines}`),
    { type: "divider" },
    sectionBlock(`*Summary & Actions*\n${summary || "No summary available."}`),
  );

  console.log("========== Weekly Digest Created **********");

  return {
    site_id: siteId,
    date: today,
    blocks,
    fallback_text: `Weekly SEO Report — Site ${sites[String(siteId)] ?? `Site ${siteId}`} — ${today}`,
  };
}

export async function writeToSheet(siteId, tabName, rows) {
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
  siteId,
  module,
  recommendation,
  outcome,
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
function createMcpServer() {
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

  s.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "post_slack_message": {
          console.log("========== POST SLACK MESSAGE ==========");
          const result = await postSlackMessage(
            args.message,
            args.blocks,
            args.channel,
          );
          console.log("========== Slack Response **********", result);

          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "create_weekly_digest": {
          console.log("========== CREATE WEEKLY DIGEST ==========");
          const result = createWeeklyDigest(
            Number(args.site_id),
            args.rankings,
            args.summary,
            args.cms_opportunities,
            args.schema_gaps,
            args.competitor_alerts,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "write_to_sheet": {
          console.log("========== WRITE TO SHEET ==========");
          const result = await writeToSheet(
            Number(args.site_id),
            args.tab_name,
            args.rows,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "log_recommendation": {
          console.log("========== LOG RECOMMENDATION ==========");
          const result = await logRecommendation(
            Number(args.site_id),
            args.module,
            args.recommendation,
            args.outcome,
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

const postMessageToSlack = async (site_id, data) => {
  const messageData = createWeeklyDigest(site_id, data);

  const { message = "", blocks = [], fallback_text } = messageData;

  return await postSlackMessage(message, blocks);
};

export { postMessageToSlack };
