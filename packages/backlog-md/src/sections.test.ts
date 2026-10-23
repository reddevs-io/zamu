import { describe, expect, test } from 'vitest';
import { parseSections } from './sections';
import type { ParseWarning } from './types';

describe('parseSections: marker style', () => {
  const body = [
    '## Description',
    '',
    '<!-- SECTION:DESCRIPTION:BEGIN -->',
    'Line one.',
    '',
    '## Not a section',
    'still the description, inside the markers',
    '<!-- SECTION:DESCRIPTION:END -->',
    '',
    '## Acceptance Criteria',
    '<!-- AC:BEGIN -->',
    '- [ ] #1 First',
    '- [x] #2 Second',
    '<!-- AC:END -->',
    '',
    '## Definition of Done',
    '<!-- DOD:BEGIN -->',
    '- [x] #1 Tests pass',
    '<!-- DOD:END -->',
    '',
    '## Implementation Plan',
    '',
    '<!-- SECTION:PLAN:BEGIN -->',
    '1. Do it',
    '<!-- SECTION:PLAN:END -->',
    '',
    '## Implementation Notes',
    '',
    '<!-- SECTION:NOTES:BEGIN -->',
    'Notes here.',
    '<!-- SECTION:NOTES:END -->',
    '',
    '## Final Summary',
    '',
    '<!-- SECTION:FINAL_SUMMARY:BEGIN -->',
    'Shipped.',
    '<!-- SECTION:FINAL_SUMMARY:END -->',
    '',
    '## Testing',
    '',
    'Manual run.',
  ].join('\n');

  test('reads every section', () => {
    const sections = parseSections(body);
    expect(sections.description).toBe(
      'Line one.\n\n## Not a section\nstill the description, inside the markers',
    );
    expect(sections.acceptanceCriteria).toEqual({
      items: [
        { index: 1, checked: false, text: 'First' },
        { index: 2, checked: true, text: 'Second' },
      ],
      text: '- [ ] #1 First\n- [x] #2 Second',
    });
    expect(sections.definitionOfDone?.items).toEqual([{ index: 1, checked: true, text: 'Tests pass' }]);
    expect(sections.implementationPlan).toBe('1. Do it');
    expect(sections.implementationNotes).toBe('Notes here.');
    expect(sections.finalSummary).toBe('Shipped.');
    expect(sections.comments).toEqual([]);
    expect(sections.extra).toBe('## Testing\n\nManual run.');
  });

  test('an unclosed marker falls back to a plain section and warns', () => {
    const warnings: ParseWarning[] = [];
    const sections = parseSections(
      '## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nText\n\n## Implementation Notes\n\nN',
      warnings,
    );
    expect(sections.description).toBe('Text');
    expect(sections.implementationNotes).toBe('N');
    expect(warnings).toEqual([expect.objectContaining({ code: 'malformed_markers', field: 'description' })]);
  });

  test('markers and headings inside code fences are content', () => {
    const sections = parseSections(
      [
        '## Description',
        '',
        '```md',
        '## Acceptance Criteria',
        '<!-- AC:BEGIN -->',
        '- [ ] #1 fenced',
        '```',
        '',
        '## Acceptance Criteria',
        '',
        '- [ ] real',
      ].join('\n'),
    );
    expect(sections.description).toBe(
      '```md\n## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [ ] #1 fenced\n```',
    );
    expect(sections.acceptanceCriteria?.items).toEqual([{ index: 1, checked: false, text: 'real' }]);
  });
});

