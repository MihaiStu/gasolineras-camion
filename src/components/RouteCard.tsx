'use client';

import { StationWithPrice } from '@/lib/db';
import { RouteDefinition } from '@/lib/routes';
import { StationCard } from './StationCard';

interface RouteCardProps {
  route: RouteDefinition;
  stations: StationWithPrice[];
}

function computeRouteAverage(stations: StationWithPrice[]): number | null {
  const prices = stations
    .map((s) => s.gasoleo_a)
    .filter((p): p is number => p !== null && p > 0);
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function computeRouteTotalCost(
  stations: StationWithPrice[],
  tankLiters = 70
): string | null {
  const prices = stations
    .map((s) => s.gasoleo_a)
    .filter((p): p is number => p !== null && p > 0);
  if (prices.length === 0) return null;
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const estimate = (avg * tankLiters).toFixed(2);
  return estimate;
}

export function RouteCard({ route, stations }: RouteCardProps) {
  const avgPrice = computeRouteAverage(stations);

  // Sort stations by price (cheapest first) for display, but keep original position info
  const sortedByPrice = [...stations].sort((a, b) => {
    if (a.gasoleo_a === null) return 1;
    if (b.gasoleo_a === null) return -1;
    return a.gasoleo_a - b.gasoleo_a;
  });

  const hasData = stations.some((s) => s.gasoleo_a !== null && s.gasoleo_a > 0);
  const totalEstimate = computeRouteTotalCost(stations);

  return (
    <div
      className={`route-card rounded-2xl border ${route.borderClass} ${route.bgClass} p-5 flex flex-col gap-4`}
    >
      {/* Route header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-bold ${route.colorClass}`}>
            {route.name}
          </h2>
          {avgPrice && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400">
                Precio medio:{' '}
                <span className="font-semibold text-slate-200">
                  {avgPrice.toFixed(3)} €/L
                </span>
              </span>
              {totalEstimate && (
                <span className="text-xs text-slate-500">
                  ~{totalEstimate} € depósito (70L)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Route stats */}
        <div className="flex flex-col items-end gap-1">
          {stations.length > 0 && (
            <span className="text-xs text-slate-500">
              {stations.length} estación{stations.length !== 1 ? 'es' : ''}
            </span>
          )}
          {hasData && (
            <div className="flex gap-1">
              {stations.map((s) => (
                <div
                  key={s.ideess}
                  className={`w-2 h-2 rounded-full ${
                    s.gasoleo_a !== null
                      ? 'bg-green-500'
                      : 'bg-slate-600'
                  }`}
                  title={s.locality}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Station cards */}
      {stations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <span className="text-3xl mb-2">⛽</span>
          <p className="text-sm">Configurando estaciones...</p>
          <p className="text-xs mt-1 text-slate-600">
            Primera actualización en curso
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Ordered by route position (original order) with cheapest marker */}
          {sortedByPrice.map((station, idx) => (
            <StationCard
              key={station.ideess}
              station={station}
              rank={idx + 1}
              routeAvgPrice={avgPrice}
              isFirst={idx === 0 && hasData}
            />
          ))}
        </div>
      )}

      {/* Route path visualization */}
      <div className="mt-1 flex items-center gap-1 overflow-hidden">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${route.colorClass.replace('text-', 'bg-')}`} />
        <div className={`flex-1 h-0.5 ${route.colorClass.replace('text-', 'bg-')} opacity-30`} />
        {stations.map((s, i) => (
          <div key={s.ideess} className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                s.gasoleo_a ? 'bg-green-400' : 'bg-slate-600'
              }`}
              title={s.locality}
            />
            {i < stations.length - 1 && (
              <div className={`w-8 h-0.5 ${route.colorClass.replace('text-', 'bg-')} opacity-30`} />
            )}
          </div>
        ))}
        <div className={`flex-1 h-0.5 ${route.colorClass.replace('text-', 'bg-')} opacity-30`} />
        <div className={`w-3 h-3 flex-shrink-0 ${route.colorClass}`}>▶</div>
      </div>
    </div>
  );
}
