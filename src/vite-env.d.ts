/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FLEXFOREX_CONTRACT?: string;
  readonly VITE_EASYFLEX?: string;
  readonly VITE_COMPLEXFLEX?: string;
  readonly VITE_SWAP_ALCOR?: string;
  readonly VITE_GIPHY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
