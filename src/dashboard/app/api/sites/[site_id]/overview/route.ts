/**
 * GET /api/sites/[site_id]/overview
 * Returns site metrics: avg position, GBP pack status, avg rating,
 * open alerts count, and traffic sparkline (28-day clicks).
 * Reads from Google Sheets and the local alerts store.
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth(siteId: string) {
  const raw = process.env[`GSC_OAUTH_SITE_${siteId}`];
  if (!raw) throw new Error(`Missing GSC_OAUTH_SITE_${siteId}`);
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

function getSiteUrl(siteId: string): string {
  const map: Record<string, string> = { "1": "https://lifecircle.in" };
  const url = map[siteId];
  if (!url) throw new Error(`Unknown site_id=${siteId}`);
  return url;
}

type Params = { params: { site_id: string } };

export async function GET(_req: Request, { params }: Params) {
  const { site_id } = params;
  const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

  // Fetch open alerts count
  let open_alerts = 0;
  try {
    const alertsRes = await fetch(
      `${API}/alerts?status=open&site_id=${site_id}`,
      { cache: "no-store" },
    );
    if (!alertsRes.ok) throw new Error(`alerts API ${alertsRes.status}`);
    const alertsData = await alertsRes.json() as { total: number };
    open_alerts = alertsData.total ?? 0;
  } catch (err) {
    console.error("[overview] alerts fetch failed:", err);
  }

  // Fetch GSC data for avg position + sparkline
  let avg_position: number | null = null;
  const traffic_sparkline: Array<{ date: string; clicks: number }> = [];

  try {
    const auth = getAuth(site_id);
    const siteUrl = getSiteUrl(site_id);
    const sc = google.searchconsole({ version: "v1", auth });

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // Position
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

    // Daily clicks for sparkline
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
    /* GSC may not be available in dev */
    console.error("GSC Error : ", err);
  }
  
  return NextResponse.json({
    site_id: Number(site_id),
    avg_position,
    gbp_pack: null, // populated by GBP connector when available
    avg_rating: null, // populated by review module when available
    open_alerts,
    traffic_sparkline,
    last_updated: new Date().toISOString(),
  });
}
