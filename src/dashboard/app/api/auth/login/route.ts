import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.APPROVALS_API_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  const body = await req.json();

  let data: { success: boolean; user?: {}; token?: string; message?: string };

  try {
    const upstream = await fetch(`${API_URL}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    data = await upstream.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Auth service unavailable." },
      { status: 503 },
    );
  }

  if (!data.success || !data.token) {
    return NextResponse.json(
      { success: false, message: data.message ?? "Invalid email or password." },
      { status: 401 },
    );
  }

  const res = NextResponse.json(data);
  return res;
}
