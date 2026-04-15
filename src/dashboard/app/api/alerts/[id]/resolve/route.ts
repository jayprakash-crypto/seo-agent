import { NextRequest, NextResponse } from "next/server";
const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";
type Params = { params: { id: string } };
export async function POST(_req: NextRequest, { params }: Params) {
  const res = await fetch(`${API}/alerts/${params.id}/resolve`, { method: "POST" });
  return NextResponse.json(await res.json(), { status: res.status });
}
