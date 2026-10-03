/**
 * Bridge holdings at the BSC lock/unlock address.
 * Amounts are not treasury assets and are not counted in CMM ratios.
 */

import { Card, CardContent } from '../common/Card';
import { TokenIcon } from '../common/TokenIcon';
import { usePrices } from '../../hooks/usePrices';
import type { BridgeHoldings, BridgeTokenHolding } from '../../types/bridge';
import { BRIDGE } from '../../utils/constants';
import { formatTreasuryCardAmount, formatTreasuryUsd, TREASURY_ASSETS_GRID_CLASS } from '../../utils/treasuryAssetDisplay';

interface BridgeHoldingsCardProps {
  holdings: BridgeHoldings | null;
  isLoading?: boolean;
}

function displayUsd(token: BridgeTokenHolding, prices: Record<string, number>): number | null {
  if (token.balance === null) return null;
  const unit = prices[token.priceSymbol];
  if (unit === undefined || !(unit > 0)) return null;
  return (Number(token.balance) / 10 ** token.decimals) * unit;
}

function HoldingTile({
  token,
  usd,
  lockAddress,
}: {
  token: BridgeTokenHolding;
  usd: number | null;
  lockAddress: string;
}) {
  const tokenUrl = `${BRIDGE.explorer}/token/${token.address}?a=${lockAddress}`;
  return (
    <div
      data-testid={`bridge-holding-${token.symbol}`}
      className="flex flex-col gap-3 p-4 rounded-xl bg-gradient-to-r from-white/5 to-white/5 border border-white/5 hover:border-white/10 transition-colors group min-w-0 xl:flex-row xl:items-start xl:justify-between xl:gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <TokenIcon
          symbol={token.symbol}
          size="md"
          gradient={token.gradient}
          className="group-hover:scale-105 transition-transform"
        />
        <div className="min-w-0">
          <span className="font-medium text-white break-words">{token.symbol}</span>
          <a
            href={tokenUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="bridge-holding-token"
            className="block text-[10px] text-gray-500 hover:text-cyan-300"
          >
            BSC
          </a>
        </div>
      </div>
      <div className="min-w-0 w-full xl:w-auto xl:max-w-[58%] xl:text-right">
        {token.balance === null ? (
          <>
            <div data-testid="bridge-holding-amount" className="text-sm sm:text-base xl:text-lg font-mono-numbers font-semibold text-gray-500">
              —
            </div>
            <div data-testid="bridge-holding-error" className="text-[10px] text-amber-400/80 break-words">
              Balance unavailable
            </div>
          </>
        ) : (
          <>
            <div
              data-testid="bridge-holding-amount"
              className={`text-sm sm:text-base xl:text-lg font-mono-numbers font-semibold break-words ${token.iconColor}`}
            >
              {formatTreasuryCardAmount(token.balance, token.decimals)}
            </div>
            {usd !== null && (
              <div data-testid="bridge-holding-usd" className="text-xs text-gray-400 break-words">
                {formatTreasuryUsd(usd)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function BridgeHoldingsCard({ holdings, isLoading = false }: BridgeHoldingsCardProps) {
  const { prices } = usePrices();
  const lockAddress = holdings?.lockAddress ?? BRIDGE.lockAddress;
  const explorerUrl = `${BRIDGE.explorer}/address/${lockAddress}`;

  return (
    <div data-testid="bridge-holdings" data-state={isLoading ? 'loading' : 'ready'}>
      <Card className="h-full">
        <CardContent>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white">Bridge</h3>
              <p
                data-testid="bridge-lock-address"
                className="text-xs text-gray-500 font-mono break-all"
              >
                {lockAddress}
              </p>
            </div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="bridge-holdings-explorer"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-gray-400 hover:text-cyan-300 transition-all text-xs shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              BscScan
            </a>
          </div>

          <p data-testid="bridge-holdings-note" className="text-xs text-gray-500 mb-4">
            USDT and CL8Y held by the BSC lock/unlock address. These balances are separate
            from treasury reserves and are not counted in CMM asset ratios. They will later
            be compared with CMM debt borrowed from the bridge.
          </p>

          {isLoading ? (
            <div className={TREASURY_ASSETS_GRID_CLASS}>
              {BRIDGE.tokens.map((token) => (
                <div key={token.symbol} className="flex flex-col gap-3 p-4 rounded-xl bg-white/5 border border-white/5 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/10" />
                    <div className="h-4 w-16 bg-white/10 rounded" />
                  </div>
                  <div className="h-6 w-28 bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className={TREASURY_ASSETS_GRID_CLASS} data-testid="bridge-holdings-grid">
              {(holdings?.tokens ?? []).map((token) => (
                <HoldingTile
                  key={token.symbol}
                  token={token}
                  usd={displayUsd(token, prices)}
                  lockAddress={lockAddress}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
