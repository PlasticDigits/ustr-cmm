import { describe, expect, it } from 'vitest';
import {
  createBscRpcClient,
  decodeErc20Balance,
  encodeErc20BalanceOf,
} from './bscRpc';

const HOLDER = '0xD7b3Bf05987052009c350874E810Df98dA95D258';
const USDT = '0x55d398326f99059ff775485246999027b3197955';
const CL8Y = '0x8f452a1fdd388a45e1080992eff051b4dd9048d2';

function rpcResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ok(result: string): Response {
  return rpcResponse({ jsonrpc: '2.0', id: 1, result });
}

function harness(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
) {
  let now = 1_000;
  const sleeps: number[] = [];
  const calls: string[] = [];
  const client = createBscRpcClient({
    endpoints: ['https://rpc-a.example', 'https://rpc-b.example'],
    minRequestIntervalMs: 500,
    cacheTtlMs: 20_000,
    requestTimeoutMs: 1_000,
    endpointCooldownMs: 30_000,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      calls.push(url);
      return handler(url, init ?? {});
    },
  });
  return {
    client,
    sleeps,
    calls,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('encodeErc20BalanceOf', () => {
  it('pads the holder into balanceOf calldata', () => {
    expect(encodeErc20BalanceOf(HOLDER)).toBe(
      '0x70a08231000000000000000000000000d7b3bf05987052009c350874e810df98da95d258',
    );
  });

  it('rejects a short address', () => {
    expect(() => encodeErc20BalanceOf('0x1234')).toThrow(/invalid holder/);
  });
});

describe('decodeErc20Balance', () => {
  it('decodes padded and short hex', () => {
    expect(decodeErc20Balance('0x0a')).toBe(10n);
    expect(decodeErc20Balance(`0x${'0'.repeat(63)}a`)).toBe(10n);
  });

  it('rejects empty and oversized results', () => {
    expect(() => decodeErc20Balance('0x')).toThrow(/invalid erc20 balance/);
    expect(() => decodeErc20Balance(`0x${'1'.repeat(65)}`)).toThrow(/invalid erc20 balance/);
  });
});

describe('createBscRpcClient', () => {
  it('rejects an empty endpoint list', () => {
    expect(() => createBscRpcClient({
      endpoints: [],
      minRequestIntervalMs: 1,
      cacheTtlMs: 1,
      requestTimeoutMs: 1,
      endpointCooldownMs: 1,
    })).toThrow(/empty/);
  });

  it('posts eth_call balanceOf to the token contract', async () => {
    let body = '';
    const { client } = harness(async (_url, init) => {
      body = String(init.body);
      return ok('0x01');
    });
    await client.erc20Balance(USDT, HOLDER);
    const parsed = JSON.parse(body) as {
      method: string;
      params: [{ to: string; data: string }, string];
    };
    expect(parsed.method).toBe('eth_call');
    expect(parsed.params[0].to).toBe(USDT);
    expect(parsed.params[0].data).toBe(encodeErc20BalanceOf(HOLDER));
    expect(parsed.params[1]).toBe('latest');
  });

  it('spaces successive balance reads', async () => {
    const { client, sleeps, calls } = harness(async () => ok('0x01'));
    await client.erc20Balance(USDT, HOLDER);
    await client.erc20Balance(CL8Y, HOLDER);
    expect(calls).toEqual(['https://rpc-a.example', 'https://rpc-a.example']);
    expect(sleeps).toEqual([500]);
  });

  it('falls through a failed endpoint and skips it while it cools down', async () => {
    const { client, calls } = harness(async (url) => {
      if (url.includes('rpc-a')) {
        return rpcResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'limit' } });
      }
      return ok('0x2a');
    });
    await expect(client.erc20Balance(USDT, HOLDER)).resolves.toBe(42n);
    await client.erc20Balance(CL8Y, HOLDER);
    expect(calls).toEqual([
      'https://rpc-a.example',
      'https://rpc-b.example',
      'https://rpc-b.example',
    ]);
  });

  it('reuses a cached balance inside the ttl and refetches after it', async () => {
    const clock = harness(async () => ok('0x05'));
    await clock.client.erc20Balance(USDT, HOLDER);
    await clock.client.erc20Balance(USDT, HOLDER);
    expect(clock.calls).toHaveLength(1);
    clock.advance(20_000);
    await clock.client.erc20Balance(USDT, HOLDER);
    expect(clock.calls).toHaveLength(2);
  });

  it('dedupes an in-flight read of the same balance', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let fetches = 0;
    const { client } = harness(async () => {
      fetches += 1;
      await gate;
      return ok('0x07');
    });
    const pending = Promise.all([
      client.erc20Balance(USDT, HOLDER),
      client.erc20Balance(USDT, HOLDER),
    ]);
    release();
    await expect(pending).resolves.toEqual([7n, 7n]);
    expect(fetches).toBe(1);
  });

  it('throws after every endpoint fails', async () => {
    const { client } = harness(async () => rpcResponse({ error: { message: 'down' } }, 503));
    await expect(client.erc20Balance(USDT, HOLDER)).rejects.toThrow(/bsc rpc failed \(2 endpoints\)/);
  });
});
