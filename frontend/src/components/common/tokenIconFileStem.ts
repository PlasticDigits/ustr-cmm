/** Local PNG stem. DEX catalog uses CL8Y; CMM pins that CW20 as CL8Y-cb. */
export function tokenIconFileStem(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper === 'CL8Y-CB' || upper.startsWith('CL8Y-CB-')) return 'CL8Y';
  return upper;
}
