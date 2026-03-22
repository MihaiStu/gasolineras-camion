'use client';

export function LoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5"
          >
            {/* Route header skeleton */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="skeleton h-5 w-36 mb-2" />
                <div className="skeleton h-3 w-48" />
              </div>
              <div className="skeleton h-4 w-16" />
            </div>

            {/* Station card skeletons */}
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 mb-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="skeleton w-5 h-5 rounded-full" />
                      <div className="skeleton h-4 w-28" />
                    </div>
                    <div className="skeleton h-3 w-20 mb-2" />
                    <div className="skeleton h-3 w-32" />
                  </div>
                  <div className="text-right">
                    <div className="skeleton h-6 w-24 mb-1" />
                    <div className="skeleton h-3 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
