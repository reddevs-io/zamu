/* Made-up sample data for the M5 redesign (Margin). Workspace Northwind Labs. */
(function () {
  var LBC = { frontend: 'c1', backend: 'c2', mobile: 'c3', security: 'c4', infra: 'c5', i18n: 'c6', 'needs-owner': 'c7', design: 'c8', perf: 'c9',
    payouts: 'c6', reliability: 'c9', 'customer-facing': 'c8', billing: 'c1', docs: 'c5', ops: 'c4', growth: 'c7' };
  var PEOPLE = {
    ana: { i: 'AR', cls: 'av av-ana', name: 'Ana Ruiz' },
    tf: { i: 'TF', cls: 'av av-tf', name: 'Tomás Ferrer' },
    cd: { i: 'cd', cls: 'av agent av-cd', name: 'claude-dev' },
    rb: { i: 'rb', cls: 'av agent av-rb', name: 'review-bot' }
  };
  var TODO = [
    ['HBR-27', 'Check the trend figures on the insights screen against the export', 'h', 'frontend', 'ana'],
    ['HBR-30', 'Extend the trend checks to joint accounts', 'm', 'backend', 'cd'],
    ['HBR-65', 'Make the marketing site safe to promote before outreach starts', 'u', 'frontend security', 'ana', { due: ['over', '2 days overdue'] }],
    ['HBR-2', 'Simplify the first-run categorisation flow', 'm', 'design mobile', 'ana'],
    ['HBR-4', 'Balance history and net worth chart', 'n', 'frontend', 'cd'],
    ['HBR-5', 'Budgets v2: rollover, period history and shared budgets', 'h', 'backend frontend', 'ana', { sub: [4, 0] }],
    ['HBR-6', 'Cash-flow forecast until the next payday', 'n', '', 'cd'],
    ['HBR-10', 'Legal review of the pricing sentence in the terms', 'h', 'needs-owner', 'tf', { due: ['soon', 'Tomorrow'] }],
    ['HBR-13', 'Answer the open store-review questions before the iOS submission', 'u', 'mobile', 'ana', { due: ['soon', 'Today'] }],
    ['HBR-7', 'Settle-up between household members', 'm', 'backend', 'cd'],
    ['HBR-41', 'Rate-limit the public status endpoint', 'h', 'security infra', 'cd'],
    ['HBR-42', 'Rotate the staging database credentials', 'm', 'infra', 'cd', { bl: 1 }],
    ['HBR-39', "Don't congratulate a new user who hasn't sorted anything yet", 'l', 'frontend', 'ana'],
    ['HBR-40', 'Add the bank connection steps to the setup guide', 'm', '', 'tf'],
    ['HBR-44', 'Contrast pass on charts in dark mode', 'l', 'design', 'ana'],
    ['HBR-46', 'Plural forms in German and Dutch notifications', 'm', 'i18n', 'cd'],
    ['HBR-48', 'Cache exchange rates for offline use', 'm', 'mobile perf', 'cd'],
    ['HBR-51', 'Archive inactive accounts after 18 months', 'l', 'backend', null]
  ];
  var PROG = [
    ['HBR-164', 'Savings goals', 'h', 'frontend mobile', 'ana', { sub: [7, 2], parent: 1 }],
    ['HBR-71', 'Inbox sorting shows untranslated labels in every locale', 'h', 'i18n', 'cd'],
    ['HBR-146', 'Long French and Spanish labels clip on the home screen, the wallet and search', 'm', 'i18n frontend', 'cd'],
    ['HBR-166', 'Offline cache: browse every tab without a connection', 'h', 'mobile perf', 'cd', { due: ['fut', 'Nov 14'], sub: [6, 2] }],
    ['HBR-173', 'Speed up the transactions query on large accounts', 'u', 'backend perf', 'cd'],
    ['HBR-170', 'Move push notifications to the new provider', 'h', 'mobile infra', 'cd', { bl: 1 }],
    ['HBR-144', 'Pricing and store copy for the November release', 'm', 'needs-owner', 'tf', { due: ['over', '2 days overdue'] }],
    ['HBR-167', 'Financial health checks with tips', 'm', 'backend', 'ana'],
    ['HBR-178', 'Renew the push certificate before it expires', 'u', 'infra', 'ana', { due: ['soon', 'Today'] }],
    ['HBR-171', 'Product analytics events for the mobile app', 'm', 'mobile', 'cd'],
    ['HBR-176', 'Accessibility labels on chart controls', 'm', 'frontend', 'ana'],
    ['HBR-175', 'Weekly digest email', 'l', 'backend', 'rb'],
    ['HBR-180', 'Record new store screenshots', 'l', 'design', 'tf']
  ];
  var REVIEW = [
    ['HBR-110', 'Point the mobile client at the new bank-connection routes', 'h', 'mobile backend', 'cd'],
    ['HBR-186', 'Fix rounding in split expenses', 'u', 'backend', 'cd'],
    ['HBR-55', 'Product analytics in the mobile app', 'm', 'mobile', 'cd'],
    ['HBR-185', 'Show a sync error banner when a bank connection expires', 'h', 'frontend mobile', 'ana'],
    ['HBR-181', 'Retry webhook deliveries with backoff', 'h', 'backend', 'cd'],
    ['HBR-193', 'Store release 1.22.0 with the offline cache', 'h', 'mobile', 'ana', { due: ['fut', 'Nov 14'], bl: 1 }],
    ['HBR-182', 'Translate onboarding into French, Dutch, German, Spanish and Italian', 'm', 'i18n', 'cd'],
    ['HBR-188', 'Content security policy for the web app', 'h', 'security', 'rb'],
    ['HBR-143', 'Wallet analytics events', 'n', '', 'cd'],
    ['HBR-183', 'Remove the legacy aggregator aliases', 'm', 'backend', 'cd'],
    ['HBR-190', 'Bump the Expo SDK and native modules', 'm', 'mobile infra', 'cd'],
    ['HBR-191', 'Paginate the activity feed', 'm', 'frontend perf', 'cd'],
    ['HBR-189', 'Empty states for the budgets screen', 'l', 'design frontend', 'ana'],
    ['HBR-195', 'Audit log for shared account changes', 'm', 'security backend', 'cd'],
    ['HBR-165', 'Daily marketing digest', 'l', '', 'rb'],
    ['HBR-192', 'Explain the trend numbers in a tooltip', 'l', 'frontend', 'cd'],
    ['HBR-196', 'Seed data for the demo workspace', 'l', 'backend', 'cd']
  ];
  var SUBS = [
    ['HBR-164.2', 'English copy and analytics contract', 'n', '', 'ana', { st: 'done' }],
    ['HBR-164.3', 'Goal model and API', 'n', 'backend', 'cd', { st: 'done' }],
    ['HBR-164.4', 'Goal push notifications and daily scan', 'n', 'mobile', 'cd', { st: 'rev' }],
    ['HBR-164.5', 'Savings goals web UI', 'n', 'frontend', 'cd', { st: 'rev' }],
    ['HBR-164.6', 'Savings goals mobile UI', 'n', 'mobile', 'cd', { st: 'rev' }],
    ['HBR-164.7', 'Translations', 'n', 'i18n', 'cd', { st: 'rev' }],
    ['HBR-164.8', 'Integration, fixtures and release candidate', 'n', '', 'ana', { st: 'rev' }]
  ];
  var LONG = [
    ['HBR-201', 'Reconcile pending card transactions that settle with a different amount, currency or merchant name after the authorisation window closes', 'u', 'backend security i18n', 'cd', { due: ['over', '3 days overdue'], bl: 1, sub: [5, 3] }],
    ['HBR-202', 'Explain why a household budget shows a different remaining amount on the web dashboard than in the mobile app after a mid-month rollover', 'h', 'frontend mobile design', 'tf', { due: ['soon', 'Tomorrow'], sub: [3, 1] }],
    ['HBR-203', 'Stop sending duplicate push notifications when a device re-registers after an operating system update, a restore from backup or a reinstall', 'h', 'mobile infra', 'cd', { due: ['fut', 'Nov 21'], bl: 1 }]
  ];
  var UPD = ['2m', '14m', '1h', '1h', '3h', '5h', '1d', '1d', '2d', '2d', '3d', '4d', '6d', '1w', '1w', '2w', '2w', '3w'];
  function ringOf(sub) { var r = sub ? sub[1] / sub[0] : 0; return 'ring ' + (r === 0 ? 'p0' : r < 0.4 ? 'p30' : r < 0.6 ? 'p50' : r < 0.9 ? 'p75' : 'p100'); }
  function card(t, cls, idx, opts) {
    opts = opts || {};
    var x = t[5] || {};
    var lbs = t[3] ? t[3].split(' ') : [];
    var max = opts.allLabels ? 9 : 2;
    var p = t[4] ? PEOPLE[t[4]] : null;
    var sub = x.sub;
    var showAv = !!p && t[4] !== 'ana';
    return {
      key: t[0], title: t[1], cls: 'card' + (cls ? ' ' + cls : ''),
      pu: t[2] === 'u', ph: t[2] === 'h', labels: lbs.slice(0, max).map(function (n) { return { n: n, cls: 'lbd ' + LBC[n] }; }),
      hasMore: lbs.length > max, more: '+' + (lbs.length - max),
      showDue: !!x.due, dueTxt: x.due ? x.due[1] : '', dueCls: x.due ? 'due ' + x.due[0] : 'due',
      blocked: !!x.bl, showSub: !!sub && !x.parent, subTxt: sub ? sub[1] + '/' + sub[0] : '', ringCls: ringOf(sub),
      isParent: !!x.parent, parentTxt: sub ? sub[0] + ' subtasks · ' + sub[1] + ' done' : '',
      parentRef: x.pref || '', hasParentRef: !!x.pref,
      showAv: showAv, avCls: p ? p.cls : '', avTop: (p ? p.cls : '') + ' card-av', avI: p ? p.i : '',
      tCls: 'card-t' + (showAv ? ' has-av' : '') + (opts.full ? ' full' : ''),
      upd: UPD[(idx || 0) % UPD.length], stCls: 'st ' + (x.st || opts.st || 'todo')
    };
  }
  function row(t, cls, idx, st) {
    var c = card(t, '', idx, { allLabels: true, st: st });
    c.cls = 'row' + (cls ? ' ' + cls : '');
    c.priBlank = !(c.pu || c.ph);
    c.noAv = !c.showAv;
    return c;
  }
  var PROJECTS = [
    { name: 'Harbor', key: 'HBR', open: 123, tile: 'tile c1' },
    { name: 'Payments', key: 'PAY', open: 40, tile: 'tile c6' },
    { name: 'Atlas', key: 'ATL', open: 18, tile: 'tile c3' },
    { name: 'Lighthouse', key: 'LHT', open: 9, tile: 'tile c2' },
    { name: 'Docs site', key: 'DOC', open: 12, tile: 'tile c5' },
    { name: 'CLI', key: 'CLI', open: 21, tile: 'tile c4' }
  ];
  function side(activeKey, activeView) {
    return PROJECTS.map(function (p) {
      var on = p.key === activeKey;
      var views = ['List', 'Board', 'Milestones', 'Cycles', 'Settings'].map(function (v) { return { name: v, cls: 'sub-i' + (on && v === activeView ? ' on' : '') }; });
      return { name: p.name, initial: p.name.charAt(0), tile: p.tile, open: p.open, cls: 'nav-i' + (on && !activeView ? ' on' : ''), expanded: on && !!activeView, views: views };
    });
  }
  var LABELS = [
    ['frontend', 'c1', 31], ['backend', 'c2', 38], ['mobile', 'c3', 27], ['security', 'c4', 9], ['infra', 'c5', 14], ['i18n', 'c6', 12],
    ['needs-owner', 'c7', 4], ['design', 'c8', 11], ['perf', 'c9', 8], ['billing', 'c1', 6], ['docs', 'c5', 5], ['growth', 'c7', 3]
  ].map(function (l) { return { n: l[0], cls: 'lbd ' + l[1], sw: 'sw ' + l[1], count: l[2] }; });
  window.PM = { TODO: TODO, PROG: PROG, REVIEW: REVIEW, SUBS: SUBS, LONG: LONG, PEOPLE: PEOPLE, LBC: LBC, LABELS: LABELS, card: card, row: row, side: side, ringOf: ringOf };
})();
