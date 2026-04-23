import { getCookie } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie");
  const token = getCookie("seo-token", cookie || "");

  const res = await fetch(`${API}/users/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
