import { describe, expect, test } from 'vitest';
import { parseConfig } from './config';
import { renderDescription } from './render';
import { parseSections } from './sections';
import { parseTask } from './task';
import { readFixture } from './testing/fixtures';

describe('renderDescription', () => {
  test('a full marker-style task', () => {
    const config = parseConfig(readFixture('eras/2025-09-markers/backlog/config.yml'));
    if (!config.ok) throw new Error('config');
    const path = 'eras/2025-09-markers/backlog/tasks/pay-12 - Webhook-retries.md';
    const task = parseTask(path, readFixture(path), config.value);
    if (!task.ok) throw new Error(task.error.message);
    expect(renderDescription(task.value)).toBe(
      [
        'Retry failed webhook deliveries with backoff.',
        '',
        '```md',
        '## Acceptance Criteria',
        '- [ ] #9 not a real criterion, it sits in a code fence',
        '```',
        '',
        '## Acceptance criteria',
        '',
        '- [x] #1 Failed deliveries are retried',
        '- [ ] #2 Retries back off exponentially',
        '',
        '## Definition of done',
        '',
        '- [ ] #1 Tests pass',
        '',
        '## Implementation plan',
        '',
        '1. Add a retry queue.',
        '2. Schedule with backoff.',
        '',
        '## Implementation notes',
        '',
        'Queue lives in Redis.',
        '',
        '## Comments from Backlog.md',
        '',
        '**@alex** · 2025-09-02 10:15',
        '',
        'Started on the queue.',
        '',
        '---',
        '',
        '**@sam** · 2025-09-03 08:00',
        '',
        'Looks good, ship it.',
        '',
        '## Final summary',
        '',
        'Retries ship behind a flag.',
        '',
        '## Testing',
        '',
        'Ran the load test twice.',
      ].join('\n'),
    );
  });

  test('empty sections are left out and order is fixed', () => {
    const sections = parseSections(
      '## Final Summary\n\nDone.\n\n## Implementation Notes\n\n## Description\n\nWhat.\n\n## Acceptance Criteria\n\n- [ ] One',
    );
    expect(renderDescription({ sections })).toBe(
      'What.\n\n## Acceptance criteria\n\n- [ ] One\n\n## Final summary\n\nDone.',
    );
  });

  test('a task with no content renders as an empty string', () => {
    expect(renderDescription({ sections: parseSections('') })).toBe('');
  });

  test('a comment without metadata renders its body only', () => {
    expect(renderDescription({ sections: parseSections('## Comments\n\nJust words.') })).toBe(
      '## Comments from Backlog.md\n\nJust words.',
    );
  });
});
