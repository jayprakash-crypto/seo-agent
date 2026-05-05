"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function EditConfigTab() {
  const [config, setConfig] = useState({
    dry_run: "false",
    max_retries: "3",
    ahrefs_delay_ms: "1500",
    reporting_url: "https://reporting-seo-agent.up.railway.app/mcp",
    keyword_tracker_url: "https://keyword-tracker-seo-agent.up.railway.app/mcp",
    cms_connector_url: "https://cms-connector-seo-agent.up.railway.app/mcp",
    schema_manager_url: "https://schema-manager-seo-agent.up.railway.app/mcp",
    competitor_intel_url: "https://competitor-intel-seo-agent.up.railway.app/mcp",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function handleSave() {
    setStatus("saving");
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Config</CardTitle>
        <CardDescription>Adjust orchestrator settings and MCP server URLs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Dry Run Mode</Label>
          <div className="flex gap-2">
            {["false", "true"].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={config.dry_run === v ? "default" : "outline"}
                onClick={() => setConfig((c) => ({ ...c, dry_run: v }))}
              >
                {v === "true" ? "Enabled" : "Disabled"}
                {v === "true" && (
                  <Badge variant="secondary" className="ml-1 text-xs">safe</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Max Retries</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.max_retries}
              onChange={(e) => setConfig((c) => ({ ...c, max_retries: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Ahrefs Delay (ms)</Label>
            <Input
              type="number"
              min={0}
              value={config.ahrefs_delay_ms}
              onChange={(e) => setConfig((c) => ({ ...c, ahrefs_delay_ms: e.target.value }))}
            />
          </div>
        </div>

        <Separator />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          MCP Server URLs
        </p>
        {(
          [
            ["reporting_url", "Reporting"],
            ["keyword_tracker_url", "Keyword Tracker"],
            ["cms_connector_url", "CMS Connector"],
            ["schema_manager_url", "Schema Manager"],
            ["competitor_intel_url", "Competitor Intel"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label>{label}</Label>
            <Input
              value={config[key]}
              onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
            />
          </div>
        ))}

        {status === "done" && (
          <Alert><AlertDescription>Config saved.</AlertDescription></Alert>
        )}
        {status === "error" && (
          <Alert variant="destructive">
            <AlertDescription>Failed to save config.</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save Config"}
        </Button>
      </CardContent>
    </Card>
  );
}
