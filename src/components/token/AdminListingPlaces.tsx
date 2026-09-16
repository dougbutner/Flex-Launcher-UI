import type { ListingDraft } from "@/services/listingHelper";
import { listingSocials, type ListingGithubTarget } from "@/services/listingHelper";
import { png64FromImageUrl } from "@/services/listingLogo";
import { openListingPr, syncListingForks } from "@/services/listingPrApi";
import { airdropsLogoRawUrl, alcorLogoRawUrl, type ListingPlaceCheck } from "@/services/listingRepos";
import { applyRepoListing, repoListingStatus, type ManagerToken, type RepoListingKind } from "@/services/managerStore";
import { TokenIcon } from "@/components/TokenIcon";
import { txErrorMessage } from "@/services/txParse";

type Props = {
  actor: string;
  symbol: string;
  precision: number;
  draft: ListingDraft;
  stored: ManagerToken | null;
  protonIcon?: string;
  busy: boolean;
  onStored: (row: ManagerToken) => void;
  persist: (row: ManagerToken) => Promise<ManagerToken>;
  github: { alcor?: ListingPlaceCheck; airdrops?: ListingPlaceCheck };
  githubBusy: boolean;
  onCheckGithub: () => void;
  onError: (message: string) => void;
  onNote: (message: string) => void;
};

function label(status: ReturnType<typeof repoListingStatus>, check?: ListingPlaceCheck) {
  if (check?.listed) return "On upstream";
  if (status === "pr" || check?.prState === "open") return "PR sent";
  if (check?.prState === "merged") return "PR merged (waiting on upstream files)";
  if (status === "listed") return "Cached as listed";
  if (status === "missing") return "Not on upstream";
  return "Not checked";
}

export function AdminListingPlaces({
  actor,
  symbol,
  precision,
  draft,
  stored,
  protonIcon,
  busy,
  onStored,
  persist,
  github,
  githubBusy,
  onCheckGithub,
  onError,
  onNote,
}: Props) {
  const alcorStatus = repoListingStatus(stored, "alcor");
  const dropsStatus = repoListingStatus(stored, "airdrops");

  const saveRepo = async (kind: RepoListingKind, check: ListingPlaceCheck) => {
    const base = stored;
    if (!base) return;
    const saved = await persist(applyRepoListing(base, kind, check));
    onStored(saved);
  };

  const openPr = async (target: ListingGithubTarget) => {
    if (!stored) throw new Error("Check and store this token first.");
    let pngBase64: string | undefined;
    try {
      pngBase64 = await png64FromImageUrl(draft.iconurl.trim() || protonIcon || "");
    } catch {
      pngBase64 = undefined;
    }
    const result = await openListingPr({
      target,
      symbol,
      contract: actor,
      precision,
      name: draft.tname.trim() || symbol,
      website: draft.url.trim(),
      desc: draft.desc.trim(),
      socials: listingSocials(draft),
      iconurl: draft.iconurl.trim() || protonIcon || "",
      pngBase64,
    });
    const check: ListingPlaceCheck = {
      listed: result.state === "merged",
      logoUrl: target === "alcor-ui" ? alcorLogoRawUrl(symbol, actor) : airdropsLogoRawUrl(symbol, actor),
      logoOn: false,
      jsonOn: false,
      prUrl: result.url || "",
      prState: result.state || "open",
    };
    await saveRepo(target === "alcor-ui" ? "alcor" : "airdrops", check);
    onNote(result.already ? `PR already ${result.state || "open"}: ${result.url}` : `Opened PR: ${result.url}`);
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logos in three places</p>
      <div className="flex flex-wrap items-center gap-3">
        <figure className="text-center">
          <TokenIcon contract={actor} symbol={symbol} src={draft.iconurl} size={40} rounded="xl" />
          <figcaption className="mt-1 text-[10px] text-muted-foreground">Draft / IPFS</figcaption>
        </figure>
        <figure className="text-center">
          <TokenIcon contract={actor} symbol={symbol} src={protonIcon || draft.iconurl} size={40} rounded="xl" />
          <figcaption className="mt-1 text-[10px] text-muted-foreground">token.proton</figcaption>
        </figure>
        <figure className="text-center">
          <TokenIcon contract={actor} symbol={symbol} src={alcorLogoRawUrl(symbol, actor)} size={40} rounded="xl" />
          <figcaption className="mt-1 text-[10px] text-muted-foreground">alcor-ui</figcaption>
        </figure>
        <figure className="text-center">
          <TokenIcon contract={actor} symbol={symbol} src={airdropsLogoRawUrl(symbol, actor)} size={40} rounded="xl" />
          <figcaption className="mt-1 text-[10px] text-muted-foreground">eos-airdrops</figcaption>
        </figure>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>
          alcor-ui: {label(alcorStatus, github.alcor)}
          {github.alcor && !github.alcor.listed ? ` · logo ${github.alcor.logoOn ? "yes" : "no"} · proton.json ${github.alcor.jsonOn ? "yes" : "no"}` : ""}
          {stored?.alcorPrUrl ? (
            <>
              {" · "}
              <a href={stored.alcorPrUrl} target="_blank" rel="noopener noreferrer" className="link">
                PR
              </a>
            </>
          ) : null}
        </li>
        <li>
          eos-airdrops: {label(dropsStatus, github.airdrops)}
          {github.airdrops && !github.airdrops.listed ? ` · logo ${github.airdrops.logoOn ? "yes" : "no"} · tokens.json ${github.airdrops.jsonOn ? "yes" : "no"}` : ""}
          {stored?.airdropsPrUrl ? (
            <>
              {" · "}
              <a href={stored.airdropsPrUrl} target="_blank" rel="noopener noreferrer" className="link">
                PR
              </a>
            </>
          ) : null}
        </li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || githubBusy} onClick={onCheckGithub}>
          {githubBusy ? "Checking GitHub…" : "Check GitHub"}
        </button>
        <GithubButton
          label="Open alcor-ui PR"
          disabled={busy || githubBusy || Boolean(github.alcor?.listed) || github.alcor?.prState === "open" || stored?.alcorPrState === "open"}
          run={() => openPr("alcor-ui")}
          onError={onError}
        />
        <GithubButton
          label="Open eos-airdrops PR"
          disabled={busy || githubBusy || Boolean(github.airdrops?.listed) || github.airdrops?.prState === "open" || stored?.airdropsPrState === "open"}
          run={() => openPr("eos-airdrops")}
          onError={onError}
        />
        <GithubButton
          label="Sync forks with upstream"
          disabled={busy || githubBusy}
          run={async () => {
            const r = await syncListingForks();
            onNote(r.sync || "Forks synced.");
          }}
          onError={onError}
        />
      </div>
    </div>
  );
}

function GithubButton({
  label,
  disabled,
  run,
  onError,
}: {
  label: string;
  disabled: boolean;
  run: () => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const onClick = async () => {
    try {
      await run();
    } catch (err) {
      onError(txErrorMessage(err));
    }
  };
  return (
    <button type="button" className="btn btn-outline btn-sm" disabled={disabled} onClick={() => void onClick()}>
      {label}
    </button>
  );
}
