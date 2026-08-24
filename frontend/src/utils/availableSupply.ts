/**
 * Available-supply accounting (#16).
 *
 * Available = outstanding − CMM-owned.
 * CMM-owned = treasury spot CW20 + pro-rata allowlisted LP claims
 *   claim_i = floor(reserve_i × lp_balance / total_share)
 *
 * Invariants:
 * - Holder is the pinned treasury only. No window / wrap-mapper / airdrop crawl.
 * - Fail closed: unknown outstanding, unknown spot, failed LP with balance > 0,
 *   over-share, zero-share, or CMM-owned > outstanding → inventory unknown
 *   (never a negative float; never fake ∞).
 * - One claim per LP address (duplicate tokenlist rows do not double-count).
 */

import { protocolPins } from './lpEligibility';
import type { LpLegKind } from './lpEligibility';

export type ProtocolTokenId = 'ust1' | 'ustr' | 'cLunc' | 'cUstc';

export const PROTOCOL_TOKEN_IDS: readonly ProtocolTokenId[] = [
  'ust1',
  'ustr',
  'cLunc',
  'cUstc',
] as const;

export interface TokenIssuanceBreakdown {
  outstanding: bigint;
  cmmOwned: bigint;
  availableSupply: bigint;
  /** False when outstanding, spot, or LP claims could not be certified. */
  inventoryKnown: boolean;
}

export interface AvailableSupplyResult {
  available: bigint | null;
  cmmOwned: bigint | null;
  clamped: boolean;
  inventoryKnown: boolean;
}

export interface ProtocolLegClaimInput {
  kind: LpLegKind;
  address?: string;
  amountRaw: bigint;
}

export interface LpClaimSource {
  lpAddress: string;
  lpBalance: bigint;
  totalShare: bigint | null;
  queryFailed: boolean;
  /** LP CW20 balance query failed — treat as uncertified even if balance is 0. */
  balanceUnknown?: boolean;
  legs: ProtocolLegClaimInput[] | null;
  /** Protocol tokens declared on the pin — used when the pool query fails. */
  declaredProtocolIds: ProtocolTokenId[];
}

export function emptyIssuance(inventoryKnown = false): TokenIssuanceBreakdown {
  return {
    outstanding: 0n,
    cmmOwned: 0n,
    availableSupply: 0n,
    inventoryKnown,
  };
}

/**
 * Pro-rata LP claim. Returns null when the share is unusable (fail closed).
 */
export function claimRaw(
  reserveRaw: bigint,
  lpBalance: bigint,
  totalShare: bigint
): bigint | null {
  if (reserveRaw < 0n || lpBalance < 0n || totalShare <= 0n) return null;
  if (lpBalance > totalShare) return null;
  return (reserveRaw * lpBalance) / totalShare;
}

export function protocolTokenIdFromLeg(
  kind: LpLegKind,
  address: string | undefined,
  networkPins = protocolPins()
): ProtocolTokenId | null {
  if (kind === 'ust1') return 'ust1';
  if (kind === 'ustr') return 'ustr';
  if (kind === 'wrap') {
    if (address && address === networkPins.cLunc) return 'cLunc';
    if (address && address === networkPins.cUstc) return 'cUstc';
  }
  return null;
}

export function computeAvailableSupply(
  outstanding: bigint | null,
  cmmOwned: bigint | null
): AvailableSupplyResult {
  if (outstanding === null || cmmOwned === null || outstanding < 0n || cmmOwned < 0n) {
    return {
      available: null,
      cmmOwned,
      clamped: false,
      inventoryKnown: false,
    };
  }
  if (cmmOwned > outstanding) {
    return {
      available: 0n,
      cmmOwned,
      clamped: true,
      inventoryKnown: false,
    };
  }
  return {
    available: outstanding - cmmOwned,
    cmmOwned,
    clamped: false,
    inventoryKnown: true,
  };
}

export function toIssuanceBreakdown(
  outstanding: bigint | null,
  cmmOwned: bigint | null
): TokenIssuanceBreakdown {
  const result = computeAvailableSupply(outstanding, cmmOwned);
  return {
    outstanding: outstanding !== null && outstanding >= 0n ? outstanding : 0n,
    cmmOwned: result.cmmOwned !== null && result.cmmOwned >= 0n ? result.cmmOwned : 0n,
    availableSupply: result.available !== null ? result.available : 0n,
    inventoryKnown: result.inventoryKnown,
  };
}

/**
 * Sum treasury spot + unique-LP claims per protocol token.
 * A failed / over-share / zero-share LP with balance > 0 poisons the protocol
 * tokens declared on that pin (cannot certify available supply).
 */
function poisonOwned(
  owned: Record<ProtocolTokenId, bigint | null>,
  ids: ProtocolTokenId[]
): void {
  for (const id of ids) owned[id] = null;
}

export function aggregateProtocolOwned(
  spot: Record<ProtocolTokenId, bigint | null>,
  sources: LpClaimSource[]
): Record<ProtocolTokenId, bigint | null> {
  const owned: Record<ProtocolTokenId, bigint | null> = {
    ust1: spot.ust1,
    ustr: spot.ustr,
    cLunc: spot.cLunc,
    cUstc: spot.cUstc,
  };
  const seenLp = new Set<string>();

  for (const source of sources) {
    if (source.lpAddress && seenLp.has(source.lpAddress)) continue;
    if (source.lpAddress) seenLp.add(source.lpAddress);

    const declaredOrAll =
      source.declaredProtocolIds.length > 0 ? source.declaredProtocolIds : [...PROTOCOL_TOKEN_IDS];

    if (source.balanceUnknown) {
      poisonOwned(owned, declaredOrAll);
      continue;
    }
    if (source.lpBalance <= 0n) continue;

    if (source.queryFailed || source.totalShare === null || source.legs === null) {
      poisonOwned(owned, declaredOrAll);
      continue;
    }
    if (source.totalShare <= 0n || source.lpBalance > source.totalShare) {
      poisonOwned(
        owned,
        source.declaredProtocolIds.length > 0
          ? source.declaredProtocolIds
          : source.legs
              .map((leg) => protocolTokenIdFromLeg(leg.kind, leg.address))
              .filter((id): id is ProtocolTokenId => id !== null)
      );
      continue;
    }

    for (const leg of source.legs) {
      const id = protocolTokenIdFromLeg(leg.kind, leg.address);
      if (!id) continue;
      if (owned[id] === null) continue;
      const claim = claimRaw(leg.amountRaw, source.lpBalance, source.totalShare);
      if (claim === null) {
        owned[id] = null;
        continue;
      }
      owned[id] = (owned[id] ?? 0n) + claim;
    }
  }

  return owned;
}
