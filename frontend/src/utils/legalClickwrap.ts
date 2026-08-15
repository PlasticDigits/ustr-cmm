/**
 * CL8Y Legal clickwrap helpers (#12).
 *
 * Invariants:
 * - SDK only: do not implement ADR-036 verify or POST /signatures/wallet here.
 * - Production property is ust1cmm.com (browser Origin). Staging override: VITE_LEGAL_PROPERTY.
 * - Network is always TerraClassic. Never EVM / Solana / Telegram on this dapp.
 * - redirect_uri is sanitized + allowlisted. Prod builds must not send localhost.
 * - Do not cache signed_latest in localStorage. Do not treat API outage as signed.
 * - VITE_PLAYWRIGHT_E2E=true may skip the gate for automation only — unset on ust1cmm.com.
 */

import { createClient, sanitizeRedirectUri, type ClickwrapClient } from '@plasticdigits/cl8y-clickwrap';
import { LEGAL_CLICKWRAP } from './constants';

let client: ClickwrapClient | null = null;

export function getLegalClickwrapClient(): ClickwrapClient {
  if (!client) {
    client = createClient({
      apiBaseUrl: LEGAL_CLICKWRAP.termsApi,
      termsBaseUrl: LEGAL_CLICKWRAP.termsPortal,
    });
  }
  return client;
}

export function getLegalProperty(): string {
  const override = import.meta.env.VITE_LEGAL_PROPERTY;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return LEGAL_CLICKWRAP.defaultProperty;
}

export function getLegalRedirectAllowlist(): string[] {
  return [...LEGAL_CLICKWRAP.redirectAllowlist];
}

export function skipLegalClickwrapForAutomation(): boolean {
  return import.meta.env.VITE_PLAYWRIGHT_E2E === 'true';
}

export function resolveLegalRedirectUri(
  href: string | null | undefined = typeof window !== 'undefined' ? window.location.href : null,
  isProd: boolean = import.meta.env.PROD
): string | null {
  return sanitizeRedirectUri(href, {
    allowlist: getLegalRedirectAllowlist(),
    allowLocalhost: !isProd,
  });
}

export function getLegalTermsContentUrl(property: string = getLegalProperty()): string {
  return `${LEGAL_CLICKWRAP.termsApi}/api/v1/terms/latest/content?property=${encodeURIComponent(property)}`;
}
