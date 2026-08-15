/// <reference types="vite/client" />

/**
 * Type declarations for Vite environment variables
 * 
 * All environment variables must be prefixed with VITE_ to be exposed to the frontend.
 * Access via import.meta.env.VITE_VARIABLE_NAME
 */
interface ImportMetaEnv {
  /** 
   * Dev mode flag - when 'true', bypasses countdown timer and simulates
   * post-launch state for UX testing. Only use in development.
   */
  readonly VITE_DEV_MODE: string;
  /** Staging Legal property override. Production default is ust1cmm.com. */
  readonly VITE_LEGAL_PROPERTY: string;
  /**
   * When 'true', skip ConnectedTermsGate for Playwright. Must be unset on
   * ust1cmm.com / Coolify production builds.
   */
  readonly VITE_PLAYWRIGHT_E2E: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
