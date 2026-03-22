'use client';

interface PriceTrendProps {
  trend: 'up' | 'down' | 'stable' | 'unknown';
  size?: 'sm' | 'md' | 'lg';
}

export function PriceTrend({ trend, size = 'md' }: PriceTrendProps) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  if (trend === 'unknown') {
    return (
      <span
        className={`${sizeClasses[size]} text-slate-500`}
        title="Sin datos históricos"
      >
        —
      </span>
    );
  }

  if (trend === 'up') {
    return (
      <span
        className={`${sizeClasses[size]} text-red-400 font-bold`}
        title="Precio subiendo vs hace 7 días"
      >
        ↑
      </span>
    );
  }

  if (trend === 'down') {
    return (
      <span
        className={`${sizeClasses[size]} text-green-400 font-bold`}
        title="Precio bajando vs hace 7 días"
      >
        ↓
      </span>
    );
  }

  return (
    <span
      className={`${sizeClasses[size]} text-yellow-400 font-bold`}
      title="Precio estable vs hace 7 días"
    >
      →
    </span>
  );
}

interface TrendBadgeProps {
  trend: 'up' | 'down' | 'stable' | 'unknown';
}

export function TrendBadge({ trend }: TrendBadgeProps) {
  if (trend === 'unknown') return null;

  const config = {
    up: {
      label: 'Subiendo',
      classes: 'bg-red-900/50 text-red-300 border border-red-700',
      icon: '↑',
    },
    down: {
      label: 'Bajando',
      classes: 'bg-green-900/50 text-green-300 border border-green-700',
      icon: '↓',
    },
    stable: {
      label: 'Estable',
      classes: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
      icon: '→',
    },
  };

  const c = config[trend];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.classes}`}
    >
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  );
}
