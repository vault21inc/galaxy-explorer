import { ICON_CREDITS, ICON_SETS } from '@ge/domain';
import { Link } from 'react-router';
import { useAttributions, type SourceCredit, type UniverseCredits as Credits } from '@/api/site.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Redactable } from '@/richtext/redactable.tsx';
import { SpoilerProvider } from '@/richtext/spoiler-context.tsx';
import { AboutFrame, AboutSection, OutLink } from './about-frame.tsx';

/**
 * `/about/attributions` (M8-T9): the fan-site disclaimer, the icon sets' credits, and, per
 * universe this reader can open, every page its entries' text was filled from and every image
 * credit. A page that only spoilers cite has its title hidden like any other spoiler.
 */
export function AttributionsPage() {
  const attributions = useAttributions();
  return (
    <AboutFrame title="Attributions">
      <AboutSection title="A fan-made site">
        <p>
          Galaxy Explorer is a tool for building galaxies by hand, and each universe on it is made
          by its owner. Some are based on published fiction, such as Warhammer 40,000. This site
          isn’t affiliated with or endorsed by any rights holder, such as Games Workshop, and the
          names and settings in those universes belong to their owners.
        </p>
      </AboutSection>
      <AboutSection title="Icons">
        <ul className="list-disc pl-5">
          {ICON_SETS.map((set) => (
            <li key={set}>
              <OutLink href={ICON_CREDITS[set].url}>{ICON_CREDITS[set].text}</OutLink>
            </li>
          ))}
        </ul>
      </AboutSection>
      <AboutSection title="Text and images in the universes">
        <p className="text-muted-foreground">
          Text filled in from a wiki keeps the licence the wiki gives it, usually CC BY-SA. It’s
          shortened and reformatted here, and each entry’s Sources section names its page. Images
          are credited as their uploaders gave them.
        </p>
        {attributions.error ? (
          <p role="alert" className="text-destructive">
            Couldn’t load the list: {errorMessage(attributions.error)}
          </p>
        ) : !attributions.data ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : attributions.data.universes.length === 0 ? (
          <p>Nothing in the universes you can open comes from another source.</p>
        ) : (
          <SpoilerProvider>
            {attributions.data.universes.map((universe) => (
              <UniverseCredits key={universe.slug} universe={universe} />
            ))}
          </SpoilerProvider>
        )}
      </AboutSection>
    </AboutFrame>
  );
}

function UniverseCredits({ universe }: { universe: Credits }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={`attributions-${universe.slug}`}>
      <h3 className="font-medium">
        <Link to={`/u/${universe.slug}`} className="text-primary underline">
          {universe.name}
        </Link>
      </h3>
      {universe.sources.length > 0 && (
        <ul className="flex flex-col gap-1 pl-1" aria-label={`Text sources for ${universe.name}`}>
          {universe.sources.map((source) => (
            <SourceLine key={source.url} source={source} />
          ))}
        </ul>
      )}
      {universe.images.length > 0 && (
        <ul className="flex flex-col gap-1 pl-1" aria-label={`Image credits for ${universe.name}`}>
          {universe.images.map((image, index) => (
            <li key={index}>
              Image: {image.credit ?? 'uncredited'}
              {image.license && ` · ${image.license}`}
              {image.sourceUrl && (
                <>
                  {' · '}
                  <OutLink href={image.sourceUrl}>source</OutLink>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Gudrun · warhammer40k.fandom.com · CC-BY-SA · read 14/11/2026", its title a link. */
function SourceLine({ source }: { source: SourceCredit }) {
  const title = source.title ?? source.url;
  return (
    <li>
      <Redactable
        flagged={source.spoiler}
        revealKey={`attribution:${source.url}`}
        hiddenText={title}
      >
        <OutLink href={source.url}>{title}</OutLink>
      </Redactable>
      <span className="text-muted-foreground">
        {' · '}
        {siteOf(source.url)}
        {source.license && ` · ${source.license}`}
        {` · read ${new Date(source.retrievedAt).toLocaleDateString()}`}
        {source.uses > 1 && ` · ${String(source.uses)} entries`}
      </span>
    </li>
  );
}

/** The site a page is on, as people name it: its host. */
function siteOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
