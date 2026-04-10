/**
 * GET /api/auth/setup-totp
 * Returns a QR code data URL for the operator to scan with their authenticator app.
 * Only callable with the SETUP_TOKEN env var for one-time setup.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateTotpSecret } from "@/lib/auth";
import QRCode from "qrcode";

export async function GET(req: NextRequest) {
  const setupToken = req.nextUrl.searchParams.get("token");
  if (!setupToken || setupToken !== process.env.SETUP_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { secret, otpauthUrl } = generateTotpSecret();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({
    secret,
    otpauthUrl,
    qrDataUrl,
    instruction:
      "Scan this QR code with Google Authenticator or Authy. Then set TOTP_SECRET=" +
      secret +
      " in your environment variables.",
  });
}
