import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const SITES_FILE = path.join(process.cwd(), "data", "sites.json");

export async function POST(req: NextRequest) {
  const body = await req.json();
  fs.mkdirSync(path.dirname(SITES_FILE), { recursive: true });
  const sites: unknown[] = fs.existsSync(SITES_FILE)
    ? (JSON.parse(fs.readFileSync(SITES_FILE, "utf-8")) as unknown[])
    : [];
  sites.push({ ...body, created_at: new Date().toISOString() });
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET() {
  if (!fs.existsSync(SITES_FILE)) return NextResponse.json([]);
  return NextResponse.json(JSON.parse(fs.readFileSync(SITES_FILE, "utf-8")));
}
