import { useEffect, useState } from "react";
import { readProtonProfile } from "@/services/protonProfile";

export function AccountFace({
  account,
  clubMark = null,
}: {
  account: string;
  clubMark?: "insider" | "proven" | null;
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
      <div className="insiders-name truncate">{label}</div>
      {clubMark ? (
        <span
          className="insiders-club-badge"
          title={clubMark === "proven" ? "On-chain insider with lock proof" : "On-chain approved insider"}
        >
          {clubMark === "proven" ? "proven" : "insider"}
        </span>
      ) : null}
    </div>
  );
}
