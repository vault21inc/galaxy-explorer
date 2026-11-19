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
import { BAR_BUTTON, BAR_TEXT } from './bar-classes.ts';

/**
 * The account menu at the top bar's right end (M8-T1, T13, ux.md §13): the username, opening
 * Account, Admin (for admins) and Sign out; signed out, a "Sign in" link back to this page. Not
 * shown on a server without accounts.
 */
export function AccountMenu() {
  const enabled = useAccountsEnabled();
  const account = useAccount();
  const signOut = useSignOut();
  const location = useLocation();
  if (!enabled || account.isPending) return null;

  if (!account.data) {
    if (location.pathname === '/login') return null;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return (
      // "Sign in" keeps its text at every width: it's short, and has no icon to stand for it.
      <Button asChild variant="ghost" size="sm" className={BAR_BUTTON}>
        <Link to={`/login?next=${next}`}>Sign in</Link>
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
          title={`Account: ${account.data.username}`}
        >
          <CircleUser aria-hidden />
          <span className="sr-only">Account: </span>
          <span className={BAR_TEXT}>{account.data.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Signed in as {account.data.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account">Account</Link>
        </DropdownMenuItem>
        {account.data.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin">Admin</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signOut.isPending}
          onSelect={() => {
            signOut.mutate();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
