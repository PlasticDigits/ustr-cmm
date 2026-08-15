/**
 * Terra Classic bech32 helpers.
 *
 * Invariant: contract/token addresses used for LCD queries and finder links
 * must be pinned `terra1…` strings from CONTRACTS / tokenlist — never query-string input.
 */

const TERRA1 = /^terra1[a-z0-9]{38,}$/;

export function isTerraContractAddress(value: string | undefined | null): value is string {
  return typeof value === 'string' && TERRA1.test(value);
}
