/// <reference types="vite/client" />

/**
 * Strongly-typed env vars exposed to the browser bundle.
 * Vite only inlines vars prefixed with VITE_ — anything else is undefined at runtime.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Side-effect CSS imports (import "./index.css") need explicit module
 * declarations in TS 5.6+. Vite's reference above covers module CSS, but
 * plain `.css` side-effect imports require this block.
 */
declare module "*.css";
