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

/**
 * The account menu at the top bar's right end (M8-T1, ux.md §13): the username, opening Sign
 * out (M8-T13 adds Account and Admin); signed out, a "Sign in" link back to this page. Not shown
 * on a server without accounts.
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
      <Button asChild variant="ghost" size="sm" className="pointer-events-auto">
        <Link to={`/login?next=${next}`}>Sign in</Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="pointer-events-auto gap-1.5">
          <CircleUser aria-hidden />
          <span className="sr-only">Account: </span>
          {account.data.username}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Signed in as {account.data.username}
        </DropdownMenuLabel>
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
