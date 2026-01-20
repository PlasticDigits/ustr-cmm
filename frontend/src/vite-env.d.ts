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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
