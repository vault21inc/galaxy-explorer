import { Tabs } from 'radix-ui';
import { useAccount } from '@/api/auth.ts';
import { StatusPanel } from '@/app/status-panel.tsx';
import { NotFoundPage } from '../not-found-page.tsx';
import { AccountsTab } from './accounts-tab.tsx';
import { LogTab } from './log-tab.tsx';
import { UniversesTab } from './universes-tab.tsx';
import { FULL_PAGE_PANEL } from '@/app/panel-classes.ts';

const TABS = [
  { value: 'accounts', label: 'Accounts', Content: AccountsTab },
  { value: 'universes', label: 'Universes', Content: UniversesTab },
  { value: 'log', label: 'Log', Content: LogTab },
] as const;

/**
 * `/admin` (M8-T13, ux.md §13): Accounts, Universes and Log, for admins. To anyone else it's the
 * ordinary "Page not found", as the API's admin routes are.
 */
export function AdminPage() {
  const account = useAccount();
  if (account.isPending) return <StatusPanel tone="loading" title="Loading…" />;
  if (account.data?.role !== 'admin') return <NotFoundPage />;
  return (
    <main className={`${FULL_PAGE_PANEL} overflow-auto rounded-lg border bg-card p-4 text-sm`}>
      <h1 className="mb-3 text-base font-medium">Admin</h1>
      <Tabs.Root defaultValue="accounts" className="flex flex-col gap-4">
        <Tabs.List aria-label="Admin screens" className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="-mb-px border-b-2 border-transparent px-3 py-1.5 text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TABS.map(({ value, Content }) => (
          <Tabs.Content key={value} value={value}>
            <Content />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </main>
  );
}
