import { useEffect, useState } from "react";
import { easyHoldPromoCopy } from "@/config/launch";

const KEY = "flex-easy-hold-promo-v1";
const DELAY_MS = 3000;

export function EasyHoldNotice({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);
  const line = easyHoldPromoCopy();

  useEffect(() => {
    if (!active || !line) {
      setShow(false);
      return;
    }
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => {
      setShow(true);
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    }, DELAY_MS);
    return () => window.clearTimeout(t);
  }, [active, line]);

  if (!show || !line) return null;

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
      <p className="min-w-0 flex-1 font-medium">{line}</p>
      <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setShow(false)}>
        OK
      </button>
    </div>
  );
}
