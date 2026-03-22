'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { RouteCard } from '@/components/RouteCard';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { StationWithPrice } from '@/lib/db';
import { RouteDefinition } from '@/lib/routes';

interface RouteData {
  route: Pick<RouteDefinition, 'id' | 'name' | 'shortName' | 'color' | 'colorClass' | 'borderClass' | 'bgClass'>;
  stations: StationWithPrice[];
}

interface PricesResponse {
  success: boolean;
  lastUpdated: string | null;
  routes: RouteData[];
  error?: string;
}

// Group routes by corridor pairs
const ROUTE_GROUPS = [
  {
    label: 'Base — Pinto · Galp locales',
    ids: ['pinto-base'],
    icon: '🏠',
  },
  {
    label: 'Madrid — Alicante (A-3 / A-31 · sin peaje)',
    ids: ['mad-ali', 'ali-mad'],
    icon: '🔵',
  },
  {
    label: 'Madrid — Barcelona (A-2 · sin peaje)',
    ids: ['mad-bcn', 'bcn-mad'],
    icon: '🟡',
  },
  {
    label: 'Barcelona — Valencia (AP-7 libre 2020 · A-7)',
    ids: ['bcn-val', 'val-bcn'],
    icon: '🔴',
  },
  {
    label: 'Madrid — Huelva (A-5 · A-66 Ruta de la Plata · A-49)',
    ids: ['mad-hue', 'hue-mad'],
    icon: '🟠',
  },
  {
    label: 'Alicante — Molina de Segura (A-7 libre · A-30)',
    ids: ['ali-mol', 'mol-ali'],
    icon: '🌊',
  },
];

export default function HomePage() {
  const [data, setData] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSetupRunning, setIsSetupRunning] = useState(false);
  // Ref para evitar bucle: no provoca re-render ni recrea callbacks
  const setupDoneRef = useRef(false);

  // Carga precios sin disparar setup (para usar después del setup)
  const loadPrices = useCallback(async () => {
    const res = await fetch('/api/prices', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: PricesResponse = await res.json();
    if (!json.success) throw new Error(json.error || 'Unknown error');
    setData(json);
    setError(null);
    return json;
  }, []);

  const triggerSetup = useCallback(async () => {
    setIsSetupRunning(true);
    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      if (!res.ok) throw new Error(`Setup HTTP ${res.status}`);
      await loadPrices();
    } catch (err) {
      console.error('Setup failed:', err);
    } finally {
      setIsSetupRunning(false);
    }
  }, [loadPrices]);

  const fetchPrices = useCallback(async () => {
    try {
      const json = await loadPrices();
      const totalStations = json.routes.reduce((sum, r) => sum + r.stations.length, 0);
      // Solo lanzar setup una vez (ref no causa re-render)
      if (totalStations === 0 && !setupDoneRef.current) {
        setupDoneRef.current = true;
        triggerSetup();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadPrices, triggerSetup]);

  const handleRefresh = useCallback(async () => {
    const res = await fetch('/api/update', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    await loadPrices();
  }, [loadPrices]);

  useEffect(() => {
    fetchPrices().finally(() => setLoading(false));
    const interval = setInterval(loadPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRouteById = (id: string): RouteData | undefined =>
    data?.routes.find((r) => r.route.id === id);

  const totalStations =
    data?.routes.reduce((sum, r) => sum + r.stations.length, 0) ?? 0;

  const galpCount =
    data?.routes.reduce(
      (sum, r) =>
        sum +
        r.stations.filter((s) => s.brand.toUpperCase().includes('GALP')).length,
      0
    ) ?? 0;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Sticky Header */}
      <Header
        lastUpdated={data?.lastUpdated ?? null}
        onRefresh={handleRefresh}
      />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats bar */}
        {data && totalStations > 0 && (
          <div className="flex flex-wrap items-center gap-4 mb-8 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-slate-400">
                <span className="font-semibold text-slate-200">
                  {totalStations}
                </span>{' '}
                estaciones monitorizadas
              </span>
            </div>
            <div className="text-slate-600">|</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-400 font-semibold">
                {galpCount}
              </span>
              <span className="text-xs text-slate-400">estaciones Galp</span>
            </div>
            <div className="text-slate-600">|</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                <span className="font-semibold text-slate-200">
                  {data.routes.length}
                </span>{' '}
                rutas
              </span>
            </div>
            <div className="text-slate-600 hidden sm:block">|</div>
            <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
              <span>Fuente:</span>
              <span className="font-mono text-slate-400">MINETUR</span>
              <span className="text-slate-600">·</span>
              <span>Actualización diaria 08:00</span>
            </div>
          </div>
        )}

        {/* Setup/loading notice */}
        {isSetupRunning && (
          <div className="mb-6 p-4 rounded-xl bg-blue-900/30 border border-blue-700/50 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-300">
                Configurando estaciones por primera vez...
              </p>
              <p className="text-xs text-blue-400 mt-0.5">
                Descargando datos de {'>'}10.000 gasolineras del MINETUR. Esto puede tardar 30-60 segundos.
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-700/50">
            <p className="text-sm font-medium text-red-300">
              Error al cargar los precios
            </p>
            <p className="text-xs text-red-400 mt-1 font-mono">{error}</p>
            <button
              onClick={fetchPrices}
              className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-10">
            {ROUTE_GROUPS.map((group) => {
              const groupRoutes = group.ids
                .map((id) => getRouteById(id))
                .filter((r): r is RouteData => r !== undefined);

              if (groupRoutes.length === 0) return null;

              return (
                <section key={group.label}>
                  {/* Group header */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl">{group.icon}</span>
                    <h2 className="text-base font-semibold text-slate-300">
                      {group.label}
                    </h2>
                    <div className="flex-1 h-px bg-slate-700/50" />
                  </div>

                  {/* Route cards grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {groupRoutes.map((routeData) => (
                      <RouteCard
                        key={routeData.route.id}
                        route={routeData.route as RouteDefinition}
                        stations={routeData.stations}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Empty state after load */}
        {!loading && data && totalStations === 0 && !isSetupRunning && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">⛽</span>
            <h2 className="text-xl font-semibold text-slate-300 mb-2">
              Iniciando GasoilRutas
            </h2>
            <p className="text-slate-500 max-w-md text-sm">
              La primera configuración está en proceso. Los precios de las
              estaciones se cargarán automáticamente desde el MINETUR.
            </p>
            <button
              onClick={() => {
                setIsSetupRunning(true);
                triggerSetup();
              }}
              className="mt-6 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Configurar ahora
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 pb-8 text-center">
        <p className="text-xs text-slate-600">
          GasoilRutas — Precios para camioneros en rutas España · Datos del{' '}
          <a
            href="https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-400 underline"
          >
            MINETUR
          </a>
          {' '}· Actualización diaria
        </p>
        <p className="text-xs text-slate-700 mt-1">
          Precios en €/litro · Gasóleo A (diésel de carretera) · Estaciones Galp con AdBlue
        </p>
      </footer>
    </div>
  );
}
