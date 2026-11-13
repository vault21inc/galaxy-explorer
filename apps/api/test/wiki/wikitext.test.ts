import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leadMarkdown, plainText, wikiTemplates } from '../../src/wiki/wikitext.ts';

/** Reading a wiki page's info box and lead (M7-T3), on two real pages and on edge cases. */

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/wiki/${name}.wikitext`, import.meta.url), 'utf8');
const params = (text: string) =>
  Object.fromEntries((wikiTemplates(text)[0]?.params ?? []).map((p) => [p.name, p.text]));

describe('the info boxes of the two planet templates', () => {
  it('Gudrun: {{Planet}}, with population and sub-sector', () => {
    const [template] = wikiTemplates(fixture('gudrun'));
    expect(template?.name).toBe('Planet');
    expect(params(fixture('gudrun'))).toMatchObject({
      population: '5,000,000,000',
      'sub-sector': 'Helican Sub-sector',
      sector: 'Scarus Sector',
      segmentum: 'Segmentum Obscurus',
      type: 'War World, Civilised World',
      tithe_grade: 'Unknown',
      image1: '',
    });
  });

  it('Hubris: {{Infobox Planet}}, with pop and subsector', () => {
    const [template] = wikiTemplates(fixture('hubris'));
    expect(template?.name).toBe('Infobox Planet');
    expect(params(fixture('hubris'))).toMatchObject({
      pop: 'Unknown',
      subsector: 'Helican Sub-sector',
      sector: 'Scarus Sector',
      temp: 'Arctic during 11-month-long Dormant cycle',
    });
  });
});

describe('the lead section', () => {
  it('Gudrun: the paragraphs before the first heading, links as text, bold kept', () => {
    const lead = leadMarkdown(fixture('gudrun'));
    expect(
      lead.startsWith('**Gudrun** is the former capital world of the Helican Sub-sector'),
    ).toBe(true);
    expect(lead.split('\n\n')).toHaveLength(2);
    expect(lead).not.toMatch(/\[\[|\]\]|\{\{|==/);
    expect(lead).not.toContain('House Glaw'); // from the History section, after the lead
  });

  it('Hubris: three paragraphs, no info box', () => {
    const lead = leadMarkdown(fixture('hubris'));
    expect(lead.startsWith('**Hubris** was an Imperial world')).toBe(true);
    expect(lead.split('\n\n')).toHaveLength(3);
    expect(lead).not.toContain('bgcolor');
  });
});

describe('markup', () => {
  it('keeps only top-level templates with named parameters, nested ones as text', () => {
    const text =
      '{{Quote|Some words}}\n{{Infobox|name=A {{nowrap|B C}}|link=[[Target|Shown]]|n=1}}\n{{Other|x=y}}';
    expect(wikiTemplates(text).map((t) => t.name)).toEqual(['Infobox', 'Other']);
    expect(params(text.slice(text.indexOf('{{Infobox')))).toEqual({
      name: 'A',
      link: 'Shown',
      n: '1',
    });
  });

  it('turns values into plain text', () => {
    expect(plainText("[[A|B]]<ref>source</ref> and ''[[C]]''<!-- note -->")).toBe('B and C');
    expect(plainText('[https://example.org Example] &amp; [[File:x.png|thumb|cap]]')).toBe(
      'Example &',
    );
    expect(plainText('one<br/>two <br> three')).toBe('one, two, three');
  });

  it('escapes Markdown in the lead, and drops files, tables and lists', () => {
    const lead = leadMarkdown(
      "[[File:map.png|thumb|A [[map]]]]\n'''Name''' uses *stars* and [brackets] and ''style''.\n\n{|\n|cell\n|}\n* a list item\n\n== Later ==\nnot this",
    );
    expect(lead).toBe('**Name** uses \\*stars\\* and \\[brackets\\] and *style*.');
  });
});
