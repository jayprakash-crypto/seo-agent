"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { getSiteName } from "@/lib/sites";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { proxyFetch } from "@/lib/api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

// ── Types ─────────────────────────────────────────────────────────────
interface Approval {
  id: string;
  site_id: number;
  module: string;
  type: string;
  priority: number;
  title: string;
  status: "pending" | "approved" | "rejected" | "deferred";
  content: Object;
  preview_url?: string;
  created_at: string;
  actioned_at: string;
  actioned_by: string | null;
  reject_reason: string | null;
  actioned_user_name?: string | null;
}

interface PageResult {
  approvals: Approval[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_VARIANTS: Record<
  Approval["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "default",
  approved: "secondary",
  rejected: "destructive",
  deferred: "outline",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
};

const PAGE_SIZES = [10, 25, 50];

// ── Component ─────────────────────────────────────────────────────────
export default function AllApprovals() {
  const [data, setData] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState(10);
  const [offset, setOffset] = useState(0);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: "created_at",
        limit: String(pageSize),
        offset: String(offset),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await proxyFetch(`/api/approvals?${params}`);
      const json = (await res.json()) as PageResult;

      setData(json);
    } catch {
      // keep previous state on network error
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pageSize, offset]);

  // Reset to page 0 when filter or page-size changes
  useEffect(() => {
    setOffset(0);
  }, [statusFilter, pageSize]);

  useEffect(() => {
    void fetchPage();

    const socket = getSocket();
    socket.on("approval:created", () => void fetchPage());
    socket.on("approval:updated", () => void fetchPage());

    return () => {
      socket.off("approval:created");
      socket.off("approval:updated");
    };
  }, [fetchPage]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const currentPage = Math.floor(offset / pageSize) + 1;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          All Approvals
          {data && (
            <span className="ml-1.5 font-normal">({data.total} total)</span>
          )}
        </h3>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v: string | null) => {
              if (v) setStatusFilter(v);
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue className={"capitalize"} placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="deferred">Deferred</SelectItem>
            </SelectContent>
          </Select>

          {/* Page size */}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden sm:table-cell">Site</TableHead>
              <TableHead className="hidden md:table-cell">Module</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Rejected Reason</TableHead>
              <TableHead>Actioned by</TableHead>
              <TableHead>Actioned On</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            </TableBody>
          ) : !data || data?.approvals?.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No approvals found.
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            data?.approvals?.map((a, idx) => (
              <CollapsibleRow
                key={a.id}
                rowData={a}
                rowCount={offset + idx + 1}
              />
            ))
          )}
        </Table>
      </div>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={offset + pageSize >= (data.total ?? 0)}
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const PRIORITY_MAP: Record<
  number,
  {
    label: string;
    variant: "destructive" | "default" | "secondary" | "outline";
  }
> = {
  1: { label: "Critical", variant: "destructive" },
  2: { label: "High", variant: "default" },
  3: { label: "Medium", variant: "secondary" },
};

const CollapsibleRow = ({
  rowData,
  rowCount,
}: {
  rowData: Approval;
  rowCount: number;
}) => {
  const priority = PRIORITY_MAP[rowData.priority] ?? PRIORITY_MAP[3];
  const previewText = JSON.stringify(rowData.content, null, 2);

  return (
    <Collapsible render={<TableBody />}>
      <CollapsibleTrigger nativeButton={false} render={<TableRow />}>
        <TableCell className="text-xs text-muted-foreground">
          {rowCount}
        </TableCell>
        <TableCell className="max-w-xs truncate font-medium text-sm">
          {rowData.title}
        </TableCell>

        <TableCell className="hidden text-xs sm:table-cell">
          {getSiteName(rowData.site_id)}
        </TableCell>
        <TableCell className="hidden text-xs md:table-cell">
          {rowData.module}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {PRIORITY_LABELS[rowData.priority] ?? "—"}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge
            variant={STATUS_VARIANTS[rowData.status]}
            className="text-xs capitalize"
          >
            {rowData.status}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(rowData.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {rowData.reject_reason ?? "—"}
        </TableCell>

        <TableCell className="text-xs text-muted-foreground">
          {rowData.actioned_user_name ?? "—"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {rowData.actioned_at
            ? new Date(rowData.actioned_at).toLocaleDateString()
            : "—"}
        </TableCell>
      </CollapsibleTrigger>

      <CollapsibleContent render={<TableRow />}>
        <TableCell colSpan={10} className="p-0">
          <div className="p-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={priority.variant}>{priority.label}</Badge>
                  <Badge variant="outline">{rowData.module}</Badge>
                  <Badge variant="secondary">{rowData.type}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {getSiteName(rowData.site_id)} ·{" "}
                    {new Date(rowData.created_at).toLocaleDateString()}
                  </span>
                </div>
                <CardTitle className="mt-1 text-base">
                  {rowData.title}
                </CardTitle>
              </CardHeader>

              <CardContent>
                <ScrollArea className="h-32 rounded border bg-muted p-2">
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {previewText}
                    {/* {JSON.stringify(rowData.content).length > 400 ? "…" : ""} */}
                  </pre>
                </ScrollArea>
                {rowData.preview_url && (
                  <a
                    href={rowData.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-xs text-blue-600 hover:underline"
                  >
                    Preview →
                  </a>
                )}
              </CardContent>
            </Card>
          </div>
        </TableCell>
      </CollapsibleContent>
    </Collapsible>
  );
};
