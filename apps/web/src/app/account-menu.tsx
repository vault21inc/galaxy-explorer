import { CircleUser } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAccount, useAccountsEnabled, useSignOut } from '@/api/auth.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { SHEET_ROW } from '@/components/ui/sheet.tsx';
import { useSheet } from '@/state/sheet.ts';
import { BAR_BUTTON, BAR_TEXT } from './bar-classes.ts';

/**
 * Who's signed in, for the account menu and the slim bar's More sheet: `none` on a server
 * without accounts (or while it's still asking), `signed-out` with the sign-in link back to this
 * page, or `signed-in`.
 */
export function useAccountEntry() {
  const enabled = useAccountsEnabled();
  const account = useAccount();
  const signOut = useSignOut();
  const location = useLocation();
  if (!enabled || account.isPending) return { state: 'none' as const };
  if (!account.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return {
      state: 'signed-out' as const,
      // Not offered on the sign-in page itself.
      signInHref: location.pathname === '/login' ? null : `/login?next=${next}`,
    };
  }
  return {
    state: 'signed-in' as const,
    username: account.data.username,
    isAdmin: account.data.role === 'admin',
    signOut,
  };
}

/**
 * The account menu at the top bar's right end (M8-T1, T13, ux.md §13): the username, opening
 * Account, Admin (for admins) and Sign out; signed out, a "Sign in" link back to this page. Not
 * shown on a server without accounts.
 */
export function AccountMenu() {
  const entry = useAccountEntry();
  if (entry.state === 'none') return null;
  if (entry.state === 'signed-out') {
    if (entry.signInHref === null) return null;
    return (
      // "Sign in" keeps its text at every width: it's short, and has no icon to stand for it.
      <Button asChild variant="ghost" size="sm" className={BAR_BUTTON}>
        <Link to={entry.signInHref}>Sign in</Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`${BAR_BUTTON} gap-1.5`}
          title={`Account: ${entry.username}`}
        >
          <CircleUser aria-hidden />
          <span className="sr-only">Account: </span>
          <span className={BAR_TEXT}>{entry.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Signed in as {entry.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account">Account</Link>
        </DropdownMenuItem>
        {entry.isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">Admin</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={entry.signOut.isPending}
          onSelect={() => {
            entry.signOut.mutate();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The slim bar's Account sheet: the same choices as the menu, as rows. */
export function AccountRows() {
  const entry = useAccountEntry();
  const close = useSheet((state) => state.close);
  if (entry.state !== 'signed-in') return null;
  return (
    <div className="flex flex-col">
      <p className="px-3 py-2 text-xs text-muted-foreground">Signed in as {entry.username}</p>
      <Link to="/account" className={SHEET_ROW} onClick={close}>
        Account
      </Link>
      {entry.isAdmin && (
        <Link to="/admin" className={SHEET_ROW} onClick={close}>
          Admin
        </Link>
      )}
      <button
        type="button"
        className={SHEET_ROW}
        disabled={entry.signOut.isPending}
        onClick={() => {
          close();
          entry.signOut.mutate();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
