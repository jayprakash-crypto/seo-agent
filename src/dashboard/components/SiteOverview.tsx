"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SITES } from "@/lib/sites";
import { proxyFetch } from "@/lib/api";

interface SiteMetrics {
  site_id: number;
  avg_position: number | null;
  gbp_pack: boolean;
  avg_rating: number | null;
  open_alerts: number;
  traffic_sparkline: Array<{ date: string; clicks: number }>;
  last_updated: string;
}

function Sparkline({ data }: { data: Array<{ date: string; clicks: number }> }) {
  if (!data || data.length === 0) {
    return <div className="h-10 text-xs text-muted-foreground flex items-center">No traffic data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={100}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="clicks"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          dot={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          labelFormatter={() => ""}
          formatter={(v) => [Number(v ?? 0), "Clicks"]}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SiteDetailDrawer({
  siteId,
  metrics,
  open,
  onClose,
}: {
  siteId: number;
  metrics: SiteMetrics;
  open: boolean;
  onClose: () => void;
}) {
  const site = SITES[siteId];
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader className="border-b">
          <SheetTitle>{site?.name ?? `Site ${siteId}`}</SheetTitle>
          <p className="text-sm text-muted-foreground">{site?.url}</p>
        </SheetHeader>

        <div className="space-y-4 px-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Avg Position</p>
              <p className="text-2xl font-bold">
                {metrics.avg_position?.toFixed(1) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Avg Rating</p>
              <p className="text-2xl font-bold">
                {metrics.avg_rating?.toFixed(1) ?? "—"}
                {metrics.avg_rating && (
                  <span className="text-sm text-muted-foreground"> / 5</span>
                )}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">GBP 3-Pack</p>
              <p className="text-2xl font-bold">
                {metrics.gbp_pack ? "✅" : "❌"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Open Alerts</p>
              <p className={`text-2xl font-bold ${metrics.open_alerts > 0 ? "text-red-600" : "text-green-600"}`}>
                {metrics.open_alerts}
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-3 text-xs text-muted-foreground">Traffic (28d)</p>
            <Sparkline data={metrics.traffic_sparkline} />
          </div>

          <p className="text-xs text-muted-foreground">
            Last updated:{" "}
            {new Date(metrics.last_updated).toLocaleString()}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SiteCard({
  metrics,
  onClick,
}: {
  metrics: SiteMetrics;
  onClick: () => void;
}) {
  const site = SITES[metrics.site_id];

  return (
    <Card
      className="cursor-pointer transition hover:shadow-md"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {site?.name ?? `Site ${metrics.site_id}`}
          </CardTitle>
          {metrics.open_alerts > 0 ? (
            <Badge variant="destructive">{metrics.open_alerts} alerts</Badge>
          ) : (
            <Badge variant="secondary">OK</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{site?.url}</p>
      </CardHeader>

      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold">
              {metrics.avg_position?.toFixed(1) ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">Avg Pos</p>
          </div>
          <div>
            <p className="text-lg font-bold">
              {metrics.gbp_pack ? "✅" : "❌"}
            </p>
            <p className="text-xs text-muted-foreground">3-Pack</p>
          </div>
          <div>
            <p className="text-lg font-bold">
              {metrics.avg_rating?.toFixed(1) ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">Rating</p>
          </div>
        </div>

        <Sparkline data={metrics.traffic_sparkline} />
      </CardContent>
    </Card>
  );
}

export default function SiteOverview() {
  const [metrics, setMetrics] = useState<SiteMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const siteIds = Object.keys(SITES).map(Number);
      const results = await Promise.all(
        siteIds.map(async (id) => {
          const res = await proxyFetch(`/api/sites/${id}/overview`);
          return res.json() as Promise<SiteMetrics>;
        }),
      );
      setMetrics(results);
    } catch {
      /* keep current state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
    // Auto-refresh every 60 minutes
    const timer = setInterval(() => void fetchMetrics(), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Loading site overview…
      </div>
    );
  }

  const selected = metrics.find((m) => m.site_id === selectedSite);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <SiteCard
            key={m.site_id}
            metrics={m}
            onClick={() => setSelectedSite(m.site_id)}
          />
        ))}
      </div>

      {selected && (
        <SiteDetailDrawer
          siteId={selected.site_id}
          metrics={selected}
          open={selectedSite !== null}
          onClose={() => setSelectedSite(null)}
        />
      )}
    </>
  );
}
