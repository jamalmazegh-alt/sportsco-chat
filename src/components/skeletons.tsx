import { Skeleton } from "@/components/ui/skeleton";

export function WallFeedSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-border bg-card overflow-hidden">
            <Skeleton className="w-16 h-24 rounded-none" />
            <div className="flex-1 py-3 pr-3 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div className="px-5 pt-6 pb-24 md:pb-6 space-y-5">
      <Skeleton className="h-4 w-20" />
      <div className="space-y-3">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerDetailSkeleton() {
  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <Skeleton className="h-4 w-20" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
