/**
 * Persisted list of WebAuth connections only. Each entry uses a distinct storage prefix
 * so @proton/web-sdk keeps separate wallet-type / user-auth per account.
 * Anchor sessions are stored by WharfKit separately.
 */
import type { LinkStorage } from '@proton/link';

export const MANIFEST_KEY = 'xpr-forge-wallet-manifest';
export const ACTIVE_WALLET_ID_KEY = 'xpr-forge-active-wallet-id';
/** Default prefix used by older single-session @proton/web-sdk installs */
export const LEGACY_STORAGE_PREFIX = 'proton-storage';

export interface WalletManifestEntry {
  id: string;
  storagePrefix: string;
  actor: string;
  permission: string;
  chainId: string;
  /** Always `webauth` for rows in this manifest */
  walletType: string;
  provider: 'webauth';
}

/** Same key layout as @proton/web-sdk Storage */
export class PrefixLinkStorage implements LinkStorage {
  constructor(readonly keyPrefix: string) {}

  async write(key: string, data: string): Promise<void> {
    localStorage.setItem(this.storageKey(key), data);
  }

  async read(key: string): Promise<string | null> {
    return localStorage.getItem(this.storageKey(key));
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.storageKey(key));
  }

  storageKey(key: string): string {
    return `${this.keyPrefix}-${key}`;
  }
}

export function loadManifest(): WalletManifestEntry[] {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isManifestEntry).map((e) => ({
      ...e,
      provider: 'webauth' as const,
      walletType: e.walletType || 'webauth',
    }));
  } catch {
    return [];
  }
}

export function saveManifest(entries: WalletManifestEntry[]): void {
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries));
}

export function getActiveWalletId(): string | null {
  return localStorage.getItem(ACTIVE_WALLET_ID_KEY);
}

export function setActiveWalletId(id: string | null): void {
  if (id === null) localStorage.removeItem(ACTIVE_WALLET_ID_KEY);
  else localStorage.setItem(ACTIVE_WALLET_ID_KEY, id);
}

/**
 * Remove Proton-Link "anchor" rows (superseded by WharfKit). Clear their storage keys.
 * Reads raw JSON so anchor rows are not dropped before this runs.
 */
export function stripProtonAnchorFromManifest(): void {
  const raw = localStorage.getItem(MANIFEST_KEY);
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  const kept: unknown[] = [];
  let changed = false;
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const wt = typeof o.walletType === 'string' ? o.walletType.toLowerCase() : '';
    if (wt === 'anchor') {
      if (typeof o.storagePrefix === 'string') clearAllKeysForPrefix(o.storagePrefix);
      changed = true;
      continue;
    }
    kept.push(row);
  }
  if (changed) localStorage.setItem(MANIFEST_KEY, JSON.stringify(kept));
}

/** If manifest is empty but legacy proton-storage keys exist, seed one WebAuth entry. */
export function migrateLegacyManifestIfNeeded(): void {
  if (loadManifest().length > 0) return;
  const ua = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}-user-auth`);
  if (!ua) return;
  let actor = '';
  let permission = '';
  try {
    const auth = JSON.parse(ua) as { actor?: string; permission?: string };
    actor = auth.actor ?? '';
    permission = auth.permission ?? '';
  } catch {
    /* ignore */
  }
  const walletType = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}-wallet-type`) ?? 'webauth';
  if (walletType === 'anchor') {
    clearAllKeysForPrefix(LEGACY_STORAGE_PREFIX);
    return;
  }
  const id = crypto.randomUUID();
  saveManifest([
    {
      id,
      storagePrefix: LEGACY_STORAGE_PREFIX,
      actor,
      permission,
      chainId: '',
      walletType: 'webauth',
      provider: 'webauth',
    },
  ]);
}

export function clearAllKeysForPrefix(prefix: string): void {
  const suffix = `${prefix}-`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(suffix)) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

function isManifestEntry(x: unknown): x is Omit<WalletManifestEntry, 'provider'> & { provider?: string } {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const provider = o.provider;
  const walletType = typeof o.walletType === 'string' ? o.walletType.toLowerCase() : '';
  if (walletType === 'anchor') return false;
  if (provider !== undefined && provider !== 'webauth') return false;
  return (
    typeof o.id === 'string' &&
    typeof o.storagePrefix === 'string' &&
    typeof o.actor === 'string' &&
    typeof o.permission === 'string' &&
    typeof o.chainId === 'string' &&
    typeof o.walletType === 'string'
  );
}
