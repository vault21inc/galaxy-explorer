import {
  CONFIG_RESOURCES,
  configKeyOf,
  configResources,
  ENTITY_KINDS,
  entityKinds,
} from '@ge/domain';
import type { ImportReport } from '@/api/exchange.ts';
import { cn } from '@/lib/utils.ts';

/**
 * What an import did, or would do (M7-T4): counts per kind of record, then what stops it and
 * what it leaves out.
 */

/** Section names, from the registries where there's one. */
const SECTION_LABELS: Record<string, string> = {
  universe: 'Universe',
  assets: 'Images',
  maps: 'Maps',
  relations: 'Relations',
  members: 'Group members',
  ...Object.fromEntries(
    CONFIG_RESOURCES.map((resource) => [
      configKeyOf(resource),
      configResources[resource].label.many,
    ]),
  ),
  ...Object.fromEntries(
    ENTITY_KINDS.map((kind) => [entityKinds[kind].plural, entityKinds[kind].label.many]),
  ),
};

const COLUMNS = [
  { key: 'create', label: 'New' },
  { key: 'update', label: 'Updated' },
  { key: 'keep', label: 'Already there' },
  { key: 'skip', label: 'Left out' },
] as const;

function Findings({
  title,
  items,
  tone,
}: {
  title: string;
  items: ImportReport['conflicts'];
  tone: 'problem' | 'quiet';
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h4 className={cn('text-xs font-medium', tone === 'problem' && 'text-destructive')}>
        {title} ({items.length})
      </h4>
      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-xs">
        {items.map((item, index) => (
          <li key={`${item.where}-${String(index)}`}>
            <span className="font-mono text-muted-foreground">{item.where}</span>: {item.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportReportView({ report }: { report: ImportReport }) {
  const sections = Object.entries(report.counts).filter(([, counts]) =>
    COLUMNS.some((column) => counts[column.key] > 0),
  );
  const headline = report.blocked
    ? 'This can’t be imported until the problems below are fixed in the file. Nothing was written.'
    : report.dryRun
      ? 'Ready to import. Nothing has been written yet.'
      : 'Imported, as one change: undo takes it all back.';
  return (
    <div
      className="flex flex-col gap-3 rounded-md border p-3"
      aria-label="Import report"
      role="region"
    >
      <p className={cn('font-medium', report.blocked && 'text-destructive')}>{headline}</p>
      {sections.length > 0 && (
        <table className="w-fit text-xs" aria-label="What the import does">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pr-6 text-left font-normal">Records</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-3 text-right font-normal">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, counts]) => (
              <tr key={section}>
                <th scope="row" className="pr-6 text-left font-normal">
                  {SECTION_LABELS[section] ?? section}
                </th>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="px-3 text-right tabular-nums">
                    {counts[column.key] || '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Findings title="Conflicts" items={report.conflicts} tone="problem" />
      <Findings title="References to nothing" items={report.unresolved} tone="problem" />
      <Findings title="Left out" items={report.skipped} tone="quiet" />
      <Findings title="Notes" items={report.notes} tone="quiet" />
    </div>
  );
}
