import { useEffect, useState } from "react";
import { ListingPacket } from "@/components/token/ListingPacket";
import { isFlexContractActor, programFromAccount } from "@/config/launch";
import { draftFromSources, emptyListingDraft, type ListingDraft } from "@/services/listingHelper";
import { listManagerTokens } from "@/services/managerApi";
import type { ChainAction } from "@/services/launchActions";
import {
  findProtonTokenRow,
  loadProtonTokenTable,
  tokenProtonLogoAction,
  tokenProtonRemoveAction,
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
  const asContract = isFlexContractActor(actor) && actor === contract;
  const program = programFromAccount(contract);
  const [draft, setDraft] = useState<ListingDraft>(() => emptyListingDraft(symbol));
  const [row, setRow] = useState<ProtonTokenRow | null>(null);
  const [signing, setSigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState<{ tx?: string; err?: string }>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [proton, stored] = await Promise.all([
        findProtonTokenRow(contract, precision, symbol),
        listManagerTokens(asContract ? { contract } : { issuer: actor }).catch(() => []),
      ]);
      if (cancelled) return;
      const sq = stored.find((s) => s.symbol === symbol && s.contract === contract) ?? null;
      setRow(proton);
      setDraft(draftFromSources({ symbol, proton, stored: sq }));
    })();
    return () => {
      cancelled = true;
    };
  }, [actor, asContract, contract, precision, symbol]);

  const sign = async () => {
    if (!asContract) return;
    setSigning(true);
    setMsg({});
    try {
      const live = await findProtonTokenRow(contract, precision, symbol, true);
      const result = await transact([
        tokenProtonLogoAction({
          row: live,
          tcontract: contract,
          tname: draft.tname.trim() || symbol,
          url: draft.url.trim(),
          desc: draft.desc.trim(),
          iconurl: draft.iconurl.trim(),
          precision,
          symbol,
          signer: actor,
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

  const remove = async () => {
    if (!asContract) return;
    setRemoving(true);
    setMsg({});
    try {
      const live = (await findProtonTokenRow(contract, precision, symbol, true)) ?? row;
      if (!live) throw new Error("This token is not on token.proton.");
      const result = await transact([tokenProtonRemoveAction({ id: live.id, signer: actor })]);
      setMsg({ tx: txIdFromResult(result) || "ok" });
      await loadProtonTokenTable(true);
      setRow(null);
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg({ err: hint ? `${text} - ${hint}` : text });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-bold tracking-tight">Wallet and Alcor listing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Wallets read token.proton, which {contract}@active has to sign. Ask in Telegram to add the logo. Alcor logos
          are a pull request from your fork, not a commit to Alcor's GitHub.
        </p>
      </div>
      <ListingPacket
        contract={contract}
        symbol={symbol}
        precision={precision}
        program={program}
        draft={draft}
        onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
        protonOn={Boolean(row)}
        canSign={asContract}
        missing={!row}
        signing={signing}
        removing={removing}
        onSign={asContract ? () => void sign() : undefined}
        onRemove={asContract && row ? () => void remove() : undefined}
        msg={msg}
      />
    </section>
  );
}
