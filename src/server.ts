import express from "express";

import keywordTracker from "./mcp-servers/keyword-tracker/server.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", servers: "SEO Agent" });
});

app.use("/keyword-tracker", keywordTracker);

// Catch-all error handler — prevents unhandled errors from returning empty 502s
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled error]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SEO Agent server is running on port ${PORT}`);
});

// Prevent unhandled rejections from crashing the process and causing Railway 502s
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
