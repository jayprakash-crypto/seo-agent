import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "node:crypto";

const SERVER_NAME = "mcp-template-server"; // e.g. 'keyword-tracker'
const SERVER_VERSION = "1.0.0";

function createServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  // ── STEP 1: Declare all tools this server exposes ─────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "tool_name_here",
        description: "What this tool does — be specific for Claude",
        inputSchema: {
          type: "object",
          properties: {
            site_id: {
              type: "number",
              description: "Site ID from config (1, 2, 3...)",
            },
            // add more params here
          },
          required: ["site_id"],
        },
      },
      // Add more tools here
    ],
  }));

  // ── STEP 2: Handle tool calls from Claude ─────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "tool_name_here": {
          // const result = await yourApiCall(args);
          const result = { success: true, data: "Replace with actual result" };
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

  return server;
}

// ── STEP 3: Start Streamable HTTP server ─────────────────────────────
const mcp_template_path = express();
mcp_template_path.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

mcp_template_path.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;
  console.log("POST : Transport Session ID : ", sessionId);
  console.log("Transports : ", Array.from(transports.keys()));

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
        console.log("New Session ID: ", sid);
        transports.set(sid, transport!);
      },
    });
    transport.onclose = () => {
      console.log("Closing Transport Session : ", transport);
      if (transport!.sessionId) transports.delete(transport!.sessionId);
    };
    await createServer().connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});

mcp_template_path.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  console.log("GET : Transport Session ID : ", sessionId);
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
});

mcp_template_path.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  console.log("========== Deleting MCP Server Transport ==========");
  console.log("Session ID : ", sessionId);
  console.log("Transport : ", transport);

  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log("========== Deleted MCP Server ==========");
  console.log("Session ID : ", sessionId);
  await transport.handleRequest(req, res);
});

mcp_template_path.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    server: SERVER_NAME,
    transports: Array.from(transports.keys()),
  }),
);

export default mcp_template_path;
