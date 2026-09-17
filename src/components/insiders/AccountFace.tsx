import { useEffect, useState } from "react";
import { readProtonProfile } from "@/services/protonProfile";

export function AccountFace({
  account,
  score,
  holdLabel,
}: {
  account: string;
  score: number;
  holdLabel?: string;
}) {
  const [src, setSrc] = useState("");
  const [label, setLabel] = useState(account);

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

  const letter = (account || "?").slice(0, 1).toUpperCase();

  return (
    <div className="insiders-face">
      {src ? (
        <img src={src} alt="" className="insiders-avatar" />
      ) : (
        <span className="insiders-avatar insiders-avatar-fallback">{letter}</span>
      )}
      <div className="min-w-0 leading-tight">
        <div className="insiders-name truncate">{label !== account ? label : account}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {account}
          {holdLabel ? ` · ${holdLabel}` : ""}
        </div>
      </div>
      <span className="insiders-score" title="Mechanics score">
        {score}
      </span>
    </div>
  );
}
