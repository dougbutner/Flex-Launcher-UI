import { useState, type ReactNode } from "react";
import type { FlexProgram } from "@/config/launch";
import { programChoices, type AgeUnit, type BoardFilters } from "@/services/winnerBoard";

type FilterId = "contract" | "mcap" | "vol" | "holders" | "age" | "change7";

const BUBBLES: { id: FilterId; label: string }[] = [
  { id: "contract", label: "Contract" },
  { id: "mcap", label: "Market cap" },
  { id: "vol", label: "Volume" },
  { id: "holders", label: "Holders" },
  { id: "age", label: "Age" },
  { id: "change7", label: "7d" },
];

function isOn(id: FilterId, applied: BoardFilters) {
  if (id === "contract") return applied.programs.length > 0;
  if (id === "mcap") return Boolean(applied.mcapMin.trim() || applied.mcapMax.trim());
  if (id === "vol") return Boolean(applied.volMin.trim() || applied.volMax.trim());
  if (id === "holders") return Boolean(applied.holdersMin.trim() || applied.holdersMax.trim());
  if (id === "age") return Boolean(applied.ageMin.trim() || applied.ageMax.trim());
  return applied.showChange7;
}

function RangeFields({
  min,
  max,
  onMin,
  onMax,
  suffix,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  suffix?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className="input h-8 px-2 py-1 font-mono text-xs" placeholder="Min" value={min} onChange={(e) => onMin(e.target.value)} />
      <input className="input h-8 px-2 py-1 font-mono text-xs" placeholder="Max" value={max} onChange={(e) => onMax(e.target.value)} />
      {suffix ? <div className="col-span-2">{suffix}</div> : null}
    </div>
  );
}

export function BoardFilterRail({
  draft,
  applied,
  setDraft,
  apply,
}: {
  draft: BoardFilters;
  applied: BoardFilters;
  setDraft: (next: BoardFilters) => void;
  apply: (next: BoardFilters) => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState<FilterId | null>(null);
  const programs = programChoices();

  const toggleProgram = (id: FlexProgram) => {
    const has = draft.programs.includes(id);
    setDraft({ ...draft, programs: has ? draft.programs.filter((p) => p !== id) : [...draft.programs, id] });
  };

  const turnOff = (id: FilterId) => {
    if (id === "contract") apply({ ...applied, programs: [] });
    else if (id === "mcap") apply({ ...applied, mcapMin: "", mcapMax: "" });
    else if (id === "vol") apply({ ...applied, volMin: "", volMax: "" });
    else if (id === "holders") apply({ ...applied, holdersMin: "", holdersMax: "" });
    else if (id === "age") apply({ ...applied, ageMin: "", ageMax: "" });
    else apply({ ...applied, showChange7: false, change7Min: "", change7Max: "" });
    setOpen(null);
  };

  const save = (id: FilterId) => {
    if (id === "contract") apply({ ...applied, programs: draft.programs });
    else if (id === "mcap") apply({ ...applied, mcapMin: draft.mcapMin, mcapMax: draft.mcapMax });
    else if (id === "vol") apply({ ...applied, volMin: draft.volMin, volMax: draft.volMax });
    else if (id === "holders") apply({ ...applied, holdersMin: draft.holdersMin, holdersMax: draft.holdersMax });
    else if (id === "age") apply({ ...applied, ageMin: draft.ageMin, ageMax: draft.ageMax, ageUnit: draft.ageUnit });
    else apply({ ...applied, showChange7: true, change7Min: draft.change7Min, change7Max: draft.change7Max });
    setOpen(null);
  };

  const editor = (id: FilterId) => {
    if (id === "contract") {
      return (
        <div className="flex flex-col gap-1">
          {programs.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.programs.includes(p.id)} onChange={() => toggleProgram(p.id)} />
              <span className="font-mono">{p.label}</span>
            </label>
          ))}
        </div>
      );
    }
    if (id === "mcap") {
      return (
        <RangeFields
          min={draft.mcapMin}
          max={draft.mcapMax}
          onMin={(v) => setDraft({ ...draft, mcapMin: v })}
          onMax={(v) => setDraft({ ...draft, mcapMax: v })}
        />
      );
    }
    if (id === "vol") {
      return (
        <RangeFields
          min={draft.volMin}
          max={draft.volMax}
          onMin={(v) => setDraft({ ...draft, volMin: v })}
          onMax={(v) => setDraft({ ...draft, volMax: v })}
        />
      );
    }
    if (id === "holders") {
      return (
        <RangeFields
          min={draft.holdersMin}
          max={draft.holdersMax}
          onMin={(v) => setDraft({ ...draft, holdersMin: v })}
          onMax={(v) => setDraft({ ...draft, holdersMax: v })}
        />
      );
    }
    if (id === "age") {
      return (
        <RangeFields
          min={draft.ageMin}
          max={draft.ageMax}
          onMin={(v) => setDraft({ ...draft, ageMin: v })}
          onMax={(v) => setDraft({ ...draft, ageMax: v })}
          suffix={
            <select
              className="input h-8 w-16 px-1 py-0 text-xs"
              value={draft.ageUnit}
              onChange={(e) => setDraft({ ...draft, ageUnit: e.target.value as AgeUnit })}
            >
              <option value="h">h</option>
              <option value="d">d</option>
            </select>
          }
        />
      );
    }
    return (
      <RangeFields
        min={draft.change7Min}
        max={draft.change7Max}
        onMin={(v) => setDraft({ ...draft, change7Min: v })}
        onMax={(v) => setDraft({ ...draft, change7Max: v })}
      />
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      {BUBBLES.map((b) => {
        const on = isOn(b.id, applied);
        if (open === b.id) {
          return (
            <div
              key={b.id}
              className="flex w-44 shrink-0 flex-col justify-between rounded-2xl border border-primary bg-primary/10 p-2.5 text-foreground"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">{b.label}</p>
              <div className="my-2">{editor(b.id)}</div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  onClick={() => (on ? turnOff(b.id) : setOpen(null))}
                >
                  {on ? "Off" : "Close"}
                </button>
                <button type="button" className="text-[11px] uppercase tracking-wide text-primary hover:text-accent" onClick={() => save(b.id)}>
                  Save
                </button>
              </div>
            </div>
          );
        }
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={on}
            aria-expanded={false}
            onClick={() => setOpen(b.id)}
            className={`flex shrink-0 items-center justify-center rounded-full border px-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide ${
              on
                ? "h-16 w-16 border-primary bg-primary/15 text-primary"
                : "h-14 w-14 border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
            }`}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
