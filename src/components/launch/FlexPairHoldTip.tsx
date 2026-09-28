import { useEffect, useState } from "react";
import {
  EASY_SYMBOL,
  MON3Y,
  easyHoldFlexAltTip,
  easyHoldFull,
  easyHoldNeed,
  flexAccount,
  flexMeta,
  type FlexProgram,
} from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { assetAmountNumber } from "@/services/assets";
import { readAccounts } from "@/services/flexTables";
import { readProtonVerified } from "@/services/protonProfile";
import { countIssuerLaunched } from "@/services/preflight";

export function useEasyHoldStanding(program: FlexProgram) {
  const { actor } = useWallet();
  const [tip, setTip] = useState<string | null>(null);
  const [fullNeed, setFullNeed] = useState<number | null>(null);
  const [flexNeed, setFlexNeed] = useState<number | null>(null);
  const [prior, setPrior] = useState<number | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!actor) {
      setTip(null);
      setFullNeed(null);
      setFlexNeed(null);
      setPrior(null);
      setVerified(null);
      return;
    }
    let cancel = false;
    const code = flexAccount(program);
    const base = flexMeta(program).launchEasyMin;
    void Promise.all([
      readAccounts(MON3Y, actor, EASY_SYMBOL).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      countIssuerLaunched(code, actor),
      readProtonVerified(actor),
    ]).then(([easyAcct, prior, isVerified]) => {
      if (cancel) return;
      const row = easyAcct.rows[0];
      const easyBal = assetAmountNumber(String(row?.balance ?? "0"));
      const full = easyHoldFull(base, prior);
      const flex = easyHoldNeed(base, prior, Date.now(), true);
      setFullNeed(full);
      setFlexNeed(flex);
      setPrior(prior);
      setVerified(isVerified);
      setTip(easyHoldFlexAltTip({ easyBal, fullNeed: full, flexNeed: flex }));
    });
    return () => {
      cancel = true;
    };
  }, [actor, program]);

  return { tip, fullNeed, flexNeed, prior, verified };
}

/** Small line when this wallet is short of the full (non-flex) EASY hold. */
export function FlexPairHoldTip({ program }: { program: FlexProgram }) {
  const { tip } = useEasyHoldStanding(program);
  if (!tip) return null;
  return <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{tip}</p>;
}
