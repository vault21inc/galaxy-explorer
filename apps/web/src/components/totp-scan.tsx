/** The secret in groups of four, as authenticator apps show it, so it's easier to type. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * A new two-factor secret to scan with an authenticator app (M8-T1, D-47): its QR code, and the
 * same secret as text beside it, to type in instead (ux.md §10). Used by an account link's code
 * step and by turning codes on from the account page.
 */
export function TotpScan({ qrCode, secret }: { qrCode: string; secret: string }) {
  return (
    <>
      <p>
        Scan this with an authenticator app, such as 1Password, Google Authenticator or the iPhone’s
        Passwords app. Each time you sign in, it gives you a new code.
      </p>
      <img
        src={qrCode}
        alt="A QR code for your authenticator app. The same secret is written below it."
        className="size-48 self-center rounded-md bg-white p-1"
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Or type in this secret:</span>
        <code
          data-testid="totp-secret"
          className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all"
        >
          {grouped(secret)}
        </code>
      </div>
    </>
  );
}
