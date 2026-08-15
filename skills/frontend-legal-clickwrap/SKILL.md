---
name: frontend-legal-clickwrap
description: >-
  CL8Y Legal clickwrap for connected Terra Classic wallets on ust1cmm.com
  (GitLab #12). Use when changing ConnectedTermsGate, legalClickwrap.ts,
  Footer Terms, or VITE_LEGAL_* / VITE_PLAYWRIGHT_E2E env.
---

# Frontend CL8Y Legal clickwrap (#12)

Companion: [#12](https://gitlab.com/PlasticDigits2/ustr-cmm/-/issues/12). SDK: [`@plasticdigits/cl8y-clickwrap`](https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/tree/main/packages/cl8y-clickwrap) (GitLab npm project **82547916**).

Cross-links: [frontend/src/utils/legalClickwrap.ts](../../frontend/src/utils/legalClickwrap.ts), [frontend/src/components/legal/ConnectedTermsGate.tsx](../../frontend/src/components/legal/ConnectedTermsGate.tsx), [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

## Why this exists

Acceptances are **per hostname**. A signature on `cl8y.com` / `dex.cl8y.com` is not evidence for `ust1cmm.com`. Signing is on `https://terms.cl8y.com`; this app only checks status and redirects.

## Invariants (must hold)

1. **SDK only.** `createClient` / `TermsGate` / `useSignatureStatus` / `sanitizeRedirectUri`. Do **not** implement ADR-036 `signArbitrary` or POST `/signatures/wallet` in this repo.
2. **Property** = `ust1cmm.com` (override only via `VITE_LEGAL_PROPERTY` for staging).
3. **Network** = `TerraClassic` always (API `TERRA_CLASSIC`).
4. **Disconnected browse stays open.** Do not mount raw `TermsGate` as the app root (empty account hides children).
5. **Fail closed after connect.** Loading / error / `signed_latest !== true` → no swap/register execute. API outage ≠ signed. No durable `signed_latest` localStorage cache.
6. **Redirect safety.** `sanitizeRedirectUri` + allowlist `https://ust1cmm.com`. Prod: `allowLocalhost: false`. No iframe — full navigation to `sign_urls.terra_classic`.
7. **No Legal admin secrets.** Public `terms/latest` + `signatures/status` only. No `ADMIN_TOKEN` in `frontend/`.
8. **No tight poll.** SDK default is focus-only. Singleton client.
9. **E2E hatch:** `VITE_PLAYWRIGHT_E2E=true` may skip the gate. **Must be unset** on ust1cmm.com / Coolify production.
10. **Off-chain only.** Copy must not claim treasury/swap contracts check T&Cs. Header/wallet stay mounted so the user can disconnect.

## Ops (Legal platform — often a separate Coolify change)

```bash
# from cl8y-ecosystem-legal checkout
./scripts/register-property.sh ust1cmm.com "USTR CMM"
```

Add `https://ust1cmm.com` to Legal API `CORS_ORIGINS` and portal `VITE_REDIRECT_URI_ALLOWLIST`.

## Tests

```bash
cd frontend && npm test
```

Redirect allowlist + property default. Manual: connect unsigned wallet → accept panel → portal `property=ust1cmm.com`.
