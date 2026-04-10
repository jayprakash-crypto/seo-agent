/**
 * Next.js proxy route for GET /api/approvals and POST /api/approvals.
 * Forwards to the Express approvals API running on port 3002.
 */

import { NextRequest, NextResponse } from "next/server";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  const res = await fetch(`${API}/approvals${params ? `?${params}` : ""}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API}/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
