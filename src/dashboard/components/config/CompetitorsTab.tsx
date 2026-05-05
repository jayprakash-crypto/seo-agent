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
import { Textarea } from "../ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  addCompetitorsRow,
  deleteCompetitorsRow,
  setCompetitors,
  updateCompetitorsRow,
} from "@/lib/store/sheetsConfig/configSlice";

import { CompetitorRowConfig } from "@/types/data";

export default function CompetitorsTab() {
  const dispatch = useAppDispatch();
  const { competitors, isLoading } = useAppSelector((state) => state.config);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [editing, setEditing] = useState<CompetitorRowConfig | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [open, setOpen] = useState(false);

  async function loadCompetitors() {
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/config/competitors?siteIds=1");
      if (!res.ok) throw new Error("Failed to load");
      dispatch(setCompetitors((await res.json()) as CompetitorRowConfig[]));
    } catch (err) {
      setFetchError("Could not load competitors from Google Sheets.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: CompetitorRowConfig, index: number) {
    setSaveStatus("idle");
    setEditing({ ...row });
    setEditingIndex(index);
  }

  async function handleDelete(row: CompetitorRowConfig, index: number) {
    if (
      !confirm(
        `Delete competitor's for site_id "${row.site_id}"? This cannot be undone.`,
      )
    )
      return;
    try {
      const res = await fetch("/api/config/competitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex: index + 2 }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch(deleteCompetitorsRow(index));

      toast.success("Competitor removed successfully!", {
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
      const res = await fetch("/api/config/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, site_id: Number(editing.site_id) }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveStatus("done");
      dispatch(
        updateCompetitorsRow({ data: editing, index: Number(editingIndex) }),
      );
      setEditing(null);
      setEditingIndex(null);

      toast.success("Competitor updated successfully!", {
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

    let rowCount = competitors.length;
    items?.forEach((item) => {
      dispatch(
        addCompetitorsRow({
          rowIndex: rowCount + 2,
          site_id: item[0],
          domain: item[1],
          competitors_domain: item[2],
        }),
      );
      rowCount++;
    });

    toast.success("Competitor added successfully!", {
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
            <Plus /> Competitor
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-4">
          <AddCompetitor onSuccess={handleAddSuccess} />
        </CollapsibleContent>
      </Collapsible>

      <br />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Competitors</CardTitle>
            <CardDescription>
              Competitor domains sourced from the "Competitors Domain" tab.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadCompetitors}
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
          {!loading &&
            !isLoading &&
            competitors.length === 0 &&
            !fetchError && (
              <p className="text-sm text-muted-foreground">
                No competitors found in the sheet.
              </p>
            )}
          {competitors.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site ID</TableHead>
                  <TableHead>My Domain</TableHead>
                  <TableHead>Competitor Domain</TableHead>
                  <TableHead className="w-24 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((row, index) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell>{row.site_id}</TableCell>
                    <TableCell>{row.domain}</TableCell>
                    <TableCell className="max-w-[600px] truncate font-medium text-blue-600">
                      {row.competitors_domain}
                    </TableCell>
                    <TableCell className="flex justify-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => openEdit(row, index)}
                      >
                        <SquarePen className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleDelete(row, index)}
                      >
                        <Trash2 className="h-4 w-4" />
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
        onOpenChange={(o) => !o && (setEditing(null), setEditingIndex(null))}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Competitor — Row {editing?.rowIndex}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="space-y-1">
                <Label>Site Id</Label>
                <Input
                  value={editing.site_id}
                  onChange={(e) =>
                    setEditing({ ...editing, site_id: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>My Domain</Label>
                <Input
                  value={editing.domain}
                  onChange={(e) =>
                    setEditing({ ...editing, domain: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Competitor Domain</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={editing.competitors_domain}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      competitors_domain: e.target.value,
                    })
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
              {saveStatus === "saving" ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddCompetitor({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    site_id: "1",
    domain: "",
    competitors_domain: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/config/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, site_id: Number(form.site_id) }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("done");
      setForm({ ...form, competitors_domain: "" });
      onSuccess();
    } catch (err) {
      setStatus("error");
      console.error(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Competitor</CardTitle>
        <CardDescription>Track a new competitor for analysis.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Site Id</Label>
              <Input
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>My Domain</Label>
              <Input
                placeholder="https://mysite.com"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Competitor Domain</Label>
              <Textarea
                className="min-h-[100px]"
                placeholder="competitor.com"
                value={form.competitors_domain}
                onChange={(e) =>
                  setForm({ ...form, competitors_domain: e.target.value })
                }
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Add Competitor"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
