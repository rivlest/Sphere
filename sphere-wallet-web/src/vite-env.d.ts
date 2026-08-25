/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPHERE_NODE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
