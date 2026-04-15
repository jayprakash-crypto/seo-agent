/**
 * Config API — stores/reads operator config in a local JSON file.
 * In production, replace with a DB-backed store.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const CONFIG_FILE = path.join(process.cwd(), "data", "config.json");

function readConfig(): Record<string, unknown> {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json(readConfig());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true });
}
