/**
 * Vite build-time environment. Declared here so the shared source can read
 * `import.meta.env.BASE_URL` without pulling in `vite/client` globally.
 */
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
