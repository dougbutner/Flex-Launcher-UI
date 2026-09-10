import { useEffect, useState } from "react";
import { listIssuerTokens } from "@/services/issuerTokens";
import { listManagerTokens } from "@/services/managerApi";

/** Nav gate: sqlite row or on-chain create/stat for this issuer. */
export function useManagerAccess(actor: string | null | undefined): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!actor) {
      setShow(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const stored = await listManagerTokens({ issuer: actor });
        if (cancelled) return;
        if (stored.length) {
          setShow(true);
          return;
        }
      } catch {
        /* sqlite may be unbound; still check chain */
      }
      try {
        const chain = await listIssuerTokens(actor);
        if (!cancelled) setShow(chain.length > 0);
      } catch {
        if (!cancelled) setShow(false);
      }
    };
    void run();
    const onUpd = () => void run();
    window.addEventListener("flex-manager-updated", onUpd);
    return () => {
      cancelled = true;
      window.removeEventListener("flex-manager-updated", onUpd);
    };
  }, [actor]);

  return show;
}
