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

// ── STEP 3: Start Streamable HTTP server ─────────────────────────────
const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { transports.set(sid, transport!); },
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
  if (!transport) { res.status(400).send("Invalid or missing session ID"); return; }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) { res.status(400).send("Invalid or missing session ID"); return; }
  await transport.handleRequest(req, res);
});

app.get("/health", (_req, res) =>
  res.json({ status: "ok", server: SERVER_NAME }),
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${SERVER_NAME} running on port ${PORT}`));
