import { useState, type ReactNode } from "react";
import { easyHoldNeed, easyHoldOffPercent, FLEX_PROGRAMS, type HoldKind } from "@/config/launch";

function holdCell(programId: (typeof FLEX_PROGRAMS)[number]["id"], kind: HoldKind): string {
  if (kind === "geasy" && programId === "flexforex") return "not available";
  const base = FLEX_PROGRAMS.find((p) => p.id === programId)?.launchEasyMin ?? 0;
  const need = easyHoldNeed(base, 0, Date.now(), kind, true);
  if (need <= 0) return "No EASY hold";
  return `${need.toLocaleString()} EASY`;
}

export function FeeTable() {
  const off = easyHoldOffPercent();
  const rows: { quote: string; skim: string; kind: HoldKind }[] = [
    { quote: "EASY, WON, GRAMS, MEME", skim: "0%", kind: "flex" },
    { quote: "GEASY", skim: "0%", kind: "geasy" },
    {
      quote: "XPR, XMD, LOAN, xtoken",
      skim: "0.25% dev + 0.25% Contributor's Club. After the lock ends, 0.50% each.",
      kind: "other",
    },
  ];

  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Skim is the platform fee. It is taken from the reflection pool each time it rains, before holders are paid.
        dev and Contributor's Club are the two halves.
      </p>
      <div className="overflow-x-auto">
        <table className="fee-table">
          <thead>
            <tr>
              <th>Quote</th>
              <th>Skim</th>
              <th>3asy</th>
              <th>fl3x</th>
              <th>for3x</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.quote}>
                <td className="font-semibold text-foreground">{row.quote}</td>
                <td>{row.skim}</td>
                {FLEX_PROGRAMS.map((p) => (
                  <td key={p.id}>{holdCell(p.id, row.kind)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="font-semibold text-foreground">Market fee</td>
              <td colSpan={4}>
                1% of swapped rain, sent to flex.for3x. This 1% is not sold. Reflections on it are collected by the
                project. Same on 3asy, fl3x, and for3x.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The EASY columns are the hold on a first launch. Each token you already launched on that contract multiplies
        the hold. EASY, WON, GRAMS, and MEME stay at 90% off.
        {off > 0
          ? ` XPR, XMD, LOAN, and xtokens are ${off}% off this month, then 10 points less every 30 days.`
          : " XPR, XMD, LOAN, and xtokens are at the full hold."}{" "}
        GEASY skips the EASY hold on your first launch when your WebAuth account is verified. A later launch on the
        same contract follows that monthly promo. GEASY is not offered on for3x.
      </p>
    </div>
  );
}

export function FeeHow() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm text-muted-foreground">
      <button type="button" className="link text-[11px] font-semibold uppercase tracking-wider" onClick={() => setOpen((v) => !v)}>
        {open ? "hide" : "how these fees move"}
      </button>
      {open ? (
        <div className="mt-3 space-y-3 leading-relaxed">
          <p>
            Rain that flexes into another token is swapped on Alcor. The swap memo uses a built-in Alcor market fee.
            That fee puts 1% into a vault at flex.for3x. The 1% is not sold. It stays as the token. The vault then
            reflects in that token or in EASY, and the project keeps those reflections.
          </p>
          <p>
            On for3x, the keeper who calls makeitrain can take a tip. The tip is limited so it is never over 1% of the
            rain about to be paid from the reflection pool. If the reflection is too small to cover that tip, the
            keeper is not paid.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function InfoPanel({
  open,
  paras,
  children,
}: {
  open: boolean;
  paras: readonly string[];
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {paras.map((para) => (
        <p key={para.slice(0, 56)}>{para}</p>
      ))}
      <div className="shadow-line" role="separator" aria-hidden />
      <FeeTable />
      <FeeHow />
      {children}
    </div>
  );
}
