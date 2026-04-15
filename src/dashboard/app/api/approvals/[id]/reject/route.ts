import { NextRequest, NextResponse } from "next/server";
const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";
type Params = { params: { id: string } };
export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const res = await fetch(`${API}/approvals/${params.id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
