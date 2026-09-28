import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ProgramDots } from "@/components/token/ProgramDots";
import { flexAccount, type FlexProgram } from "@/config/launch";
import { CONTRACT_DOCS } from "@/content/flexContractDocs";

type Props = {
  program: FlexProgram;
  symbol: string;
  onClose: () => void;
};

export function ContractPickModal({ program, symbol, onClose }: Props) {
  const doc = CONTRACT_DOCS[program];
  const account = flexAccount(program);
  const code = (symbol || "-").toUpperCase();
  const [docsOpen, setDocsOpen] = useState(false);
  const titled = Boolean(doc.title);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/75" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-pick-title"
        className="relative z-10 m-4 max-h-[min(88dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-none border border-primary/40 bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{doc.codeName}</p>
            <h2
              id="contract-pick-title"
              className={`mt-1 font-black tracking-tight ${titled ? "text-xl" : "font-mono text-2xl"}`}
            >
              {titled ? doc.title : `${code}@${account}`}
            </h2>
            {titled ? (
              <p className="mt-1 font-mono text-sm text-primary">
                {code}@{account}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-foreground">{doc.lead}</p>
          </div>
          <ProgramDots program={program} />
        </div>
        <button
          type="button"
          className="link mt-5 text-[11px] font-semibold uppercase tracking-wider"
          onClick={() => setDocsOpen((v) => !v)}
        >
          {docsOpen ? "hide" : "contract documentation"}
        </button>
        {docsOpen
          ? doc.sections.map((sec) => (
              <section key={sec.title} className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">{sec.title}</h3>
                <dl className="mt-2 space-y-2">
                  {sec.lines.map((row) => (
                    <div key={row.name}>
                      <dt className="font-mono text-xs font-bold text-foreground">{row.name}</dt>
                      <dd className="text-sm text-muted-foreground">{row.note}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))
          : null}
        <button type="button" className="btn btn-outline mt-6 w-full" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
