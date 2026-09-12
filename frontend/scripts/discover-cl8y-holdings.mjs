#!/usr/bin/env node
/**
 * Discover CL8Y pairs the CMM treasury actually holds (#18).
 *
 * Catalog: GET https://indexer.dex.cl8y.com/api/v1/pairs (fail closed on stale/5xx).
 * Holds: LCD CW20 `balance` of each catalog `lp_token` at the pinned treasury.
 * Never writes tokenlist pins. Never uses indexer trader positions as a hold signal.
 *
 * Usage: node scripts/discover-cl8y-holdings.mjs
 */

const TREASURY = 'terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2';
const PAIRS_URL = 'https://indexer.dex.cl8y.com/api/v1/pairs';
const LCDS = [
  'https://terra-classic-lcd.publicnode.com',
  'https://api-lunc-lcd.binodes.com',
  'https://lcd.terra-classic.hexxagon.io',
];

const KNOWN_PINS = new Map([
  [
    'terra16vxrhpvpcucu05y0nr862vf9hnqeh274uaff4s7hz4n0ea74006qf5hgqy',
    'terra1ak8w9k34ex237h9pmquxqjevhzvflqaatuaj9pr8ym287n7atj6qw2ty4p',
  ],
  [
    'terra1ceprjsxp86ggftf5e38wwt34l83e5gq7penkdnv4wsatkwcs8v6qccw55f',
    'terra1jv6y058w6qx0xzcspcuv0du4qj95amwhvy4lftlf7mlyjj24v9ms8dzdgy',
  ],
  [
    'terra1xx5t5em3aza3lst0s5yc7rjgx9psapa3345v2vzfqkrprhw3vv6q3hahxy',
    'terra1s3jk92zeslgxxaux5nj8gtcqxafwsufglw2rhkazv4rrt7sg3wfsqj7twz',
  ],
  [
    'terra1tz5vwrungh6drd9nt95qym3k892vs3as8nqmu7sg4ypek7wxvv4qm89upc',
    'terra1u277xxcknv2r37d7xa5mnyxu3q26fyu9e9uexmyu2u99g3qfx62q2jen2c',
  ],
  [
    'terra163qm8z5rjgp8av6c6sg673lq2v4kfa0we5uhtzj8alfwhddfhjfs27k40z',
    'terra1hymuueuu43750rzut69hxmefl3m5gg27uxnu9fytcvlah27l5rtsrg87rc',
  ],
  [
    'terra1rmdtckz5gd0usja36ydwat6prnmew639ry37yq72xh9ek4s3m83sehn5u6',
    'terra12ff3nhu239y6a5lh0rs8nwlntc9wulkm3c4x598hp5gjfeqk87xszxkrmp',
  ],
  [
    'terra15rl8g308yzzt5kxu4skgwlahrvm8adyv0s2cupsmvte0akgs2ttsszau38',
    'terra132uuzdnjce0c8g5dalyvdgl47ny697udesk972cg05e5y7gn485qz6tdch',
  ],
  [
    'terra17l7eqc5j8vkm09up55etfggpr6y92ka6p03yc765mt3nerqcnhdsl6l7jq',
    'terra10ur635zd6fmt4fxveven8lcx8xkr55t6dxjxh5dctmcc5lrxjqqslq4l3s',
  ],
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ustr-cmm-cl8y-discover' } });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function lcdSmart(contract, query) {
  const q = Buffer.from(JSON.stringify(query)).toString('base64');
  let last;
  for (const lcd of LCDS) {
    try {
      await sleep(550);
      const data = await httpJson(`${lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${q}`);
      return data.data;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

async function fetchCatalog() {
  const items = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await httpJson(`${PAIRS_URL}?limit=100&offset=${offset}`);
    if (!page || !Array.isArray(page.items)) {
      throw new Error('indexer pairs page missing items — fail closed');
    }
    items.push(...page.items);
    total = typeof page.total === 'number' ? page.total : items.length;
    if (page.items.length === 0) break;
    offset += page.items.length;
  }
  return items;
}

async function main() {
  const catalog = await fetchCatalog();
  const rows = [];
  for (const pair of catalog) {
    const label = `${pair.asset_0?.symbol}/${pair.asset_1?.symbol}`;
    const pinned = KNOWN_PINS.get(pair.pair_address) === pair.lp_token;
    let balance = 0n;
    let lcdOk = true;
    try {
      const bal = await lcdSmart(pair.lp_token, { balance: { address: TREASURY } });
      balance = BigInt(bal.balance || '0');
    } catch (err) {
      lcdOk = false;
      console.error(`LCD fail ${label}:`, err instanceof Error ? err.message : err);
    }
    rows.push({
      label,
      pair: pair.pair_address,
      lp: pair.lp_token,
      pinned,
      lcdOk,
      held: lcdOk && balance > 0n,
      balance: balance.toString(),
    });
  }

  const heldUnpinned = rows.filter((r) => r.held && !r.pinned);
  const heldPinned = rows.filter((r) => r.held && r.pinned);
  const catalogOnly = rows.filter((r) => !r.held);

  console.log(JSON.stringify({
    treasury: TREASURY,
    catalogCount: catalog.length,
    heldPinned,
    heldUnpinned,
    catalogUnheld: catalogOnly.map((r) => ({ label: r.label, pair: r.pair, lp: r.lp })),
    note: 'Do not pin catalogUnheld. Pin heldUnpinned only after LCD confirm + AddCw20.',
  }, null, 2));

  if (heldUnpinned.length > 0) {
    console.error('NEW HELD UNPINNED PAIRS — tokenlist pin required before they enter CR.');
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
