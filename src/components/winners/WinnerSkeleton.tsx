import { Pulse } from "@/components/ui/Pulse";

export function TilesSkeleton() {
  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-busy="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <Pulse key={i} className="aspect-square rounded-xl" />
      ))}
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="mt-6" aria-busy="true">
      <div className="flex h-10 flex-wrap items-center gap-x-6">
        {["Volume", "Market cap", "Holders", "Age", "Gainers"].map((l) => (
          <span key={l} className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {l}
          </span>
        ))}
        <Pulse className="ml-auto h-9 w-56" />
      </div>
      <div className="mt-4 flex items-start gap-4">
        <div className="min-w-0 flex-1 border border-border bg-card">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex h-[52px] items-center gap-3 border-b border-border/80 px-3">
              <Pulse className="h-5 w-5 rounded-md" />
              <div className="space-y-1">
                <Pulse className="h-3 w-20" />
                <Pulse className="h-2.5 w-12" />
              </div>
              <Pulse className="ml-auto h-3 w-16" />
              <Pulse className="h-3 w-14" />
              <Pulse className="h-3 w-12" />
              <Pulse className="h-3 w-10" />
              <Pulse className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="hidden w-[280px] shrink-0 flex-col gap-3 lg:flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Pulse key={i} className="h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BubblesSkeleton() {
  return (
    <div className="relative mt-8 h-[min(72vh,640px)] overflow-hidden border border-border bg-card" aria-busy="true">
      {[
        { l: "38%", t: "28%", s: 128 },
        { l: "58%", t: "22%", s: 88 },
        { l: "22%", t: "42%", s: 96 },
        { l: "62%", t: "48%", s: 72 },
        { l: "40%", t: "58%", s: 64 },
        { l: "18%", t: "18%", s: 52 },
        { l: "74%", t: "34%", s: 48 },
      ].map((b, i) => (
        <Pulse
          key={i}
          className="absolute rounded-full"
          style={{ left: b.l, top: b.t, width: b.s, height: b.s }}
        />
      ))}
    </div>
  );
}
