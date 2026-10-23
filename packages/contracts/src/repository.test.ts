import { describe, expect, it } from 'vitest';
import { parseRepositoryUrl, sameRepository } from './repository';

describe('parseRepositoryUrl', () => {
  it.each([
    [
      'https://gitlab.com/reddevs/payments.git',
      'gitlab.com/reddevs/payments',
      'https://gitlab.com/reddevs/payments',
    ],
    [
      'https://gitlab.com/reddevs/payments',
      'gitlab.com/reddevs/payments',
      'https://gitlab.com/reddevs/payments',
    ],
    [
      'https://user:token@GitLab.com:8443/reddevs/payments/',
      'gitlab.com/reddevs/payments',
      'https://gitlab.com/reddevs/payments',
    ],
    [
      'git@gitlab.com:reddevs/payments.git',
      'gitlab.com/reddevs/payments',
      'https://gitlab.com/reddevs/payments',
    ],
    ['gitlab.com:reddevs/payments', 'gitlab.com/reddevs/payments', 'https://gitlab.com/reddevs/payments'],
    [
      'ssh://git@gitlab.com:2222/reddevs/payments.git',
      'gitlab.com/reddevs/payments',
      'https://gitlab.com/reddevs/payments',
    ],
    ['git+ssh://git@github.com/team/App.git', 'github.com/team/App', 'https://github.com/team/App'],
    ['git://git.example.org/team/app', 'git.example.org/team/app', 'https://git.example.org/team/app'],
    ['http://gitea.local:3000/team/app.git', 'gitea.local/team/app', 'http://gitea.local/team/app'],
    [
      'https://gitlab.com/group/sub/group/app.git',
      'gitlab.com/group/sub/group/app',
      'https://gitlab.com/group/sub/group/app',
    ],
    ['  https://gitlab.com/team/app  ', 'gitlab.com/team/app', 'https://gitlab.com/team/app'],
  ])('reads %s as %s', (url, short, webUrl) => {
    expect(parseRepositoryUrl(url)).toMatchObject({ short, webUrl, key: short.toLowerCase() });
  });

  it.each([
    [''],
    ['payments'],
    ['reddevs/payments'],
    ['/srv/git/payments.git'],
    ['C:\\repos\\payments'],
    ['file:///srv/git/team/payments.git'],
    ['https://gitlab.com/payments'],
    ['https://gitlab.com/'],
    ['https://gitlab.com/team/app?ref=main'],
    ['git@gitlab.com:payments'],
    ['https://gitlab.com/team/../app'],
    ['https://gitlab.com/team/my app'],
    [`https://gitlab.com/team/${'a'.repeat(500)}`],
  ])('rejects %j', (url) => {
    expect(parseRepositoryUrl(url)).toBeNull();
  });
});

describe('sameRepository', () => {
  it('ignores protocol, user, port, case and .git', () => {
    expect(sameRepository('git@GitLab.com:Reddevs/Payments.git', 'https://gitlab.com/reddevs/payments')).toBe(
      true,
    );
    expect(
      sameRepository('ssh://git@gitlab.com:22/reddevs/payments', 'gitlab.com:reddevs/payments.git'),
    ).toBe(true);
  });

  it('tells different repositories and invalid URLs apart', () => {
    expect(sameRepository('https://gitlab.com/reddevs/payments', 'https://github.com/reddevs/payments')).toBe(
      false,
    );
    expect(sameRepository('payments', 'payments')).toBe(false);
  });
});
