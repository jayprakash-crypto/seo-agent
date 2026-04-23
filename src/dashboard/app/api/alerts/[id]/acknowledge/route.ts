import { NextRequest, NextResponse } from "next/server";
import { getCookie } from "@/lib/utils";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const cookie = req.headers.get("cookie");
  const token = getCookie("seo-token", cookie || "");

  const res = await fetch(`${API}/alerts/${id}/acknowledge`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
