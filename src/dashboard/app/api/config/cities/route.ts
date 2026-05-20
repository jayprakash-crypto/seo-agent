import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const TAB = "Cities Config";
// Columns: A=city  B=state  C=country  D=target_keyword
const RANGE_ALL = `'${TAB}'!A:E`;

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

async function getSheetGid(spreadsheetId: string): Promise<number> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = data.sheets?.find((s) => s.properties?.title === TAB);
  if (!sheet?.properties?.sheetId == null)
    throw new Error(`Tab "${TAB}" not found`);
  return sheet!.properties!.sheetId!;
}

export async function GET(req: NextRequest) {
  try {
    const sheets = google.sheets({ version: "v4", auth: getAuth() });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: RANGE_ALL,
    });

    const rows = data.values ?? [];
    const cities = rows.slice(1).map((row, i) => ({
      rowIndex: i + 2, // 1-based; row 1 is the header
      site_id: row[0],
      city: row[1] ?? "",
      state: row[2] ?? "",
      country: row[3] ?? "",
      target_keyword: row[4] ?? "",
    }));

    return NextResponse.json(cities);
  } catch (err) {
    console.error("[cities GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      rowIndex?: number;
      site_id: number;
      city?: string;
      state?: string;
      country?: string;
      target_keyword?: string;
    };

    const {
      rowIndex,
      site_id,
      city = "",
      state = "",
      country = "",
      target_keyword = "",
    } = body;

    const sheets = google.sheets({ version: "v4", auth: getAuth() });
    const spreadsheetId = getSpreadsheetId();

    if (rowIndex) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${TAB}'!A${rowIndex}:E${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[Number(site_id), city, state, country, target_keyword]],
        },
      });
      return NextResponse.json({ ok: true, updated: rowIndex });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: RANGE_ALL,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[Number(site_id), city, state, country, target_keyword]],
      },
    });
    return NextResponse.json({ ok: true, appended: true }, { status: 201 });
  } catch (err) {
    console.error("[cities POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { rowIndex } = (await req.json()) as {
      rowIndex: number;
    };

    if (!rowIndex) {
      return NextResponse.json(
        { error: "rowIndex is required" },
        { status: 400 },
      );
    }

    const spreadsheetId = getSpreadsheetId();
    const sheetId = await getSheetGid(spreadsheetId);
    const sheets = google.sheets({ version: "v4", auth: getAuth() });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1, // 0-based
                endIndex: rowIndex, // exclusive
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({ ok: true, deleted: rowIndex });
  } catch (err) {
    console.error("[cities DELETE]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
