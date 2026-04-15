import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const CITIES_FILE = path.join(process.cwd(), "data", "cities.json");

export async function POST(req: NextRequest) {
  const body = await req.json();
  fs.mkdirSync(path.dirname(CITIES_FILE), { recursive: true });
  const cities: unknown[] = fs.existsSync(CITIES_FILE)
    ? (JSON.parse(fs.readFileSync(CITIES_FILE, "utf-8")) as unknown[])
    : [];
  cities.push({ ...body, created_at: new Date().toISOString() });
  fs.writeFileSync(CITIES_FILE, JSON.stringify(cities, null, 2));
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET() {
  if (!fs.existsSync(CITIES_FILE)) return NextResponse.json([]);
  return NextResponse.json(JSON.parse(fs.readFileSync(CITIES_FILE, "utf-8")));
}
