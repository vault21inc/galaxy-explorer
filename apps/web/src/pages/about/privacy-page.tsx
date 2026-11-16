import { useAccountsEnabled } from '@/api/auth.ts';
import { STORAGE_KEYS } from '@/state/storage-keys.ts';
import { AboutFrame, AboutSection } from './about-frame.tsx';

/**
 * `/about/privacy` (M8-T9): what the site keeps about readers (no trackers, display
 * preferences in the browser), and, where there are accounts, what an account stores, who
 * sees a private universe and how to have an account removed. The browser storage list comes
 * from the stores' own key list, so it says exactly what the app keeps.
 */
export function PrivacyPage() {
  const accounts = useAccountsEnabled();
  return (
    <AboutFrame title="Privacy">
      <AboutSection title="Reading">
        <p>
          No trackers, ads or analytics. Every file the site loads comes from the site itself, and
          its security policy keeps it that way.
        </p>
        <p>The browser keeps your display preferences, which never leave it:</p>
        <ul className="list-disc pl-5" aria-label="What the browser keeps">
          {Object.values(STORAGE_KEYS).map((item) => (
            <li key={item.key}>
              <code className="text-xs">{item.key}</code>: {item.what}
            </li>
          ))}
        </ul>
        {accounts && (
          <p>
            There are two cookies, both for this site only. Signing in sets one for your session.
            Opening a share link sets one for that universe, so that the link keeps working as you
            move around it.
          </p>
        )}
        <p>
          Like any web server, the site logs each request (the address it came from, the page and
          the browser’s name) to keep it running and to limit abuse. The logs are deleted as they
          fill, after a few days.
        </p>
      </AboutSection>
      {accounts && <AccountsSection />}
    </AboutFrame>
  );
}

/** For accounts only (M8-T1): what the server keeps, and who can see what. */
function AccountsSection() {
  return (
    <>
      <AboutSection title="What an account stores" id="accounts">
        <ul className="list-disc pl-5">
          <li>Its username, role and storage quota, and when it was made and last signed in.</li>
          <li>
            A hash of its password, never the password itself. If two-factor codes are on, their
            secret, encrypted.
          </li>
          <li>
            The devices signed in to it: when each signed in and was last seen, and its browser’s
            name, which the account page shows so you can sign one out.
          </li>
          <li>Its API tokens’ names, what they may do and their last use, but not the tokens.</li>
          <li>
            Its name on every change it makes, in each universe’s History, and on account and
            sharing changes, in the admins’ log.
          </li>
        </ul>
      </AboutSection>
      <AboutSection title="Who sees a private universe">
        <p>
          Its owner and the people it’s shared with, as editors or viewers, and anyone with its link
          if it’s shared by link. Admins can manage it without opening it. As with any website,
          whoever runs the server can read its database.
        </p>
      </AboutSection>
      <AboutSection title="Removing an account">
        <p>
          Ask an admin of this site, such as whoever invited you. First delete the universes the
          account owns, or hand them to someone else from their settings pages. Removing it ends its
          sessions and tokens; its name stays on the changes it made.
        </p>
      </AboutSection>
    </>
  );
}
