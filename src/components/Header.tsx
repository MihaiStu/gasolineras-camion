'use client';

import { useState } from 'react';

interface HeaderProps {
  lastUpdated: string | null;
  onRefresh: () => Promise<void>;
}

export function Header({ lastUpdated, onRefresh }: HeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      await onRefresh();
      setRefreshMessage('Precios actualizados correctamente');
      setTimeout(() => setRefreshMessage(null), 4000);
    } catch {
      setRefreshMessage('Error al actualizar los precios');
      setTimeout(() => setRefreshMessage(null), 4000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    // dateStr could be YYYY-MM-DD or ISO
    const date = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo + Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
              <span className="text-white text-lg font-bold">⛽</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-none">
                GasoilRutas
              </h1>
              <p className="text-xs text-slate-400 leading-none mt-0.5">
                Precios diesel en carretera · España
              </p>
            </div>
          </div>

          {/* Center: last update */}
          <div className="hidden sm:flex flex-col items-center">
            <span className="text-xs text-slate-500">Última actualización</span>
            <span className="text-xs font-medium text-slate-300">
              {formatDate(lastUpdated)}
            </span>
          </div>

          {/* Right: refresh button */}
          <div className="flex items-center gap-3">
            {refreshMessage && (
              <span
                className={`text-xs px-2 py-1 rounded ${
                  refreshMessage.includes('Error')
                    ? 'bg-red-900/50 text-red-300'
                    : 'bg-green-900/50 text-green-300'
                }`}
              >
                {refreshMessage}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200
                ${
                  isRefreshing
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-400/30 active:scale-95'
                }
              `}
            >
              <span
                className={`text-base ${isRefreshing ? 'spinning' : ''}`}
                style={
                  isRefreshing
                    ? { display: 'inline-block', animation: 'spin 1s linear infinite' }
                    : {}
                }
              >
                ↻
              </span>
              <span className="hidden sm:inline">
                {isRefreshing ? 'Actualizando...' : 'Actualizar Precios'}
              </span>
              <span className="sm:hidden">
                {isRefreshing ? '...' : 'Actualizar'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile last updated */}
        <div className="sm:hidden pb-2 text-center">
          <span className="text-xs text-slate-500">
            Actualizado: {formatDate(lastUpdated)}
          </span>
        </div>
      </div>
    </header>
  );
}
