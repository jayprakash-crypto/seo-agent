"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { getSiteName } from "@/lib/sites";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Alert {
  id: string;
  site_id: number;
  module: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  resolved_at?: string;
}

const SEVERITY_VARIANT: Record<Alert["severity"], "destructive" | "default" | "secondary"> = {
  critical: "destructive",
  warning: "default",
  info: "secondary",
};

const SEVERITY_BORDER: Record<Alert["severity"], string> = {
  critical: "border-l-4 border-l-red-500",
  warning: "border-l-4 border-l-amber-400",
  info: "border-l-4 border-l-blue-400",
};

function AlertCard({
  alert,
  onAction,
}: {
  alert: Alert;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

  async function acknowledge() {
    setLoading(true);
    await fetch(`${API}/alerts/${alert.id}/acknowledge`, { method: "POST" });
    setLoading(false);
    onAction();
  }

  async function resolve() {
    setLoading(true);
    await fetch(`${API}/alerts/${alert.id}/resolve`, { method: "POST" });
    setLoading(false);
    onAction();
  }

  return (
    <Card className={SEVERITY_BORDER[alert.severity]}>
      <CardContent className="pt-3 pb-3">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={SEVERITY_VARIANT[alert.severity]}>
            {alert.severity.toUpperCase()}
          </Badge>
          <Badge variant="outline">{alert.module}</Badge>
          <span className="text-xs text-muted-foreground">
            {getSiteName(alert.site_id)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(alert.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <p className="mb-0.5 font-medium text-sm">{alert.title}</p>
        <p className="mb-2 text-xs text-muted-foreground">{alert.detail}</p>

        <div className="flex gap-2">
          {alert.status === "open" && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={acknowledge}
              >
                Acknowledge
              </Button>
              <Button
                size="sm"
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
                onClick={resolve}
              >
                Resolve
              </Button>
            </>
          )}
          {alert.status === "acknowledged" && (
            <Button
              size="sm"
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
              onClick={resolve}
            >
              Resolve
            </Button>
          )}
          {alert.status === "resolved" && (
            <span className="text-xs text-green-600 font-medium">
              Resolved ✓
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<Alert["severity"] | "all">("all");
  const [loading, setLoading] = useState(true);

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: "open" });
      if (filter !== "all") params.set("severity", filter);
      const res = await fetch(`${API}/alerts?${params.toString()}`);
      const data = (await res.json()) as { alerts: Alert[] };
      setAlerts(data.alerts ?? []);
    } catch {
      /* keep current state */
    } finally {
      setLoading(false);
    }
  }, [API, filter]);

  useEffect(() => {
    void fetchAlerts();
    const socket = getSocket();
    socket.on("alert:created", () => void fetchAlerts());
    socket.on("alert:updated", () => void fetchAlerts());
    return () => {
      socket.off("alert:created");
      socket.off("alert:updated");
    };
  }, [fetchAlerts]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div>
      {/* Filter strip */}
      <div className="mb-3 flex items-center gap-2">
        {criticalCount > 0 && (
          <Badge variant="destructive">{criticalCount} critical</Badge>
        )}
        <div className="ml-auto flex gap-1">
          {(["all", "critical", "warning", "info"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "default" : "outline"}
              onClick={() => setFilter(s)}
              className="capitalize text-xs h-7 px-2.5"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading alerts…
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="text-2xl">🟢</span>
          <p>No open alerts</p>
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-16rem)]">
        <div className="space-y-2 p-1 pr-4">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onAction={fetchAlerts} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
