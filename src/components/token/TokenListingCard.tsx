import { useEffect, useState } from "react";
import { ListingPacket } from "@/components/token/ListingPacket";
import { isFlexContractActor } from "@/config/launch";
import { draftFromSources, emptyListingDraft, type ListingDraft } from "@/services/listingHelper";
import { listManagerTokens } from "@/services/managerApi";
import type { ChainAction } from "@/services/launchActions";
import {
  findProtonTokenRow,
  tokenProtonLogoAction,
  type ProtonTokenRow,
} from "@/services/tokenProton";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

type Props = {
  contract: string;
  symbol: string;
  precision: number;
  actor: string;
  transact: (actions: ChainAction[]) => Promise<unknown>;
};

export function TokenListingCard({ contract, symbol, precision, actor, transact }: Props) {
  const canSign = isFlexContractActor(actor) && actor === contract;
  const [draft, setDraft] = useState<ListingDraft>(() => emptyListingDraft(symbol));
  const [row, setRow] = useState<ProtonTokenRow | null>(null);
  const [signing, setSigning] = useState(false);
  const [msg, setMsg] = useState<{ tx?: string; err?: string }>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [proton, stored] = await Promise.all([
        findProtonTokenRow(contract, precision, symbol),
        listManagerTokens(canSign ? { contract } : { issuer: actor }).catch(() => []),
      ]);
      if (cancelled) return;
      const sq = stored.find((s) => s.symbol === symbol && s.contract === contract) ?? null;
      setRow(proton);
      setDraft(draftFromSources({ symbol, proton, stored: sq }));
    })();
    return () => {
      cancelled = true;
    };
  }, [actor, canSign, contract, precision, symbol]);

  const sign = async () => {
    if (!canSign) return;
    setSigning(true);
    setMsg({});
    try {
      const result = await transact([
        tokenProtonLogoAction({
          row,
          tcontract: contract,
          tname: draft.tname.trim() || symbol,
          url: draft.url.trim(),
          desc: draft.desc.trim(),
          iconurl: draft.iconurl.trim(),
          precision,
          symbol,
        }),
      ]);
      setMsg({ tx: txIdFromResult(result) || "ok" });
      const next = await findProtonTokenRow(contract, precision, symbol);
      setRow(next);
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg({ err: hint ? `${text} - ${hint}` : text });
    } finally {
      setSigning(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-bold tracking-tight">Wallet listing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          token.proton::reg is signed by {contract}@active, not the issuer. Alcor logos are a 64x64 PNG pull request.
        </p>
      </div>
      <ListingPacket
        contract={contract}
        symbol={symbol}
        precision={precision}
        draft={draft}
        onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
        protonOn={Boolean(row)}
        canSign={canSign}
        missing={!row}
        signing={signing}
        onSign={canSign ? () => void sign() : undefined}
        msg={msg}
        signHint={
          canSign
            ? undefined
            : `Save name and icon in Manager. Contract admin signs token.proton on /admin or here when logged in as ${contract}.`
        }
      />
    </section>
  );
}
