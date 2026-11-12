import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileEdit,
  Lock,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const normalized = status.trim();

  let toneClasses = 'bg-slate-100 text-slate-700 border-slate-300';
  let Icon = FileEdit;

  if (
    normalized === 'Active' ||
    normalized === 'Verified' ||
    normalized === 'Approved / Released' ||
    normalized === 'Completed' ||
    normalized === 'PASS' ||
    normalized === 'Verified by COE'
  ) {
    toneClasses = 'bg-[#16834A]/10 text-[#16834A] border-[#16834A]/30';
    Icon = CheckCircle2;
  } else if (
    normalized === 'Submitted' ||
    normalized === 'Ready for Transfer' ||
    normalized === 'Scheduled' ||
    normalized === 'Stage A: 4 Papers Prepared' ||
    normalized === 'Stage B: Versions A-D Generated'
  ) {
    toneClasses = 'bg-[#2563EB]/10 text-[#2563EB] border-[#2563EB]/30';
    Icon = Send;
  } else if (
    normalized === 'Finalized' ||
    normalized === 'Frozen by COE' ||
    normalized === 'Package Encrypted & Signed'
  ) {
    toneClasses = 'bg-[#6D5CE8]/10 text-[#6D5CE8] border-[#6D5CE8]/30';
    Icon = Lock;
  } else if (
    normalized === 'Pending Approval' ||
    normalized === 'Upcoming' ||
    normalized === 'Correction Requested' ||
    normalized === 'Reset Pending' ||
    normalized === 'Flagged' ||
    normalized === 'Pending Question Bank' ||
    normalized === 'Imported by COE'
  ) {
    toneClasses = 'bg-[#B7791F]/10 text-[#B7791F] border-[#B7791F]/30';
    Icon = normalized === 'Correction Requested' ? ShieldAlert : Clock;
  } else if (
    normalized === 'Validation Failed' ||
    normalized === 'Rejected' ||
    normalized === 'FAIL' ||
    normalized === 'Inactive' ||
    normalized === 'ABSENT'
  ) {
    toneClasses = 'bg-[#B42318]/10 text-[#B42318] border-[#B42318]/30';
    Icon = normalized === 'Inactive' ? AlertCircle : XCircle;
  }

  const padding = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border whitespace-nowrap shrink-0 ${padding} ${toneClasses}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{normalized}</span>
    </span>
  );
};
