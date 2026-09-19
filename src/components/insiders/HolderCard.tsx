import { useEffect, useState } from "react";
import { Amount } from "@/components/Amount";
import { TokenGlyph } from "@/components/TokenGlyph";
import { explorerAccount } from "@/config/launch";
import { readProtonProfile } from "@/services/protonProfile";
import type { ClubMark } from "@/services/insidersClub";

export function HoldingChip({
  contract,
  symbol,
  amount,
  onOpen,
}: {
  contract: string;
  symbol: string;
  amount: number;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="holding-chip" onClick={onOpen}>
      <TokenGlyph contract={contract} symbol={symbol} size={22} />
      <span className="holding-chip__amt">
        <Amount value={amount} />
        <span className="holding-chip__lbl">held</span>
      </span>
    </button>
  );
}

export function HolderProfile({
  account,
  contract,
  symbol,
  amount,
  clubMark,
  onClose,
}: {
  account: string;
  contract: string;
  symbol: string;
  amount: number;
  clubMark: ClubMark | null;
  onClose: () => void;
}) {
  const [src, setSrc] = useState("");
  const [label, setLabel] = useState(account);
  const letter = (account || "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    let live = true;
    void readProtonProfile(account).then((p) => {
      if (!live) return;
      setSrc(p?.avatar || "");
      setLabel(p?.name?.trim() || account);
    });
    return () => {
      live = false;
    };
  }, [account]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="holder-sheet" role="dialog" aria-modal="true" aria-labelledby="holder-sheet-title">
      <div className="holder-sheet__inner">
        <div className="flex items-start justify-between gap-3">
          <h2 id="holder-sheet-title" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Profile
          </h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-8 flex flex-col items-center text-center">
          {src ? (
            <img src={src} alt="" className="holder-sheet__avatar" />
          ) : (
            <span className="holder-sheet__avatar holder-sheet__fallback">{letter}</span>
          )}
          <div className="mt-4 text-2xl font-black tracking-tight">{label}</div>
          <a
            href={explorerAccount(account)}
            target="_blank"
            rel="noopener noreferrer"
            className="link mt-1 font-mono text-sm"
          >
            {account}
          </a>
          {clubMark ? (
            <span className="insiders-club-badge mt-3">{clubMark === "proven" ? "proven" : "insider"}</span>
          ) : null}
          <div className="mt-8 w-full max-w-sm rounded-xl border border-border bg-secondary/30 p-4">
            <TokenGlyph contract={contract} symbol={symbol} size={40} className="justify-center" />
            <div className="mt-2 font-mono text-2xl font-black">
              <Amount value={amount} />
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">spot held</div>
          </div>
        </div>
      </div>
    </div>
  );
}
