import { NextRequest, NextResponse } from "next/server";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const res = await fetch(`${API}/users/me`, {
    headers: req.headers,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
