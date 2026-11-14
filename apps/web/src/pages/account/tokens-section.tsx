import { useId } from 'react';
import { useRevokeToken, useTokens, type ApiToken } from '@/api/account.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatWhen } from '../admin/format-when.ts';
import { TokenForm } from './token-form.tsx';

/** "Write, every universe" or "Read, only Eisenhorn". */
function reachOf(token: ApiToken): string {
  const scope = token.scope === 'write' ? 'Write' : 'Read';
  return token.universe ? `${scope}, only ${token.universe.name}` : `${scope}, every universe`;
}

/**
 * API tokens (M8-T2, ux.md §13): what an agent, such as the MCP server, uses to act for this
 * account. Each is listed with what it may do and when it was last used, and can be revoked,
 * which stops it at once. A new one is made below.
 */
export function TokensSection() {
  const id = useId();
  const tokens = useTokens();
  const revoke = useRevokeToken();
  const failure = tokens.error ?? revoke.error;
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xs text-muted-foreground label-caps">
        API tokens
      </h2>
      <p className="text-xs text-muted-foreground">
        For agents and scripts: a token does what you can, never more, narrowed to reading or to one
        universe if you choose. It can’t change your account or who can see your universes.
      </p>
      {failure && (
        <p role="alert" className="text-destructive">
          {errorMessage(failure)}
        </p>
      )}
      {tokens.data && tokens.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tokens.data.map((token) => (
            <li key={token.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  {reachOf(token)} ·{' '}
                  {token.lastUsedAt ? `last used ${formatWhen(token.lastUsedAt)}` : 'never used'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Revoke ${token.name}`}
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(token.id);
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      <TokenForm />
    </section>
  );
}
