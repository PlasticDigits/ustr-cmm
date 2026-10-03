/**
 * Public BSC JSON-RPC for ERC-20 `balanceOf`.
 *
 * Calls are queued with a minimum gap so dataseeds are not burst. A failed
 * host cools down and the next listed endpoint is tried. Successful balances
 * are cached. This client does not know about CMM ratios.
 */

import { BSC_RPC } from '../utils/constants';

const BALANCE_OF_SELECTOR = '70a08231';

export interface BscRpcClient {
  erc20Balance(token: string, holder: string): Promise<bigint>;
}

export interface BscRpcClientOptions {
  endpoints: readonly string[];
  minRequestIntervalMs: number;
  cacheTtlMs: number;
  requestTimeoutMs: number;
  endpointCooldownMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function normalizeHexAddress(value: string, label: string): string {
  const addr = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(addr)) {
    throw new Error(`invalid ${label} address`);
  }
  return addr;
}

function normalizeAddress(value: string, label: string): string {
  return `0x${normalizeHexAddress(value, label)}`;
}

/** `balanceOf(address)` calldata. */
export function encodeErc20BalanceOf(holder: string): string {
  const addr = normalizeHexAddress(holder, 'holder');
  return `0x${BALANCE_OF_SELECTOR}${addr.padStart(64, '0')}`;
}

/** Decode an eth_call uint256. Rejects empty and oversized hex. */
export function decodeErc20Balance(hex: string): bigint {
  const raw = hex.trim().toLowerCase();
  if (!/^0x[0-9a-f]{1,64}$/.test(raw)) {
    throw new Error('invalid erc20 balance');
  }
  return BigInt(raw);
}

export function createBscRpcClient(options: BscRpcClientOptions): BscRpcClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));
  const endpoints = options.endpoints.map((endpoint) => endpoint.replace(/\/+$/, ''));
  if (endpoints.length === 0) {
    throw new Error('bsc rpc endpoints are empty');
  }

  let nextAllowedAt = 0;
  let chain: Promise<void> = Promise.resolve();
  const unhealthyUntil = new Map<string, number>();
  const cache = new Map<string, { at: number; balance: bigint }>();
  const inflight = new Map<string, Promise<bigint>>();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const pace = async () => {
    const wait = nextAllowedAt - now();
    if (wait > 0) await sleep(wait);
    nextAllowedAt = now() + options.minRequestIntervalMs;
  };

  const orderedEndpoints = (): string[] => {
    const t = now();
    const healthy: string[] = [];
    const cooled: string[] = [];
    for (const endpoint of endpoints) {
      if ((unhealthyUntil.get(endpoint) ?? 0) > t) cooled.push(endpoint);
      else healthy.push(endpoint);
    }
    return [...healthy, ...cooled];
  };

  const callEndpoint = async (endpoint: string, to: string, data: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.requestTimeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`bsc rpc http ${response.status}`);
      }
      const body = (await response.json()) as { result?: unknown; error?: unknown };
      if (body.error) {
        throw new Error('bsc rpc error');
      }
      if (typeof body.result !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(body.result)) {
        throw new Error('bsc rpc empty result');
      }
      return body.result;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const readBalance = async (token: string, data: string): Promise<bigint> => {
    const to = normalizeAddress(token, 'token');
    let tried = 0;
    for (const endpoint of orderedEndpoints()) {
      tried += 1;
      try {
        const hex = await enqueue(async () => {
          await pace();
          return callEndpoint(endpoint, to, data);
        });
        unhealthyUntil.delete(endpoint);
        return decodeErc20Balance(hex);
      } catch {
        unhealthyUntil.set(endpoint, now() + options.endpointCooldownMs);
      }
    }
    throw new Error(`bsc rpc failed (${tried} endpoints)`);
  };

  return {
    async erc20Balance(token: string, holder: string): Promise<bigint> {
      const data = encodeErc20BalanceOf(holder);
      const key = `${normalizeAddress(token, 'token')}:${data}`;
      const cached = cache.get(key);
      if (cached && now() - cached.at < options.cacheTtlMs) {
        return cached.balance;
      }
      const pending = inflight.get(key);
      if (pending) return pending;
      const promise = readBalance(token, data)
        .then((balance) => {
          cache.set(key, { at: now(), balance });
          return balance;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, promise);
      return promise;
    },
  };
}

export const bscRpcClient = createBscRpcClient({
  endpoints: BSC_RPC.endpoints,
  minRequestIntervalMs: BSC_RPC.minRequestIntervalMs,
  cacheTtlMs: BSC_RPC.cacheTtlMs,
  requestTimeoutMs: BSC_RPC.requestTimeoutMs,
  endpointCooldownMs: BSC_RPC.endpointCooldownMs,
});
