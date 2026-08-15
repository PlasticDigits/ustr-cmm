/**
 * ConnectedTermsGate
 *
 * Disconnected users keep browse access (Home / Treasury / Dashboard / Referral).
 * After connect, TermsGate fail-closes until signed_latest. Header/Footer stay mounted.
 *
 * Legal acceptance is off-chain evidence — treasury/swap contracts do not check T&Cs.
 */

import { useEffect, useState } from 'react';
import { buildSignUrl, type TermsLatest } from '@plasticdigits/cl8y-clickwrap';
import { TermsGate } from '@plasticdigits/cl8y-clickwrap/react';
import { useWallet } from '../../hooks/useWallet';
import { Card, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { LEGAL_CLICKWRAP } from '../../utils/constants';
import {
  getLegalClickwrapClient,
  getLegalProperty,
  getLegalTermsContentUrl,
  resolveLegalRedirectUri,
  skipLegalClickwrapForAutomation,
} from '../../utils/legalClickwrap';

interface ConnectedTermsGateProps {
  children: React.ReactNode;
}

function UnsignedTermsPanel() {
  const client = getLegalClickwrapClient();
  const property = getLegalProperty();
  const [terms, setTerms] = useState<TermsLatest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .getTermsLatest(property)
      .then((latest) => {
        if (!cancelled) setTerms(latest);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load terms');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, property]);

  const handleAccept = () => {
    if (!terms?.sign_urls?.terra_classic) return;
    const url = buildSignUrl(terms.sign_urls.terra_classic, {
      redirectUri: resolveLegalRedirectUri() ?? undefined,
      appName: LEGAL_CLICKWRAP.appName,
    });
    window.location.href = url;
  };

  return (
    <Card variant="highlight" className="max-w-xl mx-auto">
      <CardContent>
        <h3 className="text-xl font-semibold text-white mb-2">Accept Terms &amp; Conditions</h3>
        <p className="text-sm text-gray-300 mb-4">
          Connected wallets must accept the latest CL8Y ecosystem terms for{' '}
          <span className="font-mono text-amber-300">{property}</span> before swap or referral
          registration. Signing happens on the Legal portal — this site only checks status.
        </p>
        {terms && (
          <p className="text-xs text-gray-400 mb-4">
            Version {terms.version_label}
            {terms.effective_date ? ` · effective ${terms.effective_date}` : ''}
          </p>
        )}
        {loadError && (
          <p role="alert" className="text-sm text-red-400 mb-4">
            Unable to load terms: {loadError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={getLegalTermsContentUrl(property)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            Read full terms
          </a>
          <Button type="button" onClick={handleAccept} disabled={!terms?.sign_urls?.terra_classic}>
            Accept Terms
          </Button>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Legal acceptance is off-chain evidence. Treasury and swap contracts do not enforce T&amp;Cs.
        </p>
      </CardContent>
    </Card>
  );
}

function TermsFallback({ message }: { message: string }) {
  return (
    <Card className="max-w-xl mx-auto">
      <CardContent>
        <p className="text-sm text-gray-300">{message}</p>
      </CardContent>
    </Card>
  );
}

export function ConnectedTermsGate({ children }: ConnectedTermsGateProps) {
  const { address } = useWallet();

  if (!address || skipLegalClickwrapForAutomation()) {
    return <>{children}</>;
  }

  return (
    <div className="ustr-connected-terms-gate">
      <TermsGate
        client={getLegalClickwrapClient()}
        property={getLegalProperty()}
        network={LEGAL_CLICKWRAP.network}
        account={address}
        redirectUri={resolveLegalRedirectUri() ?? undefined}
        appName={LEGAL_CLICKWRAP.appName}
        fallback={<TermsFallback message="Checking terms acceptance…" />}
        unsigned={<UnsignedTermsPanel />}
      >
        {children}
      </TermsGate>
    </div>
  );
}
