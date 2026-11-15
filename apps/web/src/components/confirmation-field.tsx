import { useState } from 'react';
import { useAccount } from '@/api/auth.ts';
import type { Confirmation } from '@/api/confirmation.ts';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

/**
 * The confirmation a destructive action asks for (M8-T12, T13, D-47): a current code from the
 * authenticator app for an account with two-factor codes on, or its password for one with them
 * off. The API checks it (`X-GE-TOTP` or `X-GE-Password`, api/confirmation.ts).
 */
export interface ConfirmationInput {
  /** Whether the signed-in account has codes on; assumed until the account has loaded. */
  twoFactor: boolean;
  value: string;
  setValue: (value: string) => void;
  /** Filled in enough to send. */
  ready: boolean;
  /** What to send, once ready. */
  confirmation: Confirmation | undefined;
}

export function useConfirmationInput(): ConfirmationInput {
  const twoFactor = useAccount().data?.twoFactor ?? true;
  const [value, setValue] = useState('');
  const ready = twoFactor ? /^\d{6}$/.test(value) : value !== '';
  const confirmation: Confirmation | undefined = !ready
    ? undefined
    : twoFactor
      ? { totp: value }
      : { password: value };
  return { twoFactor, value, setValue, ready, confirmation };
}

export function ConfirmationField({ id, input }: { id: string; input: ConfirmationInput }) {
  return (
    <div className="flex flex-col gap-1.5">
      {input.twoFactor ? (
        <>
          <Label htmlFor={id}>Code from your authenticator app</Label>
          <Input
            id={id}
            value={input.value}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            onChange={(event) => {
              input.setValue(event.target.value.replace(/\D/g, ''));
            }}
          />
        </>
      ) : (
        <>
          <Label htmlFor={id}>Your password</Label>
          <Input
            id={id}
            type="password"
            value={input.value}
            autoComplete="current-password"
            maxLength={256}
            onChange={(event) => {
              input.setValue(event.target.value);
            }}
          />
        </>
      )}
    </div>
  );
}
