import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn } from './contract/harness.ts';

/** The bundled icon sets (M6-T4, D-32). */

describe('icons', () => {
  it('searches both sets, best matches first, and filters by set', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const all = (await api.expect(200, 'GET', '/icons/search?q=sword&limit=200')).body.data as {
          key: string;
          set: string;
          name: string;
        }[];
        expect(all.length).toBeGreaterThan(5);
        expect(all.every((icon) => icon.name.includes('sword'))).toBe(true);
        expect(new Set(all.map((icon) => icon.set))).toEqual(new Set(['lucide', 'game-icons']));
        // Exact and leading matches first.
        expect(all[0]?.name.startsWith('sword')).toBe(true);
        // Every word must match, in any order.
        const crossed = (await api.expect(200, 'GET', '/icons/search?q=swords+crossed')).body
          .data as { key: string }[];
        expect(crossed.map((icon) => icon.key)).toContain('game-icons:crossed-swords');
        const lucide = (await api.expect(200, 'GET', '/icons/search?q=flag&set=lucide')).body
          .data as { set: string }[];
        expect(lucide.length).toBeGreaterThan(0);
        expect(lucide.every((icon) => icon.set === 'lucide')).toBe(true);
      } finally {
        await api.close();
      }
    }));

  it('serves the drawings of known keys, with or without a set, and leaves out unknown ones', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const response = await api.expect(
          200,
          'GET',
          '/icons?keys=game-icons:crossed-swords,swords,lucide:flag,game-icons:no-such-icon',
        );
        const icons = response.body.data as { key: string; body: string; width: number }[];
        expect(icons.map((icon) => icon.key)).toEqual([
          'game-icons:crossed-swords',
          'swords',
          'lucide:flag',
        ]);
        expect(icons[0]?.width).toBe(512);
        expect(icons[1]?.width).toBe(24);
        for (const icon of icons) expect(icon.body).toContain('<path');
        const raw = await api.app.inject({ method: 'GET', url: '/api/v1/icons?keys=lucide:flag' });
        expect(raw.headers['cache-control']).toContain('max-age');
      } finally {
        await api.close();
      }
    }));

  it('event categories take icon keys only', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const universe = (
          await api.expect(201, 'POST', '/universes', { slug: 'icons', name: rt.plain('Icons') })
        ).body.data as { id: string };
        await api.expect(201, 'POST', `/universes/${universe.id}/event-categories`, {
          name: 'Battle',
          icon: 'game-icons:crossed-swords',
          color: '#e5484d',
        });
        await api.expect(400, 'POST', `/universes/${universe.id}/event-categories`, {
          name: 'Broken',
          icon: '<svg onload=alert(1)>',
          color: '#e5484d',
        });
      } finally {
        await api.close();
      }
    }));
});
