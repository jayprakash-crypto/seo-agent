"use client";

import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { proxyFetch } from "@/lib/api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { toast } from "sonner";
import { SquarePen, Trash2 } from "lucide-react";
import { Textarea } from "./ui/textarea";

// ── Tab 1: Add City ───────────────────────────────────────────────────
function AddCityTab({ onSuccess }: { onSuccess?: (data?: any[]) => void }) {
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
      const res = await proxyFetch("/api/config/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
      setForm((f) => ({ ...f, city: "", state: "", target_keyword: "" }));
      const resp = await res.json();
      onSuccess && onSuccess(resp.items);
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
              <Label htmlFor="city">Site ID</Label>
              <Input
                id="site_id"
                placeholder="1"
                disabled
                value={form.site_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, site_id: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="city">City Name</Label>
              <Input
                id="city"
                placeholder="e.g. Mumbai"
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
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
            <div className="space-y-1 col-span-2">
              <Label htmlFor="keyword">Target Keyword</Label>
              <Textarea
                id="keyword"
                className="min-h-[150px]"
                placeholder="e.g. home care Mumbai"
                rows={5}
                value={form.target_keyword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target_keyword: e.target.value }))
                }
              />
            </div>
          </div>

          {status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to add city. Try again.
              </AlertDescription>
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
function AddWebsiteTab({ onSuccess }: { onSuccess?: (data?: any[]) => void }) {
  const [form, setForm] = useState({
    site_id: "",
    domain: "",
    brand_name: "",
    industry: "",
    cities: "",
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
        body: JSON.stringify({ ...form, site_id: Number(form.site_id) }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
      setForm({
        site_id: "",
        domain: "",
        brand_name: "",
        industry: "",
        cities: "",
      });
      const resp = await res.json();
      onSuccess && onSuccess(resp.items);
    } catch {
      setStatus("error");
    }
  }

  function field(
    id: keyof typeof form,
    label: string,
    placeholder?: string,
    required = false,
  ) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          placeholder={placeholder}
          value={form[id]}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          required={required}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Website</CardTitle>
        <CardDescription>
          Register a new site in the &quot;Sites Config&quot; Google Sheet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field("site_id", "Site Id", "1", true)}
            {field("domain", "Domain", "https://example.com", true)}
            {field("brand_name", "Brand Name", "e.g. LifeCircle", true)}
            {field("industry", "Industry", "e.g. Healthcare")}
            <div className="space-y-1">
              <Label htmlFor={"cities"}>Cities</Label>
              <Textarea
                id={"cities"}
                className="min-h-[100px]"
                placeholder={"e.g. Mumbai, Delhi (comma-separated)"}
                value={form["cities"]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cities: e.target.value }))
                }
              />
            </div>
          </div>

          {status === "done" && (
            <Alert>
              <AlertDescription>Site registered successfully!</AlertDescription>
            </Alert>
          )}
          {status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to register site. Try again.
              </AlertDescription>
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
    competitor_intel_url:
      "https://competitor-intel-seo-agent.up.railway.app/mcp",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  async function handleSave() {
    setStatus("saving");
    try {
      const res = await proxyFetch("/api/config", {
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

// ── Tab 4: Websites ───────────────────────────────────────────────────
interface SiteRow {
  rowIndex: number;
  site_id: string;
  domain: string;
  brand_name: string;
  industry: string;
  cities: string;
}

type SiteEditForm = Omit<SiteRow, "site_id"> & { site_id: string };

function WebsitesTab() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [editing, setEditing] = useState<SiteEditForm | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [open, setOpen] = useState(false);

  async function loadSites() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/config/sites?siteIds=1");
      if (!res.ok) throw new Error("Failed to load");
      setSites((await res.json()) as SiteRow[]);
    } catch {
      setFetchError("Could not load sites from Google Sheets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSites();
  }, []);

  function openEdit(row: SiteRow) {
    setSaveStatus("idle");
    setEditing({ ...row });
  }

  async function handleDelete(row: SiteRow) {
    if (!confirm(`Delete "${row.domain}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/config/sites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: row.rowIndex,
          site_id: Number(row.site_id),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSites((prev) => prev.filter((item) => item.rowIndex != row.rowIndex));
      toast.success("Site deleted successfully!", {
        position: "bottom-right",
        classNames: {
          toast: "!bg-green-400/20",
          icon: "text-green-500",
          title: "!text-green-700",
        },
      });
    } catch {
      alert("Failed to delete. Try again.");
    }
  }

  async function handleSave() {
    if (!editing) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/config/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, site_id: Number(editing.site_id) }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveStatus("done");
      setEditing(null);
      void loadSites();
      toast.success("Site updated successfully!", {
        position: "bottom-right",
        classNames: {
          toast: "!bg-green-400/20",
          icon: "text-green-500",
          title: "!text-green-700",
        },
      });
    } catch {
      setSaveStatus("error");
    }
  }

  function handleAddSuccess(data: any[] = []) {
    setOpen(false);
    void loadSites();
    toast.success("Site added successfully!", {
      position: "bottom-right",
      classNames: {
        toast: "!bg-green-400/20",
        icon: "text-green-500",
        title: "!text-green-700",
      },
    });
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="text-end">
          <CollapsibleTrigger
            className={"ms-auto cursor-pointer"}
            render={<Button variant={"outline"} />}
          >
            + Website
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className={"mt-4"}>
          <AddWebsiteTab onSuccess={handleAddSuccess} />
        </CollapsibleContent>
      </Collapsible>

      <br />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Websites</CardTitle>
            <CardDescription>
              Sites sourced from the &quot;Sites Config&quot; tab in Google
              Sheets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSites}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}
          {!loading && sites.length === 0 && !fetchError && (
            <p className="text-sm text-muted-foreground">
              No sites found in the sheet.
            </p>
          )}
          {sites.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site ID</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Brand Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Cities</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((row) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell>{row.site_id}</TableCell>
                    <TableCell className="font-medium">{row.domain}</TableCell>
                    <TableCell>{row.brand_name}</TableCell>
                    <TableCell>{row.industry}</TableCell>
                    <TableCell
                      className="max-w-[200px] truncate"
                      title={row.cities}
                    >
                      {row.cities}
                    </TableCell>
                    <TableCell className="flex justify-center gap-2">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => openEdit(row)}
                      >
                        <SquarePen />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="destructive"
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className={"sm:max-w-2xl"}>
          <DialogHeader>
            <DialogTitle>Edit Website — row {editing?.rowIndex}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1">
                <Label>Site Id</Label>
                <Input
                  value={editing.site_id}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, site_id: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Domain</Label>
                <Input
                  value={editing.domain}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, domain: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Brand Name</Label>
                <Input
                  value={editing.brand_name}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, brand_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Industry</Label>
                <Input
                  value={editing.industry}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, industry: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Cities (comma-separated)</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={editing.cities}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, cities: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          {saveStatus === "error" && (
            <Alert variant="destructive">
              <AlertDescription>Failed to save. Try again.</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Tab 5: Cities Config ──────────────────────────────────────────────
interface CityRow {
  rowIndex: number;
  site_id: string;
  city: string;
  state: string;
  country: string;
  target_keyword: string;
  created_at: string;
}

type EditForm = Omit<CityRow, "created_at">;

function CitiesConfigTab() {
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [open, setOpen] = useState(false);

  async function loadCities() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/config/cities?siteIds=1");
      if (!res.ok) throw new Error("Failed to load");
      setCities((await res.json()) as CityRow[]);
    } catch {
      setFetchError("Could not load cities from Google Sheets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCities();
  }, []);

  function openEdit(row: CityRow) {
    setSaveStatus("idle");
    setEditing({
      rowIndex: row.rowIndex,
      site_id: row.site_id,
      city: row.city,
      state: row.state,
      country: row.country,
      target_keyword: row.target_keyword,
    });
  }

  async function handleDelete(row: CityRow) {
    if (!confirm(`Delete "${row.city}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/config/cities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: row.rowIndex,
          site_id: Number(row.site_id),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setCities((prev) => prev.filter((item) => item.rowIndex != row.rowIndex));
      toast.success("City deleted successfully!", {
        position: "bottom-right",
        classNames: {
          toast: "!bg-green-400/20",
          icon: "text-green-500",
          title: "!text-green-700",
        },
      });
    } catch {
      alert("Failed to delete. Try again.");
    }
  }

  async function handleSave() {
    if (!editing) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/config/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveStatus("done");
      setEditing(null);
      void loadCities();
      toast.success("City updated successfully!", {
        position: "bottom-right",
        classNames: {
          toast: "!bg-green-400/20",
          icon: "text-green-500",
          title: "!text-green-700",
        },
      });
    } catch {
      setSaveStatus("error");
    }
  }

  function handleAddSuccess(data: any[] = []) {
    setOpen(false);
    void loadCities();
    toast.success("City added successfully!", {
      position: "bottom-right",
      classNames: {
        toast: "!bg-green-400/20",
        icon: "text-green-500",
        title: "!text-green-700",
      },
    });
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="text-end">
          <CollapsibleTrigger
            className={"ms-auto cursor-pointer"}
            render={<Button variant={"outline"} />}
          >
            + Cities
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className={"mt-4"}>
          <AddCityTab onSuccess={handleAddSuccess} />
        </CollapsibleContent>
      </Collapsible>

      <br />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cities Config</CardTitle>
            <CardDescription>
              Cities sourced from the &quot;Cities Config&quot; tab in Google
              Sheets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadCities}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}

          {!loading && cities.length === 0 && !fetchError && (
            <p className="text-sm text-muted-foreground">
              No cities found in the sheet.
            </p>
          )}

          {cities.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site ID</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Target Keyword</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map((row) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell>{row.site_id}</TableCell>
                    <TableCell className="font-medium">{row.city}</TableCell>
                    <TableCell>{row.state}</TableCell>
                    <TableCell>{row.country}</TableCell>
                    <TableCell>{row.target_keyword}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(row)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className={"sm:max-w-2xl"}>
          <DialogHeader>
            <DialogTitle>Edit City — row {editing?.rowIndex}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1">
                <Label>Site ID</Label>
                <Input
                  disabled
                  value={editing.site_id}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, site_id: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>City</Label>
                <Input
                  value={editing.city}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, city: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>State</Label>
                <Input
                  value={editing.state}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, state: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Country</Label>
                <Input
                  value={editing.country}
                  onChange={(e) =>
                    setEditing((f) => f && { ...f, country: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Target Keyword</Label>
                <Textarea
                  className="min-h-[150px]"
                  value={editing.target_keyword}
                  onChange={(e) =>
                    setEditing(
                      (f) => f && { ...f, target_keyword: e.target.value },
                    )
                  }
                />
              </div>
              
            </div>
          )}

          {saveStatus === "error" && (
            <Alert variant="destructive">
              <AlertDescription>Failed to save. Try again.</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────
export default function ConfigManager() {
  return (
    <Tabs defaultValue="websites" orientation="horizontal">
      <TabsList className="mb-4">
        <TabsTrigger value="websites">Websites</TabsTrigger>
        <TabsTrigger value="cities-config">Cities</TabsTrigger>
      </TabsList>

      <TabsContent value="websites">
        <WebsitesTab />
      </TabsContent>
      <TabsContent value="cities-config">
        <CitiesConfigTab />
      </TabsContent>

      <TabsContent value="edit-config">
        <EditConfigTab />
      </TabsContent>
    </Tabs>
  );
}
