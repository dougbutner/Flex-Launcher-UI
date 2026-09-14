import { EXPLORER, SWAP_ALCOR, explorerAccount } from "@/config/launch";

export function NetworkSwitcher() {
  return (
    <p className="text-center font-mono text-[11px] tracking-wide text-muted-foreground">
      <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="link">
        XPR
      </a>
      {" · "}
      <a href={explorerAccount(SWAP_ALCOR)} target="_blank" rel="noopener noreferrer" className="link">
        {SWAP_ALCOR}
      </a>
    </p>
  );
}
