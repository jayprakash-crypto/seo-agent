"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Tab 1: Add City ───────────────────────────────────────────────────
function AddCityTab() {
  const [form, setForm] = useState({
    site_id: "1",
    city: "",
    state: "",
    country: "India",
    target_keyword: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/config/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
      setForm((f) => ({ ...f, city: "", state: "", target_keyword: "" }));
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add City</CardTitle>
        <CardDescription>
          Add a new city to target for local SEO rankings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="city">City Name</Label>
              <Input
                id="city"
                placeholder="e.g. Mumbai"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="e.g. Maharashtra"
                value={form.state}
                onChange={(e) =>
                  setForm((f) => ({ ...f, state: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) =>
                  setForm((f) => ({ ...f, country: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="keyword">Target Keyword</Label>
              <Input
                id="keyword"
                placeholder="e.g. home care Mumbai"
                value={form.target_keyword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target_keyword: e.target.value }))
                }
              />
            </div>
          </div>

          {status === "done" && (
            <Alert>
              <AlertDescription>City added successfully!</AlertDescription>
            </Alert>
          )}
          {status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>Failed to add city. Try again.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Add City"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Tab 2: Add Website ────────────────────────────────────────────────
function AddWebsiteTab() {
  const [form, setForm] = useState({
    name: "",
    url: "",
    gsc_property: "",
    gbp_location_id: "",
    sheets_id: "",
    slack_channel: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/config/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
        <CardTitle>Add Website</CardTitle>
        <CardDescription>
          Register a new site to be managed by the SEO agent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="name">Site Name</Label>
              <Input
                id="name"
                placeholder="e.g. LifeCircle"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="url">Site URL</Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={form.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, url: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gsc">GSC Property</Label>
              <Input
                id="gsc"
                placeholder="sc-domain:example.com"
                value={form.gsc_property}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gsc_property: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gbp">GBP Location ID</Label>
              <Input
                id="gbp"
                placeholder="accounts/123/locations/456"
                value={form.gbp_location_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gbp_location_id: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sheets">Google Sheets ID</Label>
              <Input
                id="sheets"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                value={form.sheets_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sheets_id: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slack">Slack Channel ID</Label>
              <Input
                id="slack"
                placeholder="C0XXXXXXXXX"
                value={form.slack_channel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slack_channel: e.target.value }))
                }
              />
            </div>
          </div>

          {status === "done" && (
            <Alert>
              <AlertDescription>
                Site registered! Update env vars and redeploy.
              </AlertDescription>
            </Alert>
          )}
          {status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>Failed to register site.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Add Website"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Tab 3: Edit Config ────────────────────────────────────────────────
function EditConfigTab() {
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
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

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
        <CardDescription>
          Adjust orchestrator settings and MCP server URLs.
        </CardDescription>
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
                  <Badge variant="secondary" className="ml-1 text-xs">
                    safe
                  </Badge>
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
              onChange={(e) =>
                setConfig((c) => ({ ...c, max_retries: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Ahrefs Delay (ms)</Label>
            <Input
              type="number"
              min={0}
              value={config.ahrefs_delay_ms}
              onChange={(e) =>
                setConfig((c) => ({ ...c, ahrefs_delay_ms: e.target.value }))
              }
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
              onChange={(e) =>
                setConfig((c) => ({ ...c, [key]: e.target.value }))
              }
            />
          </div>
        ))}

        {status === "done" && (
          <Alert>
            <AlertDescription>Config saved.</AlertDescription>
          </Alert>
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

// ── Main component ────────────────────────────────────────────────────
export default function ConfigManager() {
  return (
    <Tabs defaultValue="add-city" orientation="horizontal">
      <TabsList className="mb-4">
        <TabsTrigger value="add-city">Add City</TabsTrigger>
        <TabsTrigger value="add-website">Add Website</TabsTrigger>
        <TabsTrigger value="edit-config">Edit Config</TabsTrigger>
      </TabsList>
      <TabsContent value="add-city">
        <AddCityTab />
      </TabsContent>
      <TabsContent value="add-website">
        <AddWebsiteTab />
      </TabsContent>
      <TabsContent value="edit-config">
        <EditConfigTab />
      </TabsContent>
    </Tabs>
  );
}
