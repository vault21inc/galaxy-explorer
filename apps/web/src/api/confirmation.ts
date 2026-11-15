/**
 * Confirming a destructive action (M8-T12, T13, D-47): an account with two-factor codes on sends
 * a current code in `X-GE-TOTP`; one with them off sends its password in `X-GE-Password`. Header
 * values are limited to Latin-1, so the password is percent-encoded (UTF-8), which the API
 * decodes.
 */
export type Confirmation = { totp: string } | { password: string };

export function confirmationHeaders(
  confirmation: Confirmation | undefined,
): Record<string, string> {
  if (!confirmation) return {};
  return 'totp' in confirmation
    ? { 'x-ge-totp': confirmation.totp }
    : { 'x-ge-password': encodeURIComponent(confirmation.password) };
}
