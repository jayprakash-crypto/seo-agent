import {
  TOTP,
  NobleCryptoPlugin,
  ScureBase32Plugin,
  verifySync,
} from "otplib";

// Singleton with required plugins
const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

/**
 * Verify a TOTP token against the stored secret.
 * Secret is stored in env var TOTP_SECRET.
 */
export function verifyTotp(token: string): boolean {
  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    console.error("[auth] TOTP_SECRET env var is not set");
    return false;
  }
  // verifySync returns { valid, delta, epoch, timeStep }
  const result = verifySync({ secret, token, strategy: "totp" });
  return result.valid;
}

/**
 * Generate a new TOTP secret and the otpauth URL for QR code display.
 */
export function generateTotpSecret(
  issuer = "SEO Agent Dashboard",
  label = "operator",
) {
  const secret = totp.generateSecret();
  const otpauthUrl = totp.toURI({ secret, issuer, label });
  return { secret, otpauthUrl };
}
