import { useEffect, useRef, useState } from "react";

const NETWORKS = [
  { id: "vaulta", label: "Vaulta", hover: "hover:text-[#7dd3fc] hover:bg-[#7dd3fc]/10" },
  { id: "wire", label: "Wire", hover: "hover:text-[#93c5fd] hover:bg-[#1e3a8a]" },
  { id: "wax", label: "WAX", hover: "hover:text-[#fde047] hover:bg-[#fde047]/10" },
  { id: "xpr", label: "XPR", hover: "hover:text-[#c084fc] hover:bg-[#7c3aed]/15" },
] as const;

export function NetworkSwitcher() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex justify-center">
      <div
        className={`absolute bottom-full mb-2 w-44 origin-bottom overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-md transition-all duration-300 ${
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <ul className="py-1">
          {NETWORKS.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                aria-disabled="true"
                tabIndex={-1}
                className={`flex w-full cursor-not-allowed px-3 py-2 text-left text-xs font-medium text-muted-foreground/50 ${n.hover}`}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        xprtestnet
      </button>
    </div>
  );
}
