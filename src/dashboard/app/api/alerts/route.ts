import { NextRequest, NextResponse } from "next/server";
const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  const res = await fetch(`${API}/alerts${params ? `?${params}` : ""}`);
  return NextResponse.json(await res.json(), { status: res.status });
}
export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API}/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
