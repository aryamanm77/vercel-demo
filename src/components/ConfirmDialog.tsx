import React from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  consequenceNote?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'destructive' | 'violet';
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
      ? 'bg-[#B42318] hover:bg-[#911B12] text-white'
      : variant === 'violet'
      ? 'bg-[#6D5CE8] hover:bg-[#5847D6] text-white'
      : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17243A]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white border border-[#D9E2EF] shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9E2EF] bg-[#F5F7FB]">
          <div className="flex items-center gap-2.5">
            {variant === 'destructive' ? (
              <AlertTriangle className="w-5 h-5 text-[#B42318] shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#2563EB] shrink-0" />
            )}
            <h3 id="dialog-title" className="text-base font-bold text-[#17243A]">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded-md text-[#64748B] hover:text-[#1F2937] hover:bg-slate-200/60 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-[#1F2937] leading-relaxed">{description}</p>

          {consequenceNote && (
            <div className="p-3.5 rounded-md bg-[#F5F7FB] border border-[#D9E2EF] text-xs text-[#1F2937] space-y-1">
              <div className="font-semibold text-[#17243A]">Institutional Consequence & Audit Rule:</div>
              <div className="text-[#64748B] leading-relaxed">{consequenceNote}</div>
            </div>
          )}

          {children}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#D9E2EF] bg-[#F5F7FB]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-[#1F2937] bg-white border border-[#D9E2EF] rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${btnStyle}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
