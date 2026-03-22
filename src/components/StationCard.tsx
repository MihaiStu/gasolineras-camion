'use client';

import { StationWithPrice } from '@/lib/db';
import { PriceTrend } from './PriceTrend';

interface StationCardProps {
  station: StationWithPrice;
  rank: number;
  routeAvgPrice: number | null;
  isFirst?: boolean;
}

function formatPrice(price: number | null): string {
  if (price === null || price === 0) return '—';
  return `${price.toFixed(3)} €/L`;
}

function getPriceColorClass(
  price: number | null,
  avgPrice: number | null
): string {
  if (!price || !avgPrice) return 'text-slate-300';
  const diff = price - avgPrice;
  if (diff < -0.02) return 'text-green-400';
  if (diff > 0.02) return 'text-red-400';
  return 'text-slate-200';
}

function isGalp(brand: string): boolean {
  return brand.toUpperCase().includes('GALP');
}

function getBrandIcon(brand: string): string {
  const upper = brand.toUpperCase();
  if (upper.includes('GALP')) return '🟠';
  if (upper.includes('REPSOL')) return '🔵';
  if (upper.includes('CEPSA')) return '🟢';
  if (upper.includes('BP')) return '🟡';
  if (upper.includes('SHELL')) return '🔴';
  if (upper.includes('CAMPSA')) return '🔵';
  if (upper.includes('PETRONOR')) return '⚪';
  return '⛽';
}

function getRankBadge(rank: number, avgPrice: number | null, price: number | null): string {
  if (!price || !avgPrice) return '';
  const diff = price - avgPrice;
  if (rank === 1 && diff < -0.01) return 'MÁS BARATA';
  return '';
}

export function StationCard({
  station,
  rank,
  routeAvgPrice,
  isFirst = false,
}: StationCardProps) {
  const galp = isGalp(station.brand);
  const priceColorClass = getPriceColorClass(station.gasoleo_a, routeAvgPrice);
  const cheapestBadge = getRankBadge(rank, routeAvgPrice, station.gasoleo_a);

  return (
    <div
      className={`
        relative rounded-xl border p-4 transition-all duration-200
        ${galp
          ? 'border-orange-500 bg-orange-950/20 shadow-[0_0_12px_rgba(255,107,0,0.2)]'
          : 'border-slate-700 bg-slate-800/60'
        }
        ${isFirst ? 'ring-1 ring-green-500/30' : ''}
        hover:border-slate-500 hover:bg-slate-800/80
      `}
    >
      {/* Galp badge */}
      {galp && (
        <div className="absolute -top-2.5 left-3">
          <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            GALP
          </span>
        </div>
      )}

      {/* Cheapest badge */}
      {cheapestBadge && (
        <div className="absolute -top-2.5 right-3">
          <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {cheapestBadge}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        {/* Left: station info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{getBrandIcon(station.brand)}</span>
            <span className="font-semibold text-slate-100 truncate text-sm">
              {station.name}
            </span>
          </div>

          <div className="text-xs text-slate-400 mb-2 truncate">
            {station.locality}
            {station.province && station.province !== station.locality
              ? `, ${station.province}`
              : ''}
          </div>

          {station.address && (
            <div className="mb-2">
              <div className="text-xs text-slate-300 truncate">
                {station.address}
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Cómo llegar
              </a>
            </div>
          )}

          {station.adblue && station.adblue > 0 && (
            <div className="inline-flex items-center gap-1 text-xs bg-blue-900/40 border border-blue-700/50 text-blue-300 px-2 py-0.5 rounded-full mt-1">
              <span>AdBlue</span>
              <span className="font-semibold">{station.adblue.toFixed(3)} €/L</span>
            </div>
          )}

          {/* Secondary prices */}
          {(station.gasoleo_b || station.gasolina_95) && (
            <div className="flex gap-3 mt-1">
              {station.gasoleo_b && station.gasoleo_b > 0 && (
                <div className="text-xs text-slate-500">
                  <span className="text-slate-400">Gasóleo B: </span>
                  {station.gasoleo_b.toFixed(3)} €/L
                </div>
              )}
              {station.gasolina_95 && station.gasolina_95 > 0 && (
                <div className="text-xs text-slate-500">
                  <span className="text-slate-400">95 E5: </span>
                  {station.gasolina_95.toFixed(3)} €/L
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: price and trend */}
        <div className="flex-shrink-0 text-right">
          <div
            className={`text-xl font-bold tabular-nums ${priceColorClass}`}
          >
            {formatPrice(station.gasoleo_a)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Gasóleo A</div>
          <div className="mt-1 flex items-center justify-end gap-1">
            <PriceTrend trend={station.trend} size="sm" />
            <span className="text-xs text-slate-500">7d</span>
          </div>
        </div>
      </div>

      {/* Position indicator */}
      <div className="absolute bottom-2 left-4">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
          {[1, 2, 3].map((pos) => (
            <div
              key={pos}
              className={`w-1.5 h-1.5 rounded-full -ml-1 ${
                pos <= station.position ? 'bg-blue-400' : 'bg-slate-700'
              }`}
            />
          ))}
          <span className="text-xs text-slate-500 ml-1">
            Parada {station.position}
          </span>
        </div>
      </div>
    </div>
  );
}
