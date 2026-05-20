import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const raw = process.env.GSC_OAUTH_SITE;
  if (!raw) throw new Error("Missing GSC_OAUTH_SITE");
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw) as object,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSpreadsheetId() {
  const key = `SHEETS_ID`;
  const id = process.env[key];
  if (!id) throw new Error(`Missing ${key}`);
  return id;
}

export async function GET(req: NextRequest) {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth() });
    const { data } = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: getSpreadsheetId(),
      ranges: [
        "Sites Config!A:E",
        "Cities Config!A:E",
        "Keywords Config!A:C",
        "Competitors Config!A:C",
      ],
    });

    return NextResponse.json(data.valueRanges);
  } catch (err) {
    console.error("[cities GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
