import { NextRequest, NextResponse } from "next/server";
import { getCookie } from "@/lib/utils";

const API = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  const cookie = req.headers.get("cookie");
  const token = getCookie("seo-token", cookie || "");

  const res = await fetch(`${API}/approvals${params ? `?${params}` : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const cookie = req.headers.get("cookie");
  const token = getCookie("seo-token", cookie || "");

  const res = await fetch(`${API}/approvals`, {
    method: "POST",
    body: JSON.stringify(await req.json()),
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
