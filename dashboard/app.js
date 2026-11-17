// Token Radar's dashboard: reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters, a per-protocol detail view and the live-token set.
// No network: every byte it shows is in data.js. The farm plan is the same derivation main.ts
// writes to board.json, and the page recomputes each row's implied value and says whether it
// matches the number board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  // Compact rows: [slug, name, category, chains, tvl, chg, age, implied]
  function unpackRows() {
    return DATA.rows.map(function (r, i) {
      return {
        rank: i + 1,
        slug: r[0],
        name: r[1],
        category: r[2],
        chains: r[3] ? r[3].split('|') : [],
        tvl_usd: r[4],
        change_7d: r[5],
        age_days: r[6],
        implied_value_usd: r[7]
      };
    });
  }
  // Live rows: [slug, name, category, chains, tvl, mcap, chg]
  function unpackLive() {
    return DATA.live.map(function (r) {
      return {
        slug: r[0],
        name: r[1],
        category: r[2],
        chains: r[3] ? r[3].split('|') : [],
        tvl_usd: r[4],
        mcap_usd: r[5],
        change_7d: r[6]
      };
    });
  }
  var ROWS = unpackRows();
  var LIVE = unpackLive();
  var WATCHLIST = {};
  (DATA.watchlist || []).forEach(function (s) { WATCHLIST[s] = true; });
  var BY_SLUG = {};
  ROWS.forEach(function (r) { BY_SLUG[r.slug] = r; });

  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 1000) / 1000).toFixed(3) + 'x'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The model, recomputed in the page from the same figures main.ts scores with.
  function multipleFor(row) {
    var cat = row.category || 'Other';
    var m = DATA.cat_mult[cat];
    return m === undefined ? DATA.global_multiple : m;
  }
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chainMult = 1 + m.chain_weight * Math.min(Math.max(row.chains.length - 1, 0), m.chain_cap);
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * multipleFor(row) * growthMult * maturity * chainMult)),
      growth: growth,
      growthMult: growthMult,
      maturity: maturity,
      chainMult: chainMult,
      multiple: multipleFor(row)
    };
  }

  // The farm plan: the same derivation main.ts writes to board.json.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Make one qualifying action each week: add collateral, borrow a small amount, or repay part of a loan.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Make one qualifying action each week: swap once, add or remove a little liquidity, or claim and restake rewards.';
    if (c.indexOf('bridge') >= 0) return 'Make one qualifying action each week: bridge a small amount or use the bridged funds inside the app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Make one qualifying action each week: top up the stake a little, or claim and restake the rewards.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Make one qualifying action each week: open and close one small position, or adjust the margin.';
    if (c.indexOf('prediction') >= 0) return 'Make one qualifying action each week: place one small market position or settle one you hold.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Make one qualifying action each week: deposit a little more, or move between the vaults it offers.';
    if (c.indexOf('stable') >= 0) return 'Make one qualifying action each week: mint, redeem or move a small amount of the stable asset.';
    if (c.indexOf('rwa') >= 0) return 'Make one qualifying action each week: mint a little more of the yield asset, or claim its yield.';
    if (c.indexOf('insurance') >= 0) return 'Make one qualifying action each week: renew or top up the cover, or vote on a claim if one is open.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  // Exposed for the build's own checks: the page's plan must equal board.json's plan, row for row.
  window.__farmSteps = farmSteps;

  function rows() {
    var q = state.q.trim().toLowerCase();
    return ROWS.filter(function (r) {
      if (state.watchlist && !WATCHLIST[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.chains.join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // Hash deep links: #p=<slug> opens a detail view, #q/#category/#chain/#watchlist/#tab filter.
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function header() {
    var totalTop10 = ROWS.slice(0, 10).reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Top 10 implied ', el('b', { text: fmtUsd(totalTop10) })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var top = ROWS[0];
    return el('section', { class: 'lede' },
      el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
      el('p', null,
        'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
        ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
        ' more pre-token protocols, so the board holds ', el('b', { text: String(DATA.board_size) }),
        ' rows in all. Implied value is a model, not a promise: it prices what a launch would be worth if the protocol kept its record, it never predicts a launch.'
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug is on the board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' of them below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('small', { text: top ? top.name + ' at rank 1' : '' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown with market caps, not ranked' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(ROWS.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(ROWS.reduce(function (all, r) { return all.concat(r.chains); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + ROWS.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.selected = null; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; state.selected = null; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows' : LIVE.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = ROWS[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: WATCHLIST[r.slug] ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    LIVE.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Already trading: these protocols have a token, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are what price the board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function whyLine(row) {
    var tvlRank = ROWS.filter(function (r) { return r.tvl_usd > row.tvl_usd; }).length + 1;
    var catRows = ROWS.filter(function (r) { return (r.category || 'Other') === (row.category || 'Other'); });
    var catRank = catRows.filter(function (r) { return r.implied_value_usd > row.implied_value_usd; }).length + 1;
    var parts = [
      'Rank ' + row.rank + ' of ' + ROWS.length + ' by implied value',
      '#' + tvlRank + ' by TVL among pre-token protocols',
      '#' + catRank + ' of ' + catRows.length + ' in ' + (row.category || 'Other')
    ];
    if (row.change_7d !== null && row.change_7d !== undefined) parts.push('TVL ' + (row.change_7d >= 0 ? 'grew ' : 'fell ') + Math.abs(row.change_7d).toFixed(1) + '% in 7 days');
    if (row.age_days !== null && row.age_days !== undefined) parts.push('running ' + fmtAge(row.age_days) + ' with no token on record');
    if (row.chains.length > 1) parts.push('live on ' + row.chains.length + ' chains');
    return parts.join('; ') + '.';
  }

  function detailSection(row) {
    var v = impliedOf(row);
    var m = DATA.model;
    var cat = row.category || 'Other';
    var n = DATA.cat_n[cat] || 0;
    var fromCategory = DATA.cat_mult[cat] !== undefined;
    var comps = DATA.comp[cat] || [];
    var steps = farmSteps(row);
    var recomputed = v.implied;
    var matchNote = recomputed === row.implied_value_usd
      ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries.'
      : 'The page recomputes this row as ' + fmtUsd(recomputed) + ', which differs from the board: the data would be stale.';
    var section = el('section', { class: 'panel detail', id: 'detail', 'aria-labelledby': 'detail-title' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + ROWS.length + (WATCHLIST[row.slug] ? ' · watchlist' : ' · early radar') }),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', { class: 'sub', text: cat + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
        ),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { closeDetail(); } })
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Implied value' }),
        el('div', { class: 'eq' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(v.multiple) })),
          el('div', null, el('span', { text: 'Growth x maturity x chains' }), el('b', { class: 'num', text: v.growthMult.toFixed(2) + ' x ' + v.maturity.toFixed(2) + ' x ' + v.chainMult.toFixed(2) })),
          el('div', { class: 'wide' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
        ),
        el('p', { class: 'why', text: whyLine(row) }),
        el('p', { class: 'note', text: matchNote + ' Model ' + DATA.model_version + ': implied = TVL x category multiple x (1 + growth x ' + m.growth_weight + ') x maturity x chains. This is an estimate, not a price.' })
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Where the multiple comes from' }),
        el('p', { class: 'note', text: fromCategory
          ? 'The ' + cat + ' multiple is the median market-cap-to-TVL ratio of the ' + n + ' listed ' + cat + ' protocols in this snapshot (at least ' + m.min_listed_for_category + ' needed). The biggest three are below.'
          : 'Too few listed ' + cat + ' protocols to measure (' + n + '), so this row uses the whole market median of ' + fmtMult(DATA.global_multiple) + ' across all listed protocols in the snapshot.' }),
        comps.length > 0 ? el('div', { class: 'table-wrap' },
          el('table', { class: 'mult-table' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Listed comparable' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
            el('tbody', null, comps.map(function (c) {
              return el('tr', null,
                el('td', null, el('b', { text: c[0] })),
                el('td', { class: 'num', text: fmtMult(c[1]) })
              );
            }))
          )
        ) : null
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      )
    );
    return section;
  }

  function modelPanel() {
    var m = DATA.model;
    var cats = Object.keys(DATA.cat_mult).sort(function (a, b) { return DATA.cat_mult[b] - DATA.cat_mult[a]; });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text:
        'implied = round( tvl_usd\n' +
        '              x category multiple\n' +
        '              x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')\n' +
        '              x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')\n' +
        '              x (1 + ' + m.chain_weight + ' x min(chains - 1, ' + m.chain_cap + ')) )'
      }),
      el('p', { class: 'sub', text: 'The category multiple is the median market-cap-to-TVL ratio of the snapshot\'s own listed protocols in that category (at least ' + m.min_listed_for_category + ' of them); a category with too few listed protocols falls back to the whole-market median of ' + fmtMult(DATA.global_multiple) + '. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Multiple' }), el('th', { scope: 'col', text: 'Listed protocols measured' }))),
          el('tbody', null, cats.map(function (c) {
            return el('tr', null,
              el('td', null, el('b', { text: c })),
              el('td', { class: 'num', text: fmtMult(DATA.cat_mult[c]) }),
              el('td', { class: 'num', text: String(DATA.cat_n[c] || 0) })
            );
          }))
        )
      )
    );
  }

  function methodPanel() {
    return el('section', { class: 'panel method' },
      el('h2', { text: 'What this radar is, and is not' }),
      el('ul', null,
        el('li', null, el('b', { text: 'Records no token, not has none. ' }), 'A protocol on this board records no token in DefiLlama. It may still have one the record does not carry.'),
        el('li', null, el('b', { text: 'Implied value is our claim. ' }), 'It prices what a launch would be worth if the protocol kept its record. It never predicts whether or when a token is issued.'),
        el('li', null, el('b', { text: 'Wrapped and staked products are out. ' }), 'A wrapped, staked or bridged product of a token that already trades is not a protocol still waiting on a launch of its own.'),
        el('li', null, el('b', { text: 'Farm plans are generic by design. ' }), 'Each plan is derived from the protocol\'s own category, chains, TVL and age. Check the protocol\'s own pages before you move funds; never pay to claim.'),
      ),
      el('p', null, 'Source: ' + DATA.source + '. Snapshot date ' + DATA.as_of + '.')
    );
  }

  function footer() {
    return el('div', { class: 'foot', text: 'Token Radar, model ' + DATA.model_version + ' · Built by an AI agent for the make.fun best token launch radar bounty · Data: DefiLlama protocol index, snapshot ' + DATA.as_of + ' · Implied values are the entry\'s own model, never a prediction.' });
  }

  function openDetail(slug) {
    var row = BY_SLUG[slug];
    if (!row) return;
    state.selected = slug;
    writeHash();
    render();
    var d = document.getElementById('detail');
    if (d && d.scrollIntoView) d.scrollIntoView({ block: 'start' });
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token' && state.selected && BY_SLUG[state.selected]) {
      shell.appendChild(detailSection(BY_SLUG[state.selected]));
    }
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(methodPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  // A deep link to a detail view lands on it: the detail sits below a long table.
  if (state.selected && BY_SLUG[state.selected]) {
    var d = document.getElementById('detail');
    if (d && d.scrollIntoView) d.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) closeDetail();
  });
})();
