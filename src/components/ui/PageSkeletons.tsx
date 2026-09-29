import { Pulse } from "@/components/ui/Pulse";

export function RainSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card flex min-h-[13.5rem] flex-col items-center justify-center gap-3 px-2 pt-3 pb-3">
          <Pulse className="h-9 w-9 rounded-full" />
          <Pulse className="h-6 w-16" />
          <Pulse className="h-3 w-24" />
          <Pulse className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export function BagsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-box space-y-2">
            <Pulse className="h-3 w-20" />
            <Pulse className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <Pulse className="h-10 w-10 rounded-2xl" />
              <div className="space-y-2">
                <Pulse className="h-4 w-20" />
                <Pulse className="h-3 w-36" />
              </div>
            </div>
            <div className="space-y-2 text-right">
              <Pulse className="ml-auto h-4 w-16" />
              <Pulse className="ml-auto h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventsSkeleton() {
  return (
    <div className="mt-8" aria-busy="true">
      <div className="border border-border bg-card p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Pulse key={`logo${i}`} className="h-8 w-8 shrink-0 rounded-full" />
            ))}
          </div>
          <Pulse className="h-9 w-9 shrink-0 rounded-full" />
        </div>
        <div className="mb-3 flex items-center justify-between">
          <Pulse className="h-8 w-8" />
          <Pulse className="h-4 w-28" />
          <Pulse className="h-8 w-8" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Pulse key={`d${i}`} className="h-3 w-8 justify-self-center" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <Pulse key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Pulse key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TilesRowSkeleton({ n = 5 }: { n?: number }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <Pulse key={i} className="aspect-square rounded-xl" />
      ))}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="mt-2 space-y-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Pulse className="h-6 w-6 rounded-full" />
            <Pulse className="h-3 w-24" />
          </div>
          <Pulse className="h-3 w-full" />
          <Pulse className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function TokenPageSkeleton() {
  return (
    <div className="mt-6" aria-busy="true">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid items-start gap-4 md:grid-cols-3">
        <Pulse className="h-[100dvh] w-full md:col-span-2" />
        <div className="max-h-[100dvh] overflow-hidden border border-border bg-background/40 p-3 md:col-span-1">
          <FeedSkeleton />
        </div>
      </div>
      <div className="mt-4 border border-border bg-background/40 p-4">
        <Pulse className="h-4 w-16" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Pulse className="h-2.5 w-16" />
              <Pulse className="h-6 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketChartSkeleton() {
  return (
    <div className="card overflow-hidden" aria-busy="true">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-4 py-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Pulse className="h-2.5 w-10" />
            <Pulse className="h-4 w-16" />
          </div>
        ))}
      </div>
      <Pulse className="h-[220px] w-full" />
    </div>
  );
}

export function ManagerSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Pulse className="h-9 w-9 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Pulse className="h-4 w-24" />
            <Pulse className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminListSkeleton() {
  return (
    <ul className="mt-3 space-y-3" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-4">
          <Pulse className="h-9 w-9 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Pulse className="h-4 w-28" />
            <Pulse className="h-3 w-48" />
          </div>
          <Pulse className="h-8 w-20" />
        </li>
      ))}
    </ul>
  );
}

export function FormPanelSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Pulse className="h-3 w-28" />
      <Pulse className="h-10 w-full" />
      <Pulse className="h-10 w-full" />
      <Pulse className="h-9 w-32" />
    </div>
  );
}
