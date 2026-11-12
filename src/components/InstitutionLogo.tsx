import React, { useState } from 'react';

export const OFFICIAL_MIT_LOGO_PATH = '/assets/aistudio/Screenshot_2026-11-12_004631_2c4ed21f.png';

interface InstitutionLogoProps {
  variant?: 'sidebar-expanded' | 'sidebar-collapsed' | 'login' | 'mobile-bar';
  subtitle?: string;
}

export const InstitutionLogo: React.FC<InstitutionLogoProps> = ({
  variant = 'sidebar-expanded',
  subtitle = 'Examination Management System',
}) => {
  const [imgError, setImgError] = useState(false);

  const renderLogoMark = (sizeClasses: string) => (
    <div
      className={`shrink-0 rounded-full bg-white p-1 flex items-center justify-center shadow-xs border border-[#D9E2EF]/40 ${sizeClasses}`}
      title="Maharaja Institute of Technology Mysore"
    >
      {!imgError ? (
        <img
          src={OFFICIAL_MIT_LOGO_PATH}
          alt="Maharaja Institute of Technology Mysore Official Logo"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain select-none"
        />
      ) : (
        <span className="text-xs font-bold text-[#17243A] tracking-tight">MITM</span>
      )}
    </div>
  );

  if (variant === 'sidebar-collapsed') {
    return (
      <div className="flex items-center justify-center py-1" title="Maharaja Institute of Technology Mysore">
        {renderLogoMark('w-10 h-10')}
      </div>
    );
  }

  if (variant === 'mobile-bar') {
    return (
      <div className="flex items-center gap-2.5">
        {renderLogoMark('w-9 h-9')}
        <div className="min-w-0">
          <div className="text-xs font-bold text-white leading-tight truncate">
            Maharaja Institute of Technology Mysore
          </div>
          <div className="text-[11px] text-slate-300 leading-tight truncate">
            {subtitle}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'login') {
    return (
      <div className="flex items-center gap-3.5">
        {renderLogoMark('w-14 h-14 p-1.5')}
        <div>
          <div className="text-base sm:text-lg font-bold text-[#17243A] leading-snug tracking-tight">
            Maharaja Institute of Technology Mysore
          </div>
          <div className="text-xs sm:text-sm font-medium text-[#64748B]">
            {subtitle}
          </div>
        </div>
      </div>
    );
  }

  // Default: sidebar-expanded
  return (
    <div className="flex items-center gap-3">
      {renderLogoMark('w-11 h-11')}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-white leading-snug tracking-tight">
          Maharaja Institute of Technology Mysore
        </div>
        <div className="text-[11px] text-slate-300 leading-tight mt-0.5 truncate">
          {subtitle}
        </div>
      </div>
    </div>
  );
};
