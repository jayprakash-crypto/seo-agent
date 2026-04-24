import { NextRequest, NextResponse } from "next/server";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const res = await fetch(`${API}/approvals/${id}/reject`, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(await req.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
