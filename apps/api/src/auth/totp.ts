import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

/**
 * Two-factor codes (M8-T1, D-15): TOTP (RFC 6238), as authenticator apps make them. The app and
 * the server share a secret; every 30 seconds both turn it and the current time into a 6-digit
 * code, so a code proves the person has the app without sending the secret.
 */

/** Seconds of clock difference accepted either way: one 30-second step, before or after. */
const TOLERANCE_S = 30;

/** A new shared secret, in the base32 text authenticator apps take. */
export function newTotpSecret(): string {
  return generateSecret();
}

/**
 * The `otpauth://` URI an authenticator app scans. The issuer names the site, with its host, so
 * accounts on two installations (a test one and the real one) can be told apart in the app.
 */
export function otpauthUri(secret: string, username: string, publicUrl: string): string {
  return generateURI({
    issuer: `Galaxy Explorer (${new URL(publicUrl).host})`,
    label: username,
    secret,
  });
}

/**
 * The time step a code matches, or null if it's wrong, malformed or too old. `afterStep` is the
 * step of the account's last accepted code: a code from that step or earlier is refused, so a
 * code that was seen being typed can't be used again (RFC 6238 §5.2).
 */
export async function acceptedStep(
  secret: string,
  code: string,
  afterStep: number | null,
): Promise<number | null> {
  const token = code.trim();
  if (!/^\d{6}$/.test(token)) return null;
  const result = await verify({
    secret,
    token,
    epochTolerance: TOLERANCE_S,
    ...(afterStep === null ? {} : { afterTimeStep: afterStep }),
  });
  // The result type covers counter-based codes too; a TOTP match carries its time step.
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

/**
 * The URI as a QR code, an SVG image in a data URL for an `<img>`: drawn as an image, the SVG
 * can't run anything, and the page needs no QR library of its own.
 */
export async function qrCodeDataUrl(uri: string): Promise<string> {
  const svg = await QRCode.toString(uri, { type: 'svg', margin: 2 });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** The URI as a QR code drawn with block characters, for the admin command line. */
export function qrCodeForTerminal(uri: string): Promise<string> {
  return QRCode.toString(uri, { type: 'terminal', small: true });
}
