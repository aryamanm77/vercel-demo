import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileBarChart2,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { InstitutionLogo } from '../components/InstitutionLogo';
import { useAuth } from '../hooks/useAuth';

interface NavGroup {
  section: string;
  items: {
    label: string;
    to: string;
    icon: React.ComponentType<{ className?: string }>;
    matchExact?: boolean;
  }[];
}

const PRINCIPAL_NAV_GROUPS: NavGroup[] = [
  {
    section: 'OVERVIEW',
    items: [
      { label: 'Dashboard', to: '/admin/principal/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    section: 'INSTITUTION MANAGEMENT',
    items: [
      { label: 'Departments', to: '/admin/principal/departments', icon: Building2 },
      { label: 'Academic Structure', to: '/admin/principal/academic-structure', icon: GraduationCap, matchExact: true },
      { label: 'Subjects and Semesters', to: '/admin/principal/academic-structure?tab=subjects', icon: BookOpen },
      { label: 'Sections', to: '/admin/principal/academic-structure?tab=sections', icon: Layers },
    ],
  },
  {
    section: 'USER MANAGEMENT',
    items: [
      { label: 'HOD Accounts', to: '/admin/principal/users?role=HOD', icon: UserCheck },
      { label: 'Staff Accounts', to: '/admin/principal/users?role=ACADEMIC_STAFF', icon: Users },
    ],
  },
  {
    section: 'REPORTS',
    items: [
      { label: 'Institution Reports', to: '/admin/principal/reports', icon: FileBarChart2, matchExact: true },
      { label: 'Department Analytics', to: '/admin/principal/reports?view=analytics', icon: BarChart3 },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Audit Logs', to: '/admin/principal/audit-logs', icon: ClipboardList },
      { label: 'Profile', to: '/admin/principal/profile', icon: UserCircle },
      { label: 'Settings', to: '/admin/principal/settings', icon: Settings },
    ],
  },
];

export const PrincipalLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentFullUrl = `${location.pathname}${location.search}`;

  const isNavItemActive = (itemTo: string, matchExact?: boolean) => {
    if (itemTo.includes('?')) {
      return currentFullUrl === itemTo;
    }
    if (matchExact) {
      return location.pathname === itemTo && !location.search;
    }
    return location.pathname === itemTo;
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F5F7FB] text-[#1F2937]">
      {/* Mobile Header Bar */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#17243A] text-white border-b border-slate-800">
        <InstitutionLogo variant="mobile-bar" subtitle="Principal Administration Portal" />
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-md text-slate-200 hover:bg-white/10"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#17243A] text-white flex flex-col h-full z-10 overflow-y-auto">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <InstitutionLogo variant="sidebar-expanded" subtitle="Principal Admin Portal" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-5">
              {PRINCIPAL_NAV_GROUPS.map((group) => (
                <div key={group.section}>
                  <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
                    {group.section}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isNavItemActive(item.to, item.matchExact);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                            active
                              ? 'bg-[#2563EB] text-white'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-red-300 hover:bg-red-500/15 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Fixed/Sticky Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#17243A] text-white border-r border-slate-800 sticky top-0 h-screen transition-all duration-150 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between gap-2">
          {collapsed ? (
            <InstitutionLogo variant="sidebar-collapsed" />
          ) : (
            <InstitutionLogo variant="sidebar-expanded" subtitle="Principal Admin Portal" />
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {PRINCIPAL_NAV_GROUPS.map((group) => (
            <div key={group.section}>
              {!collapsed && (
                <div className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400">
                  {group.section}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(item.to, item.matchExact);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#2563EB] text-white shadow-xs'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom User Profile & Logout */}
        <div className="p-3 border-t border-white/10 bg-[#131E31]">
          {!collapsed && user && (
            <div className="px-2 py-1.5 mb-2">
              <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
              <div className="text-[11px] text-slate-400 truncate">
                {user.employeeId} · Principal Office
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-red-500/20 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#D9E2EF] px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span className="text-xs font-semibold text-[#17243A] whitespace-nowrap">
              Central Administrative Environment
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs text-[#64748B] truncate">
              Role: Principal & Chief Institutional Administrator
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#64748B]">
              <span>Academic Year: <strong className="text-[#1F2937]">2026–2027</strong></span>
              <span aria-hidden="true">·</span>
              <span>Employee ID: <strong className="font-mono text-[#1F2937]">{user?.employeeId}</strong></span>
            </div>
            <Link
              to="/admin/principal/profile"
              className="px-3 py-1.5 text-xs font-medium text-[#1F2937] bg-[#F5F7FB] border border-[#D9E2EF] rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {user?.fullName || 'Principal Profile'}
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
