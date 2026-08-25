#!/usr/bin/env node
/**
 * Independent treasury CR calculator (#18 / #16).
 *
 * CR = (Σ non-protocol spot USD + Σ LP other-leg NAV) / whole(UST1 available) × 100
 * UST1 available = total_supply − treasury_spot − Σ allowlisted LP UST1 claims
 *
 * LCD is source of truth. Does not read the frontend or indexer prices into the
 * denominator. Numerator USD uses CEX + session-equivalent oracle + DEX simulate
 * for spot CW20s (never LP mint simulate-swap).
 *
 * Usage: node scripts/verify-treasury-cr.mjs
 */

const TREASURY = 'terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2';
const UST1 = 'terra1f0eqgy9w7e5e7up97vjudqwx38tesf8ylx75x2lv3nwm0clry0pqmgfy72';
const USTR = 'terra1vy3kc0swag2rhn7jz6n72jp0l2ns0p6r6ez5grxq5uhj2rvs97fqfsetxv';
const CLUNC = 'terra1437qslye72t7qmmahn4t5chz50r8a62g45phwkquwpyu2l62u6ksqssgdg';
const CUSTC = 'terra1nap4dxh9tv35v0ynd9m4k6zt6c0dq6weszc4j5m564kjls56hu7qcr56ch';
const VFDUSD = 'terra1mnl9azefrqpmu888ar2u6zrcwr80hxlt3avf4300r576cw5ar7esvxsvj3';
const ORACLE = 'terra1fmht0t6svq3n24zx03nkfja0m40zhfyyxkdcvlrkl6u7gfe6aagq4gch8n';
const ALPHA = 'terra1x6e64es6yhauhvs3prvpdg2gkqdtfru840wgnhs935x8axr7zxkqzysuxz';
const USTRIX = 'terra1r3eaa2tucjr3es88wzuqpgxvssqflk9cghrjmf9uneds8wljyapqwtrcp5';
const SPACEUSD = 'terra1cvd5cgrs8rrl96hte34n57497u5f9cwuv3e6ztxgetkx4uzmcdyswv79zl';
const SPACEUSD_POOL = 'terra1ts0r4whpr48cwsnd7elgpuqqaqu5phy0ywx5x09f5zrnj9wda54sreeumg';
const USTRIX_POOL = 'terra1rvrywq2wxmzve8dm7sae2zx6er5969qnsl68pnh2xu2y6atdwq6qq9zq05';
const GARUDA_FACTORY = 'terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7';

const LPS = [
  {
    symbol: 'UST1-USTR',
    lp: 'terra1ak8w9k34ex237h9pmquxqjevhzvflqaatuaj9pr8ym287n7atj6qw2ty4p',
    pair: 'terra16vxrhpvpcucu05y0nr862vf9hnqeh274uaff4s7hz4n0ea74006qf5hgqy',
  },
  {
    symbol: 'UST1-cUSTC',
    lp: 'terra1jv6y058w6qx0xzcspcuv0du4qj95amwhvy4lftlf7mlyjj24v9ms8dzdgy',
    pair: 'terra1ceprjsxp86ggftf5e38wwt34l83e5gq7penkdnv4wsatkwcs8v6qccw55f',
  },
  {
    symbol: 'UST1-SpaceUSD',
    lp: 'terra1s3jk92zeslgxxaux5nj8gtcqxafwsufglw2rhkazv4rrt7sg3wfsqj7twz',
    pair: 'terra1xx5t5em3aza3lst0s5yc7rjgx9psapa3345v2vzfqkrprhw3vv6q3hahxy',
  },
];

