/**
 * Defense-in-depth Legal status for execute paths (#12).
 * Shell ConnectedTermsGate is primary; this must not treat outage as signed.
 */

import { useSignatureStatus } from '@plasticdigits/cl8y-clickwrap/react';
import { useWallet } from './useWallet';
import { LEGAL_CLICKWRAP } from '../utils/constants';
import {
  getLegalClickwrapClient,
  getLegalProperty,
  skipLegalClickwrapForAutomation,
} from '../utils/legalClickwrap';

export function useLegalAcceptance(): {
  allowed: boolean;
  loading: boolean;
  error: Error | null;
} {
  const { address } = useWallet();
  const skip = skipLegalClickwrapForAutomation();
  const { isSigned, loading, error } = useSignatureStatus({
    client: getLegalClickwrapClient(),
    property: getLegalProperty(),
    network: LEGAL_CLICKWRAP.network,
    account: skip ? null : address,
  });

  if (skip) {
    return { allowed: true, loading: false, error: null };
  }
  if (!address) {
    return { allowed: false, loading: false, error: null };
  }
  return { allowed: isSigned === true, loading, error };
}

export function assertLegalAccepted(allowed: boolean, loading: boolean): void {
  if (skipLegalClickwrapForAutomation()) return;
  if (loading) {
    throw new Error('Legal terms status is still loading');
  }
  if (!allowed) {
    throw new Error('Legal terms must be accepted before this action');
  }
}
