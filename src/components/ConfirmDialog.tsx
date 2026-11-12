import React from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  consequenceNote?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'destructive';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  consequenceNote,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
  children,
}) => {
  if (!isOpen) return null;

  const btnStyle =
    variant === 'destructive'
      ? 'bg-red-700 hover:bg-red-800 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            {variant === 'destructive' ? (
              <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
            )}
            <h3 id="dialog-title" className="text-base font-bold text-slate-900">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-800 leading-relaxed">{description}</p>

          {consequenceNote && (
            <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="font-semibold text-slate-900">Action Note:</div>
              <div className="text-slate-600 leading-relaxed">{consequenceNote}</div>
            </div>
          )}

          {children}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors disabled:opacity-50 ${btnStyle}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
