#!/usr/bin/env node
/**
 * Independent treasury CR calculator (#18 / #16 / #20).
 *
 * CR = CR CMM Assets / CR CMM Liabilities × 100
 * CR CMM Assets = Σ non-protocol spot USD + Σ LP other-leg NAV
 * Total CMM Assets = CR assets + protocol spot USD + LP protocol-leg NAV
 * CR CMM Liabilities = available UST1×$1 + cUSTC×USTC + cLUNC×LUNC
 * (USTR is equity, not a liability).
 * Available = total_supply − treasury_spot − Σ allowlisted LP claims
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
const CL8Y_CB = 'terra16wtml2q66g82fdkx66tap0qjkahqwp4lwq3ngtygacg5q0kzycgqvhpax3';
const USDT = 'terra1z0xe7t5ymmltg4vju8tghkq0pewy4et548ta23nlu9zxtl950uyqkv8mv4';
const SPACEUSD_POOL = 'terra1ts0r4whpr48cwsnd7elgpuqqaqu5phy0ywx5x09f5zrnj9wda54sreeumg';
const CL8Y_CUSTC_POOL = 'terra1tz5vwrungh6drd9nt95qym3k892vs3as8nqmu7sg4ypek7wxvv4qm89upc';
const USDT_CLUNC_POOL = 'terra17l7eqc5j8vkm09up55etfggpr6y92ka6p03yc765mt3nerqcnhdsl6l7jq';
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
  {
    symbol: 'CL8Y-cb-cUSTC',
    lp: 'terra1u277xxcknv2r37d7xa5mnyxu3q26fyu9e9uexmyu2u99g3qfx62q2jen2c',
    pair: 'terra1tz5vwrungh6drd9nt95qym3k892vs3as8nqmu7sg4ypek7wxvv4qm89upc',
  },
  {
    symbol: 'CL8Y-cb-ALPHA',
    lp: 'terra1hymuueuu43750rzut69hxmefl3m5gg27uxnu9fytcvlah27l5rtsrg87rc',
    pair: 'terra163qm8z5rjgp8av6c6sg673lq2v4kfa0we5uhtzj8alfwhddfhjfs27k40z',
  },
  {
    symbol: 'UST1-ALPHA',
    lp: 'terra12ff3nhu239y6a5lh0rs8nwlntc9wulkm3c4x598hp5gjfeqk87xszxkrmp',
    pair: 'terra1rmdtckz5gd0usja36ydwat6prnmew639ry37yq72xh9ek4s3m83sehn5u6',
  },
  {
    symbol: 'cLUNC-cUSTC',
    lp: 'terra132uuzdnjce0c8g5dalyvdgl47ny697udesk972cg05e5y7gn485qz6tdch',
    pair: 'terra15rl8g308yzzt5kxu4skgwlahrvm8adyv0s2cupsmvte0akgs2ttsszau38',
  },
  {
    symbol: 'USDT-cLUNC',
    lp: 'terra10ur635zd6fmt4fxveven8lcx8xkr55t6dxjxh5dctmcc5lrxjqqslq4l3s',
    pair: 'terra17l7eqc5j8vkm09up55etfggpr6y92ka6p03yc765mt3nerqcnhdsl6l7jq',
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
  return addr === USTR || addr === CL8Y_CB || addr === USDT ? 18 : 6;
}

function whole(raw, decimals) {
  if (typeof raw !== 'bigint') raw = BigInt(raw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || raw < 0n) {
    return Number.NaN;
  }
  const base = 10n ** BigInt(decimals);
  const w = raw / base;
  const frac = raw % base;
  if (w > BigInt(Number.MAX_SAFE_INTEGER)) return Number.NaN;
  const fracStr = frac.toString().padStart(decimals, '0');
  return decimals === 0 ? Number(w.toString()) : Number(`${w.toString()}.${fracStr}`);
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

async function simulateTerraswapShape(pool, token, offerAmount = '1000000') {
  return lcdSmart(pool, {
    simulation: {
      offer_asset: {
        info: { token: { contract_addr: token } },
        amount: offerAmount,
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
  const protocolSpot = { ...owned };

  const spots = {
    vFDUSD: await cw20Bal(VFDUSD),
    ALPHA: await cw20Bal(ALPHA),
    USTRIX: await cw20Bal(USTRIX),
    SpaceUSD: await cw20Bal(SPACEUSD),
    'CL8Y-cb': await cw20Bal(CL8Y_CB),
    USDT: await cw20Bal(USDT),
  };

  let lpOtherUsd = 0;
  let lpProtocolUsd = 0;
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

  const spaceSim = await simulateTerraswapShape(SPACEUSD_POOL, SPACEUSD);
  const spaceUsd = (Number(spaceSim.return_amount) / 1e6) * px.LUNC;
  const cl8yPool = await lcdSmart(CL8Y_CUSTC_POOL, { pool: {} });
  let cl8yRes = 0n;
  let custcRes = 0n;
  for (const asset of cl8yPool.assets || []) {
    const addr = asset.info?.token?.contract_addr;
    if (addr === CL8Y_CB) cl8yRes = BigInt(asset.amount);
    if (addr === CUSTC) custcRes = BigInt(asset.amount);
  }
  const cl8yWhole = whole(cl8yRes, 18);
  const cl8yUsd = cl8yWhole > 0 ? (whole(custcRes, 6) * px.USTC) / cl8yWhole : 0;
  if (!(cl8yUsd > 0)) {
    throw new Error('CL8Y-cb USD unpriced — fail closed');
  }
  const usdtPool = await lcdSmart(USDT_CLUNC_POOL, { pool: {} });
  let usdtRes = 0n;
  let usdtCluncRes = 0n;
  for (const asset of usdtPool.assets || []) {
    const addr = asset.info?.token?.contract_addr;
    if (addr === USDT) usdtRes = BigInt(asset.amount);
    if (addr === CLUNC) usdtCluncRes = BigInt(asset.amount);
  }
  const usdtWhole = whole(usdtRes, 18);
  const usdtUsd = usdtWhole > 0 ? (whole(usdtCluncRes, 6) * px.LUNC) / usdtWhole : 0;
  if (!(usdtUsd > 0)) {
    throw new Error('USDT USD unpriced — fail closed');
  }
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
  if (!(alphaUsd > 0)) {
    throw new Error('ALPHA USD unpriced — fail closed');
  }

  const otherUsd = {
    [SPACEUSD]: spaceUsd,
    [ALPHA]: alphaUsd,
    [CL8Y_CB]: cl8yUsd,
    [USDT]: usdtUsd,
    uluna: px.LUNC,
    uusd: px.USTC,
  };

  let spotUsd =
    whole(uluna, 6) * px.LUNC +
    whole(uusd, 6) * px.USTC +
    whole(spots.vFDUSD, 6) * vfdUsd +
    whole(spots.ALPHA, 6) * alphaUsd +
    whole(spots.SpaceUSD, 6) * spaceUsd +
    whole(spots['CL8Y-cb'], 18) * cl8yUsd +
    whole(spots.USDT, 18) * usdtUsd;
  if (ustrixUsd && spots.USTRIX > 0n) spotUsd += whole(spots.USTRIX, 6) * ustrixUsd;

  let ustrUsd = 0;
  for (const row of lpRows) {
    const u1 = row.legs.find((leg) => leg.kind === 'ust1');
    const ur = row.legs.find((leg) => leg.kind === 'ustr');
    if (u1 && ur) {
      const ustrWhole = whole(ur.claim, ur.decimals);
      if (ustrWhole > 0) ustrUsd = whole(u1.claim, u1.decimals) / ustrWhole;
    }
  }
  if (!(ustrUsd > 0)) {
    throw new Error('USTR USD unpriced — fail closed');
  }

  for (const row of lpRows) {
    for (const leg of row.legs) {
      if (leg.kind === 'other') {
        const usd = otherUsd[leg.addr];
        if (!(usd > 0)) throw new Error(`unpriced other LP leg ${leg.addr}`);
        lpOtherUsd += whole(leg.claim, leg.decimals) * usd;
        continue;
      }
      const usd =
        leg.kind === 'ust1' ? 1 : leg.kind === 'ustr' ? ustrUsd : leg.addr === CLUNC ? px.LUNC : px.USTC;
      if (!(usd > 0)) throw new Error(`unpriced protocol LP leg ${leg.addr}`);
      lpProtocolUsd += whole(leg.claim, leg.decimals) * usd;
    }
  }

  const protocolSpotUsd =
    whole(protocolSpot.ust1, 6) * 1 +
    whole(protocolSpot.ustr, 18) * ustrUsd +
    whole(protocolSpot.cLunc, 6) * px.LUNC +
    whole(protocolSpot.cUstc, 6) * px.USTC;

  const avail = {
    ust1: ust1Supply - owned.ust1,
    ustr: ustrSupply - owned.ustr,
    cLunc: cluncSupply - owned.cLunc,
    cUstc: custcSupply - owned.cUstc,
  };
  const crAssetsUsd = spotUsd + lpOtherUsd;
  const totalAssetsUsd = crAssetsUsd + protocolSpotUsd + lpProtocolUsd;
  const totalLiabilitiesUsd =
    whole(ust1Supply, 6) * 1 +
    whole(cluncSupply, 6) * px.LUNC +
    whole(custcSupply, 6) * px.USTC;
  const crLiabilitiesUsd =
    whole(avail.ust1, 6) * 1 +
    whole(avail.cLunc, 6) * px.LUNC +
    whole(avail.cUstc, 6) * px.USTC;
  const denom = crLiabilitiesUsd;
  const assetsUsd = crAssetsUsd;
  const cr = (assetsUsd / denom) * 100;
  const ustcPer = whole(uusd, 6) / whole(avail.ust1, 6);
  const tier = cr > 190 ? 'BLUE' : cr >= 110 ? 'GREEN' : cr >= 95 ? 'YELLOW' : 'RED';

  const out = {
    prices: {
      ...px,
      USTR: ustrUsd,
      vFDUSD: vfdUsd,
      SpaceUSD: spaceUsd,
      ALPHA: alphaUsd,
      USTRIX: ustrixUsd,
      'CL8Y-cb': cl8yUsd,
      USDT: usdtUsd,
    },
    issuance: {
      ust1: { outstanding: ust1Supply.toString(), owned: owned.ust1.toString(), available: avail.ust1.toString() },
      ustr: { outstanding: ustrSupply.toString(), owned: owned.ustr.toString(), available: avail.ustr.toString() },
      cLunc: { outstanding: cluncSupply.toString(), owned: owned.cLunc.toString(), available: avail.cLunc.toString() },
      cUstc: { outstanding: custcSupply.toString(), owned: owned.cUstc.toString(), available: avail.cUstc.toString() },
    },
    numerator: {
      spotUsd,
      lpOtherUsd,
      protocolSpotUsd,
      lpProtocolUsd,
      crAssetsUsd,
      totalAssetsUsd,
    },
    liabilities: { totalLiabilitiesUsd, crLiabilitiesUsd },
    collateralization: cr,
    ustcPerAvailableUst1: ustcPer,
    assetsToLiabilities: assetsUsd / denom,
    tier,
    formula: 'CR = CR CMM Assets / CR CMM Liabilities × 100',
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