describe('parseSections: plain headings', () => {
  test('older headings with (Optional) and ## Notes', () => {
    const sections = parseSections(
      [
        '## Description',
        '',
        'Desc.',
        '',
        '### Sub heading',
        '',
        'Still desc.',
        '',
        '## Acceptance Criteria (Optional)',
        '',
        'Some prose.',
        '- [x] Done thing',
        '- [ ] Open thing',
        '',
        '## Implementation Plan (Optional)',
        '',
        'Plan.',
        '',
        '## Notes',
        '',
        'A note.',
        '',
        '## Root Cause',
        '',
        'Belongs to the notes, as Backlog.md reads it.',
      ].join('\n'),
    );
    expect(sections.description).toBe('Desc.\n\n### Sub heading\n\nStill desc.');
    expect(sections.acceptanceCriteria).toEqual({
      items: [
        { index: 1, checked: true, text: 'Done thing' },
        { index: 2, checked: false, text: 'Open thing' },
      ],
      text: 'Some prose.\n- [x] Done thing\n- [ ] Open thing',
    });
    expect(sections.implementationPlan).toBe('Plan.');
    expect(sections.implementationNotes).toBe(
      'A note.\n\n## Root Cause\n\nBelongs to the notes, as Backlog.md reads it.',
    );
    expect(sections.extra).toBeNull();
  });

  test('a body without headings is the description', () => {
    expect(parseSections('\nJust text.\n').description).toBe('Just text.');
  });

  test('text before the first heading is extra when there is a description', () => {
    const sections = parseSections('Intro.\n\n## Description\n\nDesc.');
    expect(sections.description).toBe('Desc.');
    expect(sections.extra).toBe('Intro.');
  });

  test('empty sections are null', () => {
    const sections = parseSections('## Description\n\n## Acceptance Criteria\n\n## Implementation Notes\n');
    expect(sections).toMatchObject({
      description: null,
      acceptanceCriteria: null,
      implementationNotes: null,
    });
  });

  test('headings are case-insensitive', () => {
    expect(parseSections('## DESCRIPTION\n\nLoud.').description).toBe('Loud.');
  });
});

describe('parseSections: comments', () => {
  test('current delimited format', () => {
    const sections = parseSections(
      [
        '## Comments',
        '',
        '<!-- COMMENTS:BEGIN -->',
        'author: @alex',
        'created: 2026-10-13 18:47',
        '---',
        'First.',
        '---',
        '',
        'author: @sam',
        'created: 2026-10-14T08:00:00Z',
        '',
        '---',
        '',
        'Second,',
        'two lines.',
        '',
        '---',
        '<!-- COMMENTS:END -->',
      ].join('\n'),
    );
    expect(sections.comments).toEqual([
      {
        index: 1,
        author: '@alex',
        createdRaw: '2026-10-13 18:47',
        created: new Date('2026-10-13T18:47:00Z'),
        body: 'First.',
      },
      {
        index: 2,
        author: '@sam',
        createdRaw: '2026-10-14T08:00:00Z',
        created: new Date('2026-10-14T08:00:00Z'),
        body: 'Second,\ntwo lines.',
      },
    ]);
  });

  test('legacy per-comment blocks', () => {
    const sections = parseSections(
      [
        '## Comments',
        '',
        '<!-- COMMENTS:BEGIN -->',
        '<!-- COMMENT:BEGIN -->',
        'index: 1',
        'author: @alex',
        'created: 2025-09-02 10:15',
        '',
        'Started.',
        '<!-- COMMENT:END -->',
        '<!-- COMMENT:BEGIN -->',
        'No metadata at all.',
        '<!-- COMMENT:END -->',
        '<!-- COMMENTS:END -->',
      ].join('\n'),
    );
    expect(sections.comments).toEqual([
      {
        index: 1,
        author: '@alex',
        createdRaw: '2025-09-02 10:15',
        created: new Date('2025-09-02T10:15:00Z'),
        body: 'Started.',
      },
      { index: 2, author: null, createdRaw: null, created: null, body: 'No metadata at all.' },
    ]);
  });

  test('a plain ## Comments heading with free text is one comment', () => {
    expect(parseSections('## Comments\n\nFree text.').comments).toEqual([
      { index: 1, author: null, createdRaw: null, created: null, body: 'Free text.' },
    ]);
  });
});

describe('parseSections: repeated sections', () => {
  test('a marked section wins over a plain one with the same heading', () => {
    const sections = parseSections(
      '## Acceptance Criteria\n\n- [ ] stale\n\n## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [x] #1 current\n<!-- AC:END -->',
    );
    expect(sections.acceptanceCriteria?.items).toEqual([{ index: 1, checked: true, text: 'current' }]);
  });

  test('two plain sections with the same heading are joined', () => {
    expect(
      parseSections('## Implementation Notes\n\nOne.\n\n## Implementation Notes\n\nTwo.').implementationNotes,
    ).toBe('One.\n\nTwo.');
  });
});
