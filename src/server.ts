import express from "express";

import keywordTrackerServer from "./mcp-servers/keyword-tracker/server.js";
import competitorIntelServer from "./mcp-servers/competitor-intel/server.js";
import reportingServer from "./mcp-servers/reporting/server.js";
import cmsConnectorServer from "./mcp-servers/cms-connector/server.js";
import schemaManagerServer from "./mcp-servers/schema-manager/server.js";

const app = express();

app.use("/keyword-tracker", keywordTrackerServer);
app.use("/competitor-intel", competitorIntelServer);
app.use("/reporting", reportingServer);
app.use("/cms-connector", cmsConnectorServer);
app.use("/schema-manager", schemaManagerServer);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", server: "SEO Agent" });
});

// Catch-all error handler — prevents unhandled errors from returning empty 502s
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled error]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3001;
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
