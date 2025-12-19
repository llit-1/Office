interface ImportMetaEnv {
  readonly VITE_DEV: string;
  readonly VITE_DEV_HOST: string;
  readonly VITE_VERSION: string;
  /** Base API url for axios instance (e.g. https://api.example.com) */
  readonly VITE_API_URL?: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  