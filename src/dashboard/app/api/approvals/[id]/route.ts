import { NextRequest, NextResponse } from "next/server";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const res = await fetch(`${API}/approvals/${params.id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
