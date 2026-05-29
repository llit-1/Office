interface ImportMetaEnv {
  readonly VITE_DEV: string;
  readonly VITE_DEV_HOST: string;
  readonly VITE_PROD_API_URL?: string;
  readonly VITE_VERSION: string;
  /** Optional direct API override for uncommon environments. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
