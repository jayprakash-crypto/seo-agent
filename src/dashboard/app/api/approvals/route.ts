import { NextRequest, NextResponse } from "next/server";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();

  const res = await fetch(`${API}/approvals${params ? `?${params}` : ""}`, {
    headers: req.headers,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const res = await fetch(`${API}/approvals`, {
    method: "POST",
    body: JSON.stringify(await req.json()),
    headers: req.headers,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
