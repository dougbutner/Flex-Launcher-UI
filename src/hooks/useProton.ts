/**
 * useProton - WebAuth / mobile (XPR Network Web SDK) + Anchor (WharfKit), multi-account, one active signer.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { LoadedWallet } from '@/services/walletSessions';
import {
  restoreAllWallets,
  connectNewWebAuthWallet,
  connectNewAnchorWallet,
  disconnectWallet,
  disconnectAllWallets,
  transactWithWallet,
  walletActor,
} from '@/services/walletSessions';
import { getActiveWalletId, setActiveWalletId } from '@/services/walletManifest';
import { rainTargets, reportChainTx } from '@/services/chainTxReport';
import { siteStatus } from '@/services/readThrough';
import { bindSiteSandboxActor } from '@/services/siteSandbox';

export function useProton() {
  const [wallets, setWallets] = useState<LoadedWallet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => getActiveWalletId());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    restoreAllWallets()
      .then((list) => {
        if (cancelled) return;
        setWallets(list);
        const stored = getActiveWalletId();
        const validStored = stored && list.some((w) => w.id === stored);
        const next = validStored ? stored : list[0]?.id ?? null;
        setActiveId(next);
        setActiveWalletId(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeId) ?? null,
    [wallets, activeId]
  );

  const setActive = useCallback(
    (id: string) => {
      if (!wallets.some((w) => w.id === id)) return;
      setActiveId(id);
      setActiveWalletId(id);
    },
    [wallets]
  );

  const addWebAuthWallet = useCallback(async () => {
    const w = await connectNewWebAuthWallet();
    if (!w) return null;
    setWallets((prev) => [...prev, w]);
    setActiveId(w.id);
    setActiveWalletId(w.id);
    return w;
  }, []);

  const addAnchorWallet = useCallback(async () => {
    const w = await connectNewAnchorWallet();
    if (!w) return null;
    setWallets((prev) => [...prev, w]);
    setActiveId(w.id);
    setActiveWalletId(w.id);
    return w;
  }, []);

  const removeWallet = useCallback(
    async (id: string) => {
      const w = wallets.find((x) => x.id === id);
      if (!w) return;
      await disconnectWallet(w);
      const next = wallets.filter((x) => x.id !== id);
      setWallets(next);
      if (activeId === id) {
        const na = next[0]?.id ?? null;
        setActiveId(na);
        setActiveWalletId(na);
      }
    },
    [wallets, activeId]
  );

  const disconnectAll = useCallback(async () => {
    await disconnectAllWallets(wallets);
    setWallets([]);
    setActiveId(null);
  }, [wallets]);

  const handleTransact = useCallback(
    async (
      actions: Array<{
        account: string;
        name: string;
        data: Record<string, unknown>;
        authorization?: Array<{ actor: string; permission: string }>;
      }>
    ) => {
      if (!activeWallet) throw new Error('Not logged in');
      const result = await transactWithWallet(activeWallet, actions);
      const who = walletActor(activeWallet);
      try {
        await reportChainTx(who, actions, result);
      } catch {
        /* a missed log must not fail a signed transaction */
      }
      const rains = rainTargets(actions);
      if (rains.length) {
        try {
          const site = await siteStatus();
          if (site.live && site.db) {
            const { loadDrylands } = await import('@/services/rainBoard');
            await loadDrylands({ force: true });
            const { loadTokenPublic } = await import('@/services/tokenSnapshot');
            for (const row of rains) {
              if (!row.symbol) continue;
              await loadTokenPublic(row.contract, row.symbol, { force: true });
            }
          }
        } catch {
          /* the page still reloads its own row */
        }
      }
      return result;
    },
    [activeWallet]
  );

  const actor = activeWallet ? walletActor(activeWallet) : null;

  useEffect(() => {
    if (loading) return;
    bindSiteSandboxActor(actor);
  }, [loading, actor]);

  return {
    wallets,
    activeWallet,
    activeId,
    actor,
    loading,
    setActive,
    addWebAuthWallet,
    addAnchorWallet,
    removeWallet,
    disconnectAll,
    transact: handleTransact,
    isLoggedIn: wallets.length > 0,
    login: async () => addWebAuthWallet(),
    logout: async () => {
      if (activeWallet) await removeWallet(activeWallet.id);
    },
  };
}
