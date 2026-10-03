/**
 * BSC lock balances and columbus-5 Bridge-Debt.
 * Lock balances are not CMM assets. Outstanding Bridge-Debt is a liability.
 * The lock-versus-borrow line is only a coverage check.
 */

import { Card, CardContent } from '../common/Card';
import { TokenIcon } from '../common/TokenIcon';
import { usePrices } from '../../hooks/usePrices';
import type { BridgeDebtMarket, BridgeDebtSnapshot, BridgeHoldings, BridgeTokenHolding } from '../../types/bridge';
import { BRIDGE, DEFAULT_NETWORK, NETWORKS } from '../../utils/constants';
import { rawToWholeNumber } from '../../utils/decimals';
import { formatTreasuryCardAmount, formatTreasuryUsd, TREASURY_ASSETS_GRID_CLASS } from '../../utils/treasuryAssetDisplay';

interface BridgeHoldingsCardProps {
  holdings: BridgeHoldings | null;
  isLoading?: boolean;
  debts: BridgeDebtSnapshot | null;
  debtLoading?: boolean;
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

function debtRowId(symbol: string): string {
  const safe = symbol.replace(/[^A-Za-z0-9-]/g, '');
  return safe || 'unknown';
}

function debtWholeUsd(market: BridgeDebtMarket, prices: Record<string, number>): number | null {
  if (!market.agreed || market.outstandingRaw === null) return null;
  const unit = prices[market.underlyingSymbol];
  if (!(unit > 0)) return null;
  const whole = rawToWholeNumber(market.outstandingRaw, market.decimals);
  if (!Number.isFinite(whole) || whole < 0) return null;
  const usd = whole * unit;
  return Number.isFinite(usd) ? usd : null;
}

function coverageCopy(market: BridgeDebtMarket, holdings: BridgeHoldings | null): string {
  if (!market.agreed || market.outstandingRaw === null) {
    return 'Coverage check unavailable until the outstanding borrow is certified. Not counted in CMM asset ratios.';
  }
  const lock = holdings?.tokens.find((token) => token.symbol === market.underlyingSymbol);
  if (!holdings) {
    return 'Coverage check: BSC lock balance unavailable. Not counted in CMM asset ratios.';
  }
  if (!lock) {
    return `Coverage check: no BSC lock balance is tracked for ${market.underlyingSymbol}. Not counted in CMM asset ratios.`;
  }
  if (lock.balance === null) {
    return 'Coverage check: BSC lock balance unavailable. Not counted in CMM asset ratios.';
  }
  const lockAmount = formatTreasuryCardAmount(lock.balance, lock.decimals);
  const borrowAmount = formatTreasuryCardAmount(market.outstandingRaw, market.decimals);
  return `Coverage check only: BSC lock ${lockAmount} ${lock.symbol} against outstanding borrow ${borrowAmount} ${market.underlyingSymbol}. Not a CMM asset and not counted in CMM asset ratios.`;
}

function DebtRow({
  market,
  holdings,
  prices,
  scanner,
}: {
  market: BridgeDebtMarket;
  holdings: BridgeHoldings | null;
  prices: Record<string, number>;
  scanner: string;
}) {
  const usd = debtWholeUsd(market, prices);
  const showAmount = market.agreed && market.outstandingRaw !== null;
  const status = market.queryFailed || market.outstandingRaw === null
    ? 'Borrow unavailable'
    : !market.agreed
      ? 'Outstanding borrow is not certified, so it is omitted from ratios'
      : !market.debtorIsTreasury
        ? 'Debtor is not the CMM treasury. Ratios stay incomplete.'
        : null;
  const label = market.debtSymbol || `${market.underlyingSymbol || 'Bridge'} borrow`;

  return (
    <div
      data-testid={`bridge-debt-${debtRowId(market.underlyingSymbol)}`}
      className="flex flex-col gap-3 p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 min-w-0"
    >
      <div className="flex flex-col gap-3 min-w-0 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <TokenIcon symbol={market.underlyingSymbol || label} size="md" gradient="from-rose-500 to-red-600" />
          <div className="min-w-0">
            <span className="font-medium text-white break-words">{label}</span>
            <span data-testid="bridge-debt-kind" className="block text-[10px] text-rose-200/90 break-words">
              Outstanding borrow · liability, not a holding
            </span>
          </div>
        </div>
        <div className="min-w-0 w-full xl:w-auto xl:max-w-[58%] xl:text-right">
          {showAmount && market.outstandingRaw !== null ? (
            <>
              <div
                data-testid="bridge-debt-amount"
                className="text-sm sm:text-base xl:text-lg font-mono-numbers font-semibold text-rose-200 break-words"
              >
                {formatTreasuryCardAmount(market.outstandingRaw, market.decimals)}
              </div>
              {usd !== null && (
                <div data-testid="bridge-debt-usd" className="text-xs text-gray-400 break-words">
                  {formatTreasuryUsd(usd)} liability
                </div>
              )}
            </>
          ) : (
            <div data-testid="bridge-debt-amount" className="text-sm sm:text-base xl:text-lg font-mono-numbers font-semibold text-gray-500">
              —
            </div>
          )}
          {status && (
            <div data-testid="bridge-debt-error" className="text-[10px] text-amber-400/80 break-words">
              {status}
            </div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-gray-500 break-all">
        <div>
          Debtor{' '}
          <a
            href={`${scanner}/address/${market.debtor}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="bridge-debt-debtor"
            className="text-gray-400 hover:text-rose-200"
          >
            {market.debtor}
          </a>
        </div>
        <div>
          Receipt{' '}
          <a
            href={`${scanner}/address/${market.debtToken}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="bridge-debt-receipt"
            className="text-gray-400 hover:text-rose-200"
          >
            {market.debtToken}
          </a>
        </div>
      </div>
      <p data-testid="bridge-debt-coverage" className="text-[10px] text-gray-500 break-words">
        {coverageCopy(market, holdings)}
      </p>
    </div>
  );
}

export function BridgeHoldingsCard({
  holdings,
  isLoading = false,
  debts,
  debtLoading = false,
}: BridgeHoldingsCardProps) {
  const { prices } = usePrices();
  const lockAddress = holdings?.lockAddress ?? BRIDGE.lockAddress;
  const explorerUrl = `${BRIDGE.explorer}/address/${lockAddress}`;
  const scanner = NETWORKS[DEFAULT_NETWORK].scanner;
  const debtState = debtLoading || debts === null
    ? 'loading'
    : debts.markets === null
      ? 'unavailable'
      : 'ready';

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
            USDT and CL8Y held by the BSC lock/unlock address are not CMM assets and are not
            counted in CMM asset ratios. They back ordinary user bridge mints, which do not
            create Bridge-Debt. Outstanding Bridge-Debt is a CMM liability (the borrow), not
            a holding and not a treasury asset. The lock-versus-borrow line is only a coverage
            check and is not an input to Total CMM Assets or CR.
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

          <div data-testid="bridge-debts" data-state={debtState} className="mt-5 min-w-0">
            <h4 className="text-sm font-medium text-white mb-3">Outstanding borrows</h4>
            {debtState === 'loading' ? (
              <div className="h-24 rounded-xl bg-white/5 border border-white/5" />
            ) : debtState === 'unavailable' ? (
              <p data-testid="bridge-debt-unavailable" className="text-xs text-amber-400/80 break-words">
                Outstanding borrow unavailable. Ratios stay incomplete until the issuer outstanding
                and the debtor balance agree.
              </p>
            ) : debts?.markets?.length === 0 ? (
              <p className="text-xs text-gray-500">No Bridge-Debt markets are registered.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {(debts?.markets ?? []).map((market) => (
                  <DebtRow
                    key={market.underlying}
                    market={market}
                    holdings={holdings}
                    prices={prices}
                    scanner={scanner}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
