import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatMention, mentionedUserIds, resolveMentions } from './mentions';
import { createUser, createWorld, type TestContext, testContext, type World } from './testing/fixtures';

describe('formatMention and mentionedUserIds', () => {
  const id = '0192f3a0-0000-7000-8000-000000000001';
  const other = '0192f3a0-0000-7000-8000-000000000002';

  it('escapes brackets in names', () => {
    expect(formatMention('Ana [ops] Ruiz', id)).toBe(`[@Ana \\[ops\\] Ruiz](mention:${id})`);
  });

  it('reads mention links in order of first mention, outside code only', () => {
    const body = [
      `${formatMention('Ana [ops]', id)} and ${formatMention('Bo', other)}, again ${formatMention('Ana', id)}`,
      '`[@Code](mention:0192f3a0-0000-7000-8000-000000000003)`',
      '```',
      '[@Fenced](mention:0192f3a0-0000-7000-8000-000000000004)',
      '```',
      '[@Bad](mention:not-a-uuid) [plain](https://example.com)',
    ].join('\n');
    expect(mentionedUserIds(body)).toEqual([id, other]);
  });
});

describe('resolveMentions', () => {
  let ctx: TestContext;
  let world: World;
  let other: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    other = await createWorld(ctx.db, 'Elsewhere');
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const resolve = (body: string) => resolveMentions(ctx.db, world.workspaceId, body);
  const link = (user: { id: string; name: string }) => formatMention(user.name, user.id);

  it('rewrites @agent-name to the link form', async () => {
    const result = await resolve(`Done. @${world.agent.name}`);
    expect(result).toEqual({ body: `Done. ${link(world.agent)}`, userIds: [world.agent.id] });
  });

  it('matches agent names case-insensitively and stops at punctuation', async () => {
    const name = world.agent.name;
    const result = await resolve(`(@${name.toUpperCase()}), @${name}. @${name}-`);
    expect(result.body).toBe(`(${link(world.agent)}), ${link(world.agent)}. ${link(world.agent)}-`);
    expect(result.userIds).toEqual([world.agent.id]);
  });

  it('rewrites @email of a person, ignoring case', async () => {
    const result = await resolve(`Ping @${world.owner.email.toUpperCase()}. And @${world.member.email}`);
    expect(result).toEqual({
      body: `Ping ${link(world.owner)}. And ${link(world.member)}`,
      userIds: [world.owner.id, world.member.id],
    });
  });

  it('does not resolve an agent by its synthetic email', async () => {
    const body = `@${world.agent.email}`;
    expect(await resolve(body)).toEqual({ body, userIds: [] });
  });

  it('leaves unknown words, other workspaces and non-mentions alone', async () => {
    const outsiderPerson = other.owner;
    const body = [
      '@nobody and @ghost@example.com and @nobody-here',
      `@${other.agent.name} and @${outsiderPerson.email}`,
      `mail ${world.owner.email}, path https://example.com/@${world.agent.name}, escaped \\@${world.agent.name}`,
      `[ping @${world.agent.name}](https://example.com) <https://example.com/@${world.agent.name}>`,
      '@ alone, user@ and @-dash',
    ].join('\n');
    expect(await resolve(body)).toEqual({ body, userIds: [] });
  });

  it('never rewrites inside code spans or fenced code blocks', async () => {
    const name = world.agent.name;
    const body = [
      `Inline \`@${name}\` and \`\` a \` @${name} \`\` here.`,
      '```ts',
      `const who = '@${name}';`,
      '```',
      '> ~~~',
      `> @${name}`,
      '> ~~~',
      '- ```',
      `  @${name}`,
      '  ```',
      `after @${name}`,
      '````',
      `@${name} in an unclosed fence`,
      '```',
      `still code @${name}`,
    ].join('\n');
    const result = await resolve(body);
    expect(result.body).toBe(body.replace(`after @${name}`, `after ${link(world.agent)}`));
    expect(result.userIds).toEqual([world.agent.id]);
  });

  it('treats an unclosed backtick as text', async () => {
    const result = await resolve(`a \` b @${world.agent.name}`);
    expect(result.body).toBe(`a \` b ${link(world.agent)}`);
  });

  it('keeps links to members and refreshes their label', async () => {
    const result = await resolve(`[@Old name](mention:${world.member.id}) and ${link(world.owner)}`);
    expect(result).toEqual({
      body: `${link(world.member)} and ${link(world.owner)}`,
      userIds: [world.member.id, world.owner.id],
    });
  });

  it('drops forged links to non-members but keeps their text', async () => {
    const stranger = await createUser(ctx.db, { name: 'Stranger' });
    const body = [
      `[@Boss](mention:${other.owner.id})`,
      `[@Stranger](mention:${stranger.id})`,
      '[@Nobody](mention:0192f3a0-0000-7000-8000-00000000ffff)',
      '[@Broken](mention:nope)',
      `[@${world.agent.name}](mention:${other.agent.id})`,
    ].join(' ');
    expect(await resolve(body)).toEqual({
      body: `@Boss @Stranger @Nobody @Broken @${world.agent.name}`,
      userIds: [],
    });
  });

  it('handles mixed mentions in order of first mention, without duplicates', async () => {
    const result = await resolve(
      `@${world.member.email} [@x](mention:${world.agent.id}) @${world.member.email} @${world.agent.name}`,
    );
    expect(result.userIds).toEqual([world.member.id, world.agent.id]);
    expect(result.body).toBe(
      `${link(world.member)} ${link(world.agent)} ${link(world.member)} ${link(world.agent)}`,
    );
  });

  it('round-trips: resolving a stored body changes nothing', async () => {
    const first = await resolve(`Hi @${world.agent.name} and @${world.owner.email}`);
    expect(await resolve(first.body)).toEqual(first);
  });
});
