import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const normalized = status.trim().toUpperCase();

  let toneClasses = 'bg-slate-100 text-slate-700 border-slate-300';
  let Icon = Clock;

  if (
    normalized === 'READY' ||
    normalized === 'VALID' ||
    normalized === 'LIVE' ||
    normalized === 'ACTIVE' ||
    normalized === 'FINISHED' ||
    normalized === 'SELECTED' ||
    normalized === 'UP' ||
    normalized === 'OK' ||
    normalized === 'INTACT'
  ) {
    toneClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    Icon = CheckCircle2;
  } else if (normalized === 'FROZEN' || normalized === 'ENDED' || normalized === 'ARCHIVED') {
    toneClasses = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    Icon = Lock;
  } else if (
    normalized === 'DRAFT' ||
    normalized === 'WARNING' ||
    normalized === 'GENERATED' ||
    normalized === 'NOT_STARTED' ||
    normalized === 'EMPTY' ||
    normalized === 'SAVING' ||
    normalized === 'EXCLUDED'
  ) {
    toneClasses = 'bg-amber-50 text-amber-800 border-amber-200';
    Icon = AlertCircle;
  } else if (
    normalized === 'ERROR' ||
    normalized === 'DISCONNECTED' ||
    normalized === 'DISABLED' ||
    normalized === 'LOCKED' ||
    normalized === 'BROKEN' ||
    normalized === 'SHORT'
  ) {
    toneClasses = 'bg-red-50 text-red-800 border-red-200';
    Icon = XCircle;
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded border whitespace-nowrap shrink-0 ${padding} ${toneClasses}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
};
