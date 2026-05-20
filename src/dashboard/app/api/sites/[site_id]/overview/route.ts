import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const raw = process.env[`GSC_OAUTH_SITE`];
  if (!raw) throw new Error(`Missing GSC_OAUTH_SITE`);
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

type Params = { params: Promise<{ site_id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { site_id } = await params;
  const { searchParams } = new URL(req.url);
  const siteUrl = searchParams.get("site_url") as string | undefined;

  const API = process.env.BACKEND_API_URL ?? "http://localhost:3002";

  let open_alerts = 0;
  try {
    const alertsRes = await fetch(
      `${API}/alerts?status=open&site_id=${site_id}`,
      {
        cache: "no-store",
        headers: req.headers,
      } as RequestInit,
    );
    if (!alertsRes.ok) throw new Error(`alerts API ${alertsRes.status}`);
    const alertsData = (await alertsRes.json()) as { total: number };
    open_alerts = alertsData.total ?? 0;
  } catch (err) {
    console.error("[overview] alerts fetch failed:", err);
  }

  let avg_position: number | null = null;
  const traffic_sparkline: Array<{ date: string; clicks: number }> = [];

  try {
    const gAuth = getAuth();
    const sc = google.searchconsole({ version: "v1", auth: gAuth });

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const posRes = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: [],
        rowLimit: 1,
      },
    });
    avg_position = posRes.data.rows?.[0]?.position ?? null;

    const clickRes = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ["date"],
        rowLimit: 28,
      },
    });
    for (const row of clickRes.data.rows ?? []) {
      traffic_sparkline.push({
        date: row.keys?.[0] ?? "",
        clicks: row.clicks ?? 0,
      });
    }
  } catch (err) {
    console.error("GSC Error:", err);
  }

  return NextResponse.json({
    site_id: Number(site_id),
    avg_position,
    gbp_pack: null,
    avg_rating: null,
    open_alerts,
    traffic_sparkline,
    last_updated: new Date().toISOString(),
  });
}
