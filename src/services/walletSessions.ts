/**
 * WebAuth / WebAuth mobile: @proton/web-sdk (XPR Network Web SDK).
 * Anchor: WharfKit SessionKit (default WebRenderer).
 */
import type { Session } from '@wharfkit/session';
import type { ProtonSession } from './proton';
import { transact as protonTransact } from './proton';
import { ensureProtonWebSdk } from './protonWebSdk';
import {
  APP_NAME,
  APP_LOGO,
  REQUEST_ACCOUNT,
  CHAIN_ENDPOINTS,
  XPR_CHAIN_ID_HEX,
} from './walletConstants';
import {
  loadManifest,
  saveManifest,
  setActiveWalletId,
  type WalletManifestEntry,
  PrefixLinkStorage,
  migrateLegacyManifestIfNeeded,
  stripProtonAnchorFromManifest,
  clearAllKeysForPrefix,
} from './walletManifest';
import {
  loginAnchor,
  logoutAllWharfSessions,
  logoutAnchorSession,
  restoreAllAnchorSessions,
  stableAnchorWalletId,
  transactAnchor,
} from './wharfSessionKit';

/** Mobile app (`proton`) + browser wallet (`webauth`). Anchor uses WharfKit separately. */
const WEBAUTH_ENABLED_WALLETS = ['proton', 'webauth'] as const;

export type LoadedWebAuthWallet = WalletManifestEntry &
  ProtonSession & {
    provider: 'webauth';
    id: string;
  };

export type LoadedAnchorWallet = {
  provider: 'anchor';
  id: string;
  session: Session;
  actor: string;
  permission: string;
  chainId: string;
  walletType: 'anchor';
};

export type LoadedWallet = LoadedWebAuthWallet | LoadedAnchorWallet;

export function walletActor(w: LoadedWallet): string {
  return w.provider === 'webauth' ? w.auth.actor : w.actor;
}

export function walletTypeLabel(w: LoadedWallet): string {
  if (w.provider === 'anchor' || w.walletType === 'anchor') return 'Anchor Wallet';
  if (w.walletType === 'proton') return 'WebAuth (mobile app)';
  return 'WebAuth (browser)';
}

async function connectWebAuthWallet(options: {
  storage: PrefixLinkStorage;
  restoreSession: boolean;
}): Promise<ProtonSession | null> {
  const ConnectWallet = await ensureProtonWebSdk();

  const res = await ConnectWallet({
    linkOptions: {
      chainId: XPR_CHAIN_ID_HEX,
      endpoints: CHAIN_ENDPOINTS,
      storage: options.storage,
      restoreSession: options.restoreSession,
    },
    transportOptions: {
      requestAccount: REQUEST_ACCOUNT,
    },
    selectorOptions: options.restoreSession
      ? { appName: APP_NAME, appLogo: APP_LOGO }
      : {
          appName: APP_NAME,
          appLogo: APP_LOGO,
          enabledWalletTypes: [...WEBAUTH_ENABLED_WALLETS],
        },
  });

  if (res?.error) {
    console.error('ConnectWallet error:', res.error);
    return null;
  }
  if (!res?.session || !res.link) return null;

  return {
    auth: {
      actor: String(res.session.auth.actor),
      permission: String(res.session.auth.permission),
    },
    link: res.link,
    session: res.session,
  };
}

function toLoadedWebAuth(entry: WalletManifestEntry, session: ProtonSession): LoadedWebAuthWallet {
  return {
    ...entry,
    ...session,
    provider: 'webauth',
    id: entry.id,
  };
}

function toLoadedAnchor(session: Session): LoadedAnchorWallet {
  return {
    provider: 'anchor',
    id: stableAnchorWalletId(session),
    session,
    actor: String(session.actor),
    permission: String(session.permission),
    chainId: String(session.chain.id),
    walletType: 'anchor',
  };
}

/** Run migrations, restore WebAuth + Anchor, return combined list. */
export async function restoreAllWallets(): Promise<LoadedWallet[]> {
  stripProtonAnchorFromManifest();
  migrateLegacyManifestIfNeeded();

  const manifest = loadManifest();
  const webAuthLoaded: LoadedWebAuthWallet[] = [];
  const updatedManifest: WalletManifestEntry[] = [];

  for (const entry of manifest) {
    const storage = new PrefixLinkStorage(entry.storagePrefix);
    const session = await connectWebAuthWallet({ storage, restoreSession: true });
    if (!session) continue;

    const walletType = (await storage.read('wallet-type')) ?? entry.walletType;
    const chainId = String(session.session?.chainId ?? '');
    const next: WalletManifestEntry = {
      ...entry,
      provider: 'webauth',
      actor: session.auth.actor,
      permission: session.auth.permission,
      chainId,
      walletType: walletType || entry.walletType || 'webauth',
    };
    updatedManifest.push(next);
    webAuthLoaded.push(toLoadedWebAuth(next, session));
  }

  saveManifest(updatedManifest);

  const anchorSessions = await restoreAllAnchorSessions();
  const anchorLoaded = anchorSessions.map(toLoadedAnchor);

  return [...webAuthLoaded, ...anchorLoaded];
}

export async function connectNewWebAuthWallet(): Promise<LoadedWebAuthWallet | null> {
  const id = crypto.randomUUID();
  const storagePrefix = `xpr-forge-${id}`;
  const storage = new PrefixLinkStorage(storagePrefix);
  const session = await connectWebAuthWallet({ storage, restoreSession: false });
  if (!session) return null;

  const walletType = (await storage.read('wallet-type')) ?? 'webauth';
  const chainId = String(session.session?.chainId ?? '');
  const entry: WalletManifestEntry = {
    id,
    storagePrefix,
    actor: session.auth.actor,
    permission: session.auth.permission,
    chainId,
    walletType: walletType || 'webauth',
    provider: 'webauth',
  };
  const manifest = loadManifest();
  manifest.push(entry);
  saveManifest(manifest);
  return toLoadedWebAuth(entry, session);
}

export async function connectNewAnchorWallet(): Promise<LoadedAnchorWallet | null> {
  const session = await loginAnchor();
  if (!session) return null;
  return toLoadedAnchor(session);
}

export async function disconnectWallet(wallet: LoadedWallet): Promise<void> {
  if (wallet.provider === 'webauth') {
    try {
      await wallet.link.removeSession(REQUEST_ACCOUNT, wallet.session.auth, wallet.session.chainId);
    } catch (err) {
      console.error('removeSession failed:', err);
    }
    const next = loadManifest().filter((e) => e.id !== wallet.id);
    saveManifest(next);
    clearAllKeysForPrefix(wallet.storagePrefix);
  } else {
    await logoutAnchorSession(wallet.session);
  }
}

export async function disconnectAllWallets(wallets: LoadedWallet[]): Promise<void> {
  for (const w of wallets) {
    if (w.provider === 'webauth') {
      try {
        await w.link.removeSession(REQUEST_ACCOUNT, w.session.auth, w.session.chainId);
      } catch (err) {
        console.error('removeSession failed:', err);
      }
      clearAllKeysForPrefix(w.storagePrefix);
    }
  }
  saveManifest([]);
  await logoutAllWharfSessions();
  setActiveWalletId(null);
}

export async function transactWithWallet(
  wallet: LoadedWallet,
  actions: Array<{
    account: string;
    name: string;
    data: Record<string, unknown>;
    authorization?: Array<{ actor: string; permission: string }>;
  }>
) {
  if (wallet.provider === 'webauth') {
    return protonTransact(wallet, actions);
  }
  return transactAnchor(wallet.session, actions);
}
