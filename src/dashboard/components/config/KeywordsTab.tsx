"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
} from "../ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  addKeywordsRow,
  deleteKeywordsRow,
  setKeywords,
  updateKeywordsRow,
} from "@/lib/store/sheetsConfig/configSlice";

import { KeywordsRowConfig } from "@/types/data";

export default function KeywordsTab() {
  const dispatch = useAppDispatch();
  const { keywords, isLoading } = useAppSelector((state) => state.config);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [editing, setEditing] = useState<KeywordsRowConfig | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [open, setOpen] = useState(false);

  async function loadKeywords() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/config/keywords?siteIds=1");
      if (!res.ok) throw new Error("Failed to load");
      dispatch(setKeywords((await res.json()) as KeywordsRowConfig[]));
    } catch (err) {
      setFetchError("Could not load keywords from Google Sheets.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: KeywordsRowConfig, index: number) {
    setSaveStatus("idle");
    setEditing({ ...row });
    setEditingIndex(index);
  }

  async function handleDelete(row: KeywordsRowConfig, index: number) {
    if (
      !confirm(
        `Delete ${row.domain} site and target keywords? This cannot be undone.`,
      )
    )
      return;
    try {
      const res = await fetch("/api/config/keywords", {
        method: "DELETE",
        body: JSON.stringify({ rowIndex: index + 2 }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch(deleteKeywordsRow(index));

      toast.success("Target Keywords removed successfully!", {
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
      const res = await fetch("/api/config/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, site_id: Number(editing.site_id) }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveStatus("done");
      dispatch(
        updateKeywordsRow({ data: editing, index: Number(editingIndex) }),
      );
      setEditing(null);
      setEditingIndex(null);

      toast.success("Keywords updated successfully!", {
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

    let rowCount = keywords.length;
    items?.forEach((item) => {
      dispatch(
        addKeywordsRow({
          rowIndex: rowCount + 2,
          site_id: item.site_id,
          domain: item.domain,
          target_keywords: item.target_keywords,
        }),
      );

      rowCount++;
    });

    toast.success("Keywords added successfully!", {
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
            <Plus /> Keywords
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-4">
          <AddKeywords onSuccess={handleAddSuccess} />
        </CollapsibleContent>
      </Collapsible>

      <br />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>
              Site's Target Keywords sourced from the "Keywords" tab in Google
              Sheets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadKeywords}
            disabled={loading || isLoading}
          >
            {loading || isLoading ? "Loading..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}
          {!loading && !isLoading && keywords.length === 0 && !fetchError && (
            <p className="text-sm text-muted-foreground">
              No keywords config found in the sheet.
            </p>
          )}
          {keywords.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site ID</TableHead>
                  <TableHead>Site Domain</TableHead>
                  <TableHead>Target Keywords</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((kw, index) => (
                  <TableRow key={kw.rowIndex}>
                    <TableCell>{kw.site_id}</TableCell>
                    <TableCell className="font-medium">{kw.domain}</TableCell>
                    <TableCell
                      className="max-w-[600px] truncate"
                      title={kw.target_keywords}
                    >
                      {kw.target_keywords}
                    </TableCell>
                    <TableCell className="flex justify-center gap-2">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => openEdit(kw, index)}
                      >
                        <SquarePen />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="destructive"
                        onClick={() => handleDelete(kw, index)}
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
            <DialogTitle>
              Edit Target Keywords — row {editing?.rowIndex}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1">
                <Label>Site ID</Label>
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
              <div className="space-y-1 col-span-2">
                <Label>Target Keyword</Label>
                <Textarea
                  className="min-h-[300px]"
                  value={editing.target_keywords}
                  onChange={(e) =>
                    setEditing(
                      (f) => f && { ...f, target_keywords: e.target.value },
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

interface Props {
  onSuccess?: (data?: unknown[]) => void;
}

function AddKeywords({ onSuccess }: Props) {
  const [form, setForm] = useState({
    site_id: "1",
    domain: "",
    target_keywords: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/config/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
      setForm((f) => ({ ...f, domain: "", target_keywords: "" }));
      const resp = (await res.json()) as { items?: unknown[] };
      onSuccess?.(resp.items);
    } catch (err) {
      setStatus("error");
      console.error(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Keywords</CardTitle>
        <CardDescription>
          Add a new keywords for your site to target for SEO rankings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="site_id">Site ID</Label>
              <Input
                id="site_id"
                placeholder="1"
                value={form.site_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, site_id: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="domain">Site Domain</Label>
              <Input
                id="domain"
                placeholder="https://example.com"
                value={form.domain}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domain: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="keyword">Target Keywords</Label>
              <Textarea
                id="keyword"
                className="min-h-[150px]"
                placeholder="e.g. home care services, home care"
                value={form.target_keywords}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target_keywords: e.target.value }))
                }
              />
            </div>
          </div>

          {status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to add keywords. Try again.
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Add"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
