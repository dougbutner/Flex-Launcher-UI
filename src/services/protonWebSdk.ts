/**
 * XPR Network Web SDK loader — dynamic import of @proton/web-sdk + @proton/link.
 * @proton/link must load before ConnectWallet so mobile deep-link transport registers.
 * @see https://docs.xprnetwork.org/client-sdks/web.html
 */
import type { default as ConnectWalletType } from '@proton/web-sdk';

let connectWallet: typeof ConnectWalletType | null = null;
let sdkReady: Promise<void> | null = null;

export function ensureProtonWebSdk(): Promise<typeof ConnectWalletType> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('XPR Network Web SDK is only available in the browser'));
  }

  if (!sdkReady) {
    sdkReady = Promise.all([
      import('@proton/web-sdk').then((mod) => {
        connectWallet = mod.default;
      }),
      import('@proton/link'),
    ]).then(() => {});
  }

  return sdkReady.then(() => {
    if (!connectWallet) {
      throw new Error('Failed to load XPR Network Web SDK');
    }
    return connectWallet;
  });
}

/** Warm the SDK after first paint (optional; connect paths also await ensureProtonWebSdk). */
export function preloadProtonWebSdk(): void {
  if (typeof window === 'undefined') return;
  void ensureProtonWebSdk();
}
