import { Sheet } from '@/components/ui/sheet.tsx';
import { HelpRows } from '@/help/help-menu.tsx';
import { EventsList } from '@/panels/events-list/events-list.tsx';
import { LayersPanel } from '@/panels/layers/layers-panel.tsx';
import { useSheet, type SheetId } from '@/state/sheet.ts';
import { AccountRows } from './account-menu.tsx';
import { LocationSheet } from './location-sheet.tsx';
import { MoreSheet } from './more-sheet.tsx';
import { QualitySettings } from './quality-popover.tsx';
import { useUniverseBar } from './use-universe-bar.ts';

/** Each sheet's title, and whether it was opened from More (so it has a way back there). */
const SHEETS: Record<Exclude<SheetId, 'list' | 'capture'>, { title: string; fromMore: boolean }> = {
  location: { title: 'Where you are', fromMore: false },
  more: { title: 'More', fromMore: false },
  events: { title: 'Events', fromMore: true },
  layers: { title: 'Layers and labels', fromMore: true },
  display: { title: 'Display', fromMore: true },
  help: { title: 'Help and tours', fromMore: true },
  account: { title: 'Account', fromMore: true },
};

/**
 * The slim bar's sheets (docs/plan/later/phone-usability.md, "Sheets"), one at a time, in one
 * Sheet whose contents change, so going from More to Events doesn't close one and open
 * another. The List sheet is the outliner's own (panels/outliner/outliner-slot.tsx), since
 * the view's objects are there.
 */
export function SlimSheets({ universeSlug }: { universeSlug: string | undefined }) {
  const open = useSheet((state) => state.open);
  const show = useSheet((state) => state.show);
  const close = useSheet((state) => state.close);
  const id = open === null || open === 'list' || open === 'capture' ? null : open;
  const sheet = id ? SHEETS[id] : null;
  return (
    <Sheet
      open={id !== null}
      onClose={close}
      title={sheet?.title ?? ''}
      onBack={
        sheet?.fromMore
          ? () => {
              show('more');
            }
          : undefined
      }
    >
      {id === 'location' && universeSlug !== undefined && (
        <LocationContent universeSlug={universeSlug} />
      )}
      {id === 'more' && <MoreSheet />}
      {id === 'events' && <EventsList active onChose={close} />}
      {id === 'layers' && <LayersPanel />}
      {id === 'display' && <QualitySettings />}
      {id === 'help' && <HelpRows />}
      {id === 'account' && <AccountRows />}
    </Sheet>
  );
}

function LocationContent({ universeSlug }: { universeSlug: string }) {
  const bar = useUniverseBar(universeSlug);
  return bar ? <LocationSheet bar={bar} /> : null;
}
