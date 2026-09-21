import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { FlexProgram } from "@/config/launch";
import {
  programChoices,
  type AgeUnit,
  type BoardFilters,
} from "@/services/winnerBoard";

function Card({
  label,
  onClear,
  children,
}: {
  label: string;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        {onClear ? (
          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Clear ${label}`} onClick={onClear}>
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function RangeFields({
  min,
  max,
  onMin,
  onMax,
  onSave,
  suffix,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  onSave: () => void;
  suffix?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className="input h-8 px-2 py-1 font-mono text-xs" placeholder="Min" value={min} onChange={(e) => onMin(e.target.value)} />
        <input className="input h-8 px-2 py-1 font-mono text-xs" placeholder="Max" value={max} onChange={(e) => onMax(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-2">
        {suffix ?? <span />}
        <button type="button" className="text-[11px] uppercase tracking-wide text-primary hover:text-accent" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}

export function BoardFilterRail({
  draft,
  applied,
  setDraft,
  apply,
  onClose,
}: {
  draft: BoardFilters;
  applied: BoardFilters;
  setDraft: (next: BoardFilters) => void;
  apply: (next: BoardFilters) => void;
  onClose?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const programs = programChoices();

  const toggleProgram = (id: FlexProgram) => {
    const has = draft.programs.includes(id);
    const programsNext = has ? draft.programs.filter((p) => p !== id) : [...draft.programs, id];
    const next = { ...draft, programs: programsNext };
    setDraft(next);
    apply(next);
  };

  return (
    <aside className="flex w-full flex-col gap-3 lg:sticky lg:top-3 lg:max-h-[calc(100vh-8rem)] lg:w-[280px] lg:shrink-0 lg:overflow-y-auto">
      {onClose ? (
        <div className="flex items-center justify-between lg:hidden">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Filters</p>
          <button type="button" className="text-sm text-muted-foreground" onClick={onClose}>
            Close
          </button>
        </div>
      ) : null}

      <Card
        label="Contract"
        onClear={applied.programs.length ? () => apply({ ...applied, programs: [] }) : undefined}
      >
        <div className="flex flex-col gap-1">
          {programs.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.programs.includes(p.id)}
                onChange={() => toggleProgram(p.id)}
              />
              <span className="font-mono">{p.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card label="Market cap" onClear={applied.mcapMin || applied.mcapMax ? () => apply({ ...applied, mcapMin: "", mcapMax: "" }) : undefined}>
        <RangeFields
          min={draft.mcapMin}
          max={draft.mcapMax}
          onMin={(v) => setDraft({ ...draft, mcapMin: v })}
          onMax={(v) => setDraft({ ...draft, mcapMax: v })}
          onSave={() => apply({ ...applied, mcapMin: draft.mcapMin, mcapMax: draft.mcapMax })}
        />
      </Card>

      <Card label="Volume 24h" onClear={applied.volMin || applied.volMax ? () => apply({ ...applied, volMin: "", volMax: "" }) : undefined}>
        <RangeFields
          min={draft.volMin}
          max={draft.volMax}
          onMin={(v) => setDraft({ ...draft, volMin: v })}
          onMax={(v) => setDraft({ ...draft, volMax: v })}
          onSave={() => apply({ ...applied, volMin: draft.volMin, volMax: draft.volMax })}
        />
      </Card>

      <Card label="Holders" onClear={applied.holdersMin || applied.holdersMax ? () => apply({ ...applied, holdersMin: "", holdersMax: "" }) : undefined}>
        <RangeFields
          min={draft.holdersMin}
          max={draft.holdersMax}
          onMin={(v) => setDraft({ ...draft, holdersMin: v })}
          onMax={(v) => setDraft({ ...draft, holdersMax: v })}
          onSave={() => apply({ ...applied, holdersMin: draft.holdersMin, holdersMax: draft.holdersMax })}
        />
      </Card>

      <Card label="Age" onClear={applied.ageMin || applied.ageMax ? () => apply({ ...applied, ageMin: "", ageMax: "" }) : undefined}>
        <RangeFields
          min={draft.ageMin}
          max={draft.ageMax}
          onMin={(v) => setDraft({ ...draft, ageMin: v })}
          onMax={(v) => setDraft({ ...draft, ageMax: v })}
          onSave={() => apply({ ...applied, ageMin: draft.ageMin, ageMax: draft.ageMax, ageUnit: draft.ageUnit })}
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
      </Card>

      {draft.showChange7 || applied.showChange7 ? (
        <Card
          label="7d change"
          onClear={() => apply({ ...applied, showChange7: false, change7Min: "", change7Max: "" })}
        >
          <RangeFields
            min={draft.change7Min}
            max={draft.change7Max}
            onMin={(v) => setDraft({ ...draft, change7Min: v })}
            onMax={(v) => setDraft({ ...draft, change7Max: v })}
            onSave={() =>
              apply({
                ...applied,
                showChange7: true,
                change7Min: draft.change7Min,
                change7Max: draft.change7Max,
              })
            }
          />
        </Card>
      ) : null}

      <div className="relative">
        <button
          type="button"
          className="w-full border border-success/50 py-2 text-[11px] uppercase tracking-wide text-success hover:bg-success/10"
          onClick={() => setMoreOpen((v) => !v)}
        >
          + Add more filters
        </button>
        {moreOpen ? (
          <div className="absolute bottom-full z-20 mb-1 w-full border border-border bg-background py-1 text-xs">
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted">
              <input
                type="checkbox"
                checked={draft.showChange7 || applied.showChange7}
                onChange={(e) => {
                  const on = e.target.checked;
                  const next = { ...draft, showChange7: on };
                  setDraft(next);
                  if (!on) apply({ ...applied, showChange7: false, change7Min: "", change7Max: "" });
                  else apply({ ...applied, showChange7: true });
                }}
              />
              7d change
            </label>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
