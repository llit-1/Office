interface ImportMetaEnv {
    readonly VITE_DEV: string;
    readonly VITE_DEV_HOST: string;
    readonly VITE_VERSION: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  