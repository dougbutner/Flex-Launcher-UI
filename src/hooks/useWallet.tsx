import { createContext, useContext, type ReactNode } from "react";
import { useProton } from "@/hooks/useProton";

type WalletCtx = ReturnType<typeof useProton>;

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useProton();
  return <Ctx.Provider value={wallet}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
