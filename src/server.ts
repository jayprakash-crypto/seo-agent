import express from "express";
import pool from "./api/db.js";
import { maltiRouter, initMalti } from "./api/malti/index.js";

import keywordTrackerServer from "./api/mcp-servers/keyword-tracker/server.js";
import competitorIntelServer from "./api/mcp-servers/competitor-intel/server.js";
import reportingServer from "./api/mcp-servers/reporting/server.js";
import cmsConnectorServer from "./api/mcp-servers/cms-connector/server.js";
import schemaManagerServer from "./api/mcp-servers/schema-manager/server.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log every incoming request so we can trace which routes are hit
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.path}`);
  next();
});

// Guard each MCP server mount — if the file has no default export the import is
// undefined, which makes app.use() throw and crash the server before it binds.
const mcpMounts: [string, unknown][] = [
  ["/keyword-tracker", keywordTrackerServer],
  ["/competitor-intel", competitorIntelServer],
  ["/reporting",        reportingServer],
  ["/cms-connector",    cmsConnectorServer],
  ["/schema-manager",   schemaManagerServer],
];

for (const [path, handler] of mcpMounts) {
  const isValid =
    typeof handler === "function" ||
    (handler != null && typeof (handler as { handle?: unknown }).handle === "function");
  if (isValid) {
    app.use(path, handler as express.RequestHandler);
    console.log(`[startup] ✓ MCP mounted: ${path}`);
  } else {
    console.error(
      `[startup] ✗ SKIPPED ${path} — import resolved to ${handler === undefined ? "undefined" : typeof handler}. ` +
      `The MCP server file has no "export default". This route will NOT work until a default export is added.`
    );
  }
}

const port = process.env.PORT || 3001;

// Malti routes — mounted at / because the hp-backend proxy already strips /malti
app.use("/", maltiRouter);
console.log("[startup] ✓ Malti routes mounted at /");

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", server: "SEO Agent + Malti", port });
});

// Catch-all error handler — prevents unhandled errors from returning empty 502s
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled error]", err.message, err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Prevent unhandled rejections from crashing the process and causing Railway 502s
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// Non-blocking DB health checks at startup so connection failures are logged clearly
pool.query("SELECT 1")
  .then(() => console.log("[startup] ✓ SEO Agent DB connected (DATABASE_URL)"))
  .catch((err: Error) => {
    console.error("[startup] ✗ SEO Agent DB connection FAILED:", err.message);
    console.error("[startup]   → Check DATABASE_URL. Default fallback: mysql://root:@localhost:3306/seo_agent");
  });

initMalti()
  .then(() => console.log("[startup] ✓ Malti DB tables ready"))
  .catch((err: Error) => console.error("[startup] ✗ Malti DB init failed:", err.message));
