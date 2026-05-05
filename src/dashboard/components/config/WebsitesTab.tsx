"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, SquarePen, Trash2 } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  addWebsiteRow,
  deleteWebsiteRow,
  setWebsites,
  updateWebsiteRow,
} from "@/lib/store/sheetsConfig/configSlice";

import { WebsitesRowConfig } from "@/types/data";

export default function WebsitesTab() {
  const dispatch = useAppDispatch();
  const { websites, isLoading } = useAppSelector((state) => state.config);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [editing, setEditing] = useState<WebsitesRowConfig | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
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
      dispatch(setWebsites((await res.json()) as WebsitesRowConfig[]));
    } catch (err) {
      setFetchError("Could not load sites from Google Sheets.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: WebsitesRowConfig, index: number) {
    setSaveStatus("idle");
    setEditing({ ...row });
    setEditingIndex(index);
  }

  async function handleDelete(row: WebsitesRowConfig, index: number) {
    if (!confirm(`Delete "${row.domain}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/config/sites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: index + 2,
          site_id: Number(row.site_id),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch(deleteWebsiteRow(index));

      toast.success("Site deleted successfully!", {
        position: "top-right",
        classNames: {
          toast: "!bg-green-500/20 !border-green-300",
          icon: "text-green-600",
          title: "!text-green-700",
        },
      });
    } catch (err) {
      toast.error("Failed to remove. Try again.", {
        position: "top-right",
        classNames: {
          toast: "!bg-red-500/20 !border-red-300",
          icon: "text-red-600",
          title: "!text-red-700",
        },
      });
      console.error(err);
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
      dispatch(
        updateWebsiteRow({ data: editing, index: Number(editingIndex) }),
      );
      setEditing(null);
      setEditingIndex(null);

      toast.success("Site updated successfully!", {
        position: "top-right",
        classNames: {
          toast: "!bg-green-500/20 !border-green-300",
          icon: "text-green-600",
          title: "!text-green-700",
        },
      });
    } catch (err) {
      setSaveStatus("error");
      console.error(err);
    }
  }

  function handleAddSuccess(items?: any[]) {
    setOpen(false);

    let rowCount = websites.length;
    items?.forEach((item) => {
      dispatch(
        addWebsiteRow({
          rowIndex: rowCount + 2,
          site_id: item[0],
          domain: item[1],
          brand_name: item[2],
          industry: item[3],
          cities: item[4],
        }),
      );
      rowCount++;
    });

    toast.success("Site added successfully!", {
      position: "top-right",
      classNames: {
        toast: "!bg-green-500/20 !border-green-300",
        icon: "text-green-600",
        title: "!text-green-700",
      },
    });
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="text-end">
          <CollapsibleTrigger
            className="ms-auto cursor-pointer"
            render={<Button variant="outline" />}
          >
            <Plus /> Website
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-4">
          <AddWebsiteTab onSuccess={handleAddSuccess} />
        </CollapsibleContent>
      </Collapsible>

      <br />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Websites</CardTitle>
            <CardDescription>
              Sites sourced from the "Sites Config" tab in Google Sheets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSites}
            disabled={loading || isLoading}
          >
            {loading || isLoading ? "Loading…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}
          {!loading && !isLoading && websites.length === 0 && !fetchError && (
            <p className="text-sm text-muted-foreground">
              No sites found in the sheet.
            </p>
          )}
          {websites.length > 0 && (
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
                {websites.map((row, index) => (
                  <TableRow key={index}>
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
                        onClick={() => openEdit(row, index)}
                      >
                        <SquarePen />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="destructive"
                        onClick={() => handleDelete(row, index)}
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
          if (!open) {
            setEditing(null);
            setEditingIndex(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Website — Site Id {editing?.site_id}</DialogTitle>
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

interface Props {
  onSuccess?: (data?: unknown[]) => void;
}

function AddWebsiteTab({ onSuccess }: Props) {
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

  async function handleSubmit(e: React.SubmitEvent) {
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
      const resp = (await res.json()) as { items?: unknown[] };

      onSuccess?.(resp.items);
    } catch (err) {
      setStatus("error");
      console.error(err);
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
              <Label htmlFor="cities">Cities</Label>
              <Textarea
                id="cities"
                className="min-h-[100px]"
                placeholder="e.g. Mumbai, Delhi (comma-separated)"
                value={form.cities}
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
