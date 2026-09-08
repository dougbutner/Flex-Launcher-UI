import { EXPLORER, FAUCET_URL } from "@/config/launch";

export function NetworkSwitcher() {
  return (
    <p className="text-center font-mono text-[11px] tracking-wide text-muted-foreground">
      <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="link">
        xprtestnet
      </a>
      {" · "}
      <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="link">
        faucet
      </a>
    </p>
  );
}