const LCDS = [
  'https://terra-classic-lcd.publicnode.com',
  'https://api-lunc-lcd.binodes.com',
  'https://lcd.terra-classic.hexxagon.io',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ustr-cmm-cr-verify' } });
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

async function bank(denom) {
  let last;
  for (const lcd of LCDS) {
    try {
      await sleep(400);
      const data = await httpJson(`${lcd}/cosmos/bank/v1beta1/balances/${TREASURY}/by_denom?denom=${denom}`);
      return BigInt(data.balance?.amount || '0');
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

function kind(addr) {
  if (addr === UST1) return 'ust1';
  if (addr === USTR) return 'ustr';
  if (addr === CLUNC || addr === CUSTC) return 'wrap';
  return 'other';
}

function decOf(addr) {
  return addr === USTR ? 18 : 6;
}

function whole(raw, decimals) {
  return Number(raw) / 10 ** decimals;
}

async function tokenInfo(addr) {
  const info = await lcdSmart(addr, { token_info: {} });
  return BigInt(info.total_supply || '0');
}

async function cw20Bal(token) {
  const bal = await lcdSmart(token, { balance: { address: TREASURY } });
  return BigInt(bal.balance || '0');
}

async function basePrices() {
  const urls = [
    'https://data-api.binance.vision/api/v3/ticker/price?symbols=%5B%22LUNCUSDT%22%2C%22USTCUSDT%22%5D',
    'https://api.binance.com/api/v3/ticker/price?symbols=%5B%22LUNCUSDT%22%2C%22USTCUSDT%22%5D',
  ];
  for (const url of urls) {
    try {
      const rows = await httpJson(url);
      const map = Object.fromEntries(rows.map((r) => [r.symbol, Number(r.price)]));
      if (map.LUNCUSDT > 0 && map.USTCUSDT > 0) {
        return { LUNC: map.LUNCUSDT, USTC: map.USTCUSDT };
      }
    } catch {
      /* try next */
    }
  }
  const cg = await httpJson(
    'https://api.coingecko.com/api/v3/simple/price?ids=terra-luna,terrausd&vs_currencies=usd'
  );
  return { LUNC: cg['terra-luna'].usd, USTC: cg.terrausd.usd };
}

async function simulateTerraport(pool, token) {
  return lcdSmart(pool, {
    simulation: {
      offer_asset: {
        info: { token: { contract_addr: token } },
        amount: '1000000',
      },
    },
  });
}

async function garudaUsd(token, luncUsd) {
  const pair = await lcdSmart(GARUDA_FACTORY, {
    pair: { asset1: { cw20: token }, asset2: { native: 'uluna' } },
  });
  const contract = pair.contract;
  const sim = await lcdSmart(contract, {
    simulate_swap: { offer_asset: { cw20: token }, offer_amount: '1000000' },
  });
  return (Number(sim.return_amount) / 1e6) * luncUsd;
}

async function main() {
  const px = await basePrices();
  const uluna = await bank('uluna');
  const uusd = await bank('uusd');

  const ust1Supply = await tokenInfo(UST1);
  const ustrSupply = await tokenInfo(USTR);
  const cluncSupply = await tokenInfo(CLUNC);
  const custcSupply = await tokenInfo(CUSTC);

  const owned = {
    ust1: await cw20Bal(UST1),
    ustr: await cw20Bal(USTR),
    cLunc: await cw20Bal(CLUNC),
    cUstc: await cw20Bal(CUSTC),
  };

  const spots = {
    vFDUSD: await cw20Bal(VFDUSD),
    ALPHA: await cw20Bal(ALPHA),
    USTRIX: await cw20Bal(USTRIX),
    SpaceUSD: await cw20Bal(SPACEUSD),
  };

  let lpOtherUsd = 0;
  const lpRows = [];
  for (const lp of LPS) {
    const bal = await cw20Bal(lp.lp);
    if (bal === 0n) continue;
    const pool = await lcdSmart(lp.pair, { pool: {} });
    const total = BigInt(pool.total_share);
    const legs = [];
    for (const asset of pool.assets) {
      const addr = asset.info.token?.contract_addr;
      const denom = asset.info.native_token?.denom;
      const reserve = BigInt(asset.amount);
      const k = addr ? kind(addr) : 'other';
      const claim = (reserve * bal) / total;
      if (k === 'ust1') owned.ust1 += claim;
      if (k === 'ustr') owned.ustr += claim;
      if (addr === CLUNC) owned.cLunc += claim;
      if (addr === CUSTC) owned.cUstc += claim;
      legs.push({ addr: addr || denom, kind: k, claim, decimals: addr ? decOf(addr) : 6 });
    }
    lpRows.push({ symbol: lp.symbol, bal: bal.toString(), total: total.toString(), legs });
  }

  const oracle = await lcdSmart(ORACLE, { state: {} });
  const vfdUsd = Number(oracle.rate) / 1e18;
  if (!(vfdUsd >= 0.5 && vfdUsd <= 10) || oracle.paused) {
    throw new Error('vFDUSD oracle not usable — fail closed');
  }

  const spaceSim = await simulateTerraport(SPACEUSD_POOL, SPACEUSD);
  const spaceUsd = (Number(spaceSim.return_amount) / 1e6) * px.LUNC;
  const ustrixSim = await lcdSmart(USTRIX_POOL, {
    simulate_swap: {
      offer_asset: { cw20: USTRIX },
      offer_amount: '1000000',
    },
  }).catch(() => null);
  const ustrixUsd = ustrixSim
    ? (Number(ustrixSim.return_amount) / 1e6) * px.LUNC
    : await garudaUsd(USTRIX, px.LUNC).catch(() => null);
  const alphaUsd = await garudaUsd(ALPHA, px.LUNC);

  let spotUsd =
    whole(uluna, 6) * px.LUNC +
    whole(uusd, 6) * px.USTC +
    whole(spots.vFDUSD, 6) * vfdUsd +
    whole(spots.ALPHA, 6) * alphaUsd +
    whole(spots.SpaceUSD, 6) * spaceUsd;
  if (ustrixUsd && spots.USTRIX > 0n) spotUsd += whole(spots.USTRIX, 6) * ustrixUsd;

  for (const row of lpRows) {
    for (const leg of row.legs) {
      if (leg.kind !== 'other') continue;
      if (leg.addr !== SPACEUSD) throw new Error(`unpriced other LP leg ${leg.addr}`);
      lpOtherUsd += whole(leg.claim, leg.decimals) * spaceUsd;
    }
  }

  const avail = {
    ust1: ust1Supply - owned.ust1,
    ustr: ustrSupply - owned.ustr,
    cLunc: cluncSupply - owned.cLunc,
    cUstc: custcSupply - owned.cUstc,
  };
  const denom = whole(avail.ust1, 6);
  const assetsUsd = spotUsd + lpOtherUsd;
  const cr = (assetsUsd / denom) * 100;
  const ustcPer = whole(uusd, 6) / denom;
  const tier = cr > 190 ? 'BLUE' : cr >= 110 ? 'GREEN' : cr >= 95 ? 'YELLOW' : 'RED';

  const out = {
    prices: { ...px, vFDUSD: vfdUsd, SpaceUSD: spaceUsd, ALPHA: alphaUsd, USTRIX: ustrixUsd },
    issuance: {
      ust1: { outstanding: ust1Supply.toString(), owned: owned.ust1.toString(), available: avail.ust1.toString() },
      ustr: { outstanding: ustrSupply.toString(), owned: owned.ustr.toString(), available: avail.ustr.toString() },
      cLunc: { outstanding: cluncSupply.toString(), owned: owned.cLunc.toString(), available: avail.cLunc.toString() },
      cUstc: { outstanding: custcSupply.toString(), owned: owned.cUstc.toString(), available: avail.cUstc.toString() },
    },
    numerator: { spotUsd, lpOtherUsd, assetsUsd },
    collateralization: cr,
    ustcPerAvailableUst1: ustcPer,
    assetsToLiabilities: assetsUsd / denom,
    tier,
    formula: 'CR = (non-protocol spot USD + LP other NAV) / whole(UST1 available) × 100',
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
