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
  addCitiesRow,
  deleteCitiesRow,
  setCities,
  updateCitiesRow,
} from "@/lib/store/sheetsConfig/configSlice";

import { CityRowConfig } from "@/types/data";

export default function CitiesTab() {
  const dispatch = useAppDispatch();
  const { cities, isLoading } = useAppSelector((state) => state.config);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [editing, setEditing] = useState<CityRowConfig | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
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
      dispatch(setCities((await res.json()) as CityRowConfig[]));
    } catch (err) {
      setFetchError("Could not load cities from Google Sheets.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: CityRowConfig, index: number) {
    setSaveStatus("idle");
    setEditing({ ...row });
    setEditingIndex(index);
  }

  async function handleDelete(row: CityRowConfig, index: number) {
    if (!confirm(`Delete "${row.city}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/config/cities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: index + 2,
          site_id: Number(row.site_id),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch(deleteCitiesRow(index));

      toast.success("City removed successfully!", {
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
      const res = await fetch("/api/config/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveStatus("done");
      dispatch(updateCitiesRow({ data: editing, index: Number(editingIndex) }));
      setEditing(null);
      setEditingIndex(null);

      toast.success("City updated successfully!", {
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

    let rowCount = cities.length;
    items?.forEach((item) => {
      dispatch(
        addCitiesRow({
          rowIndex: rowCount + 2,
          site_id: item[0],
          city: item[1],
          state: item[2],
          country: item[3],
          target_keyword: item[4],
        }),
      );
      rowCount++;
    });

    toast.success("City added successfully!", {
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
            <Plus /> City
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-4">
          <AddCityTab onSuccess={handleAddSuccess} />
        </CollapsibleContent>
      </Collapsible>

      <br />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cities Config</CardTitle>
            <CardDescription>
              Cities sourced from the "Cities Config" tab in Google Sheets.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadCities}
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
          {!loading && !isLoading && cities.length === 0 && !fetchError && (
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
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map((row, index) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell>{row.site_id}</TableCell>
                    <TableCell className="font-medium">{row.city}</TableCell>
                    <TableCell>{row.state}</TableCell>
                    <TableCell>{row.country}</TableCell>
                    <TableCell className="max-w-[250px] truncate">
                      {row.target_keyword}
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

interface Props {
  onSuccess?: (data?: unknown[]) => void;
}

function AddCityTab({ onSuccess }: Props) {
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

  async function handleSubmit(e: React.SubmitEvent) {
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
        <CardTitle>Add City</CardTitle>
        <CardDescription>
          Add a new city to target for local SEO rankings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="site_id">Site ID</Label>
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
                placeholder="e.g. Hyderabad"
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
                placeholder="e.g. Telangana"
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
                placeholder="e.g. home care services in Hyderabad, home care Hyderabad"
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
