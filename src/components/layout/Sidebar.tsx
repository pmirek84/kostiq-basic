import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutGrid,
    Activity,
    FileText,
    Copy,
    Calendar as CalendarIcon,
    Receipt,
    DollarSign,
    ChevronDown,
    ChevronRight,
    Wrench,
    Hammer,
    Truck,
    Scissors,
    Upload,
    Settings,
    BarChart3,
    Briefcase,
    LogOut,
    BookOpen,
    Users
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
    const location = useLocation();
    const { user, logout } = useAuth();
    const [isCostsExpanded, setIsCostsExpanded] = useState(true);

    const isTabActive = (tab: string) => {
        return location.pathname === '/cost-base' && location.search.includes(`tab=${tab}`);
    };

    const isCostsChildActive = location.pathname === '/cost-base' || location.pathname === '/standards' || location.pathname === '/import-time';

    /* ──── Vertical nav item: icon stacked above label ──── */
    const NavItem = ({ to, icon: Icon, children }: { to: string; icon: any; children: React.ReactNode }) => (
        <li>
            <NavLink
                to={to}
                className={({ isActive }) => clsx(
                    'flex flex-col items-center justify-center px-2 py-3 rounded-xl transition-all duration-200 text-center border',
                    isActive
                        ? 'bg-teal-50 border-teal-100/50 text-[#21808D] font-semibold'
                        : 'border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                )}
            >
                <Icon className="w-6 h-6 mb-1" strokeWidth={1.5} />
                <span className="text-[10px] leading-tight font-medium">{children}</span>
            </NavLink>
        </li>
    );

    /* ──── Vertical cost sub-item ──── */
    const CostItem = ({ tab, icon: Icon, label }: { tab: string; icon: any; label: string }) => (
        <li>
            <NavLink
                to={`/cost-base?tab=${tab}`}
                className={() => clsx(
                    'flex flex-col items-center justify-center px-2 py-2.5 rounded-xl transition-all duration-200 text-center border',
                    isTabActive(tab)
                        ? 'bg-teal-50 border-teal-100/50 text-[#21808D] font-semibold'
                        : 'border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                )}
            >
                <Icon className="w-5 h-5 mb-1" strokeWidth={1.5} />
                <span className="text-[10px] leading-tight font-medium">{label}</span>
            </NavLink>
        </li>
    );

    return (
        <aside className="w-[200px] bg-white border-r border-zinc-200 sticky top-0 h-screen overflow-y-auto pt-4 pb-4 flex flex-col print:hidden z-30">
            {/* Logo */}
            <div className="px-4 pt-2 pb-3 text-center">
                <div className="flex justify-center items-center h-10">
                    <img src="/kostiq-logo-transparent.png" alt="KOSTIQ" className="h-8 object-contain" />
                </div>
                <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-[0.2em] block mt-1">Web</span>
            </div>

            {/* Main navigation — vertical grid of items */}
            <nav className="flex-1 px-3 overflow-y-auto">
                <ul className="grid grid-cols-2 gap-1.5 pt-2">
                    <NavItem to="/dashboard" icon={LayoutGrid}>Dashboard</NavItem>
                    <NavItem to="/clients" icon={Activity}>Klienci</NavItem>
                    <NavItem to="/offers" icon={FileText}>Oferty</NavItem>
                    <NavItem to="/offer-templates" icon={Copy}>Wzory</NavItem>
                    <NavItem to="/jobs" icon={Briefcase}>Zlecenia</NavItem>
                    <NavItem to="/calendar" icon={CalendarIcon}>Kalendarz</NavItem>
                    <NavItem to="/reports" icon={BarChart3}>Raporty</NavItem>
                    <NavItem to="/diary" icon={BookOpen}>Dziennik</NavItem>
                    <NavItem to="/orders" icon={Receipt}>Faktury</NavItem>
                    <NavItem to="/tico?tab=crews" icon={Users}>Brygady</NavItem>
                </ul>

                {/* Koszty — expandable section */}
                <div className="mt-4 border-t border-zinc-200 pt-3">
                    <button
                        onClick={() => setIsCostsExpanded(!isCostsExpanded)}
                        className={clsx(
                            "w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-sm",
                            isCostsChildActive ? 'text-zinc-900 font-semibold' : 'text-zinc-500 hover:bg-zinc-50'
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5" strokeWidth={1.5} />
                            <span className="text-xs font-medium">Koszty</span>
                        </div>
                        {isCostsExpanded ? <ChevronDown className="h-4 w-4 text-slate-600" /> : <ChevronRight className="h-4 w-4 text-slate-600" />}
                    </button>

                    {isCostsExpanded && (
                        <ul className="grid grid-cols-2 gap-1.5 mt-1.5">
                            <CostItem tab="materials" icon={FileText} label="Materiały" />
                            <CostItem tab="rates" icon={Hammer} label="Stawki" />
                            <CostItem tab="logistics" icon={Truck} label="Logistyka" />
                            <CostItem tab="flashings" icon={Scissors} label="Obróbki" />
                            <li>
                                <NavLink to="/standards" className={({ isActive }) => clsx('flex flex-col items-center justify-center px-2 py-2.5 rounded-xl transition-all duration-200 text-center border', isActive ? 'bg-zinc-100 border-zinc-200 text-zinc-900 font-semibold shadow-sm' : 'border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800')}>
                                    <Wrench className="w-5 h-5 mb-1" strokeWidth={1.5} />
                                    <span className="text-[10px] leading-tight font-medium">Standardy</span>
                                </NavLink>
                            </li>
                            <li>
                                <NavLink to="/import-time" className={({ isActive }) => clsx('flex flex-col items-center justify-center px-2 py-2.5 rounded-xl transition-all duration-200 text-center border', isActive ? 'bg-zinc-100 border-zinc-200 text-zinc-900 font-semibold shadow-sm' : 'border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800')}>
                                    <Upload className="w-5 h-5 mb-1" strokeWidth={1.5} />
                                    <span className="text-[10px] leading-tight font-medium">Import</span>
                                </NavLink>
                            </li>
                        </ul>
                    )}
                </div>

                {/* Settings link */}
                <div className="mt-3 border-t border-zinc-200 pt-3">
                    <NavLink to="/settings" className={({ isActive }) => clsx('flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-sm border', isActive ? 'bg-zinc-100 border-zinc-200 text-zinc-900 font-semibold' : 'border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800')}>
                        <Settings className="w-5 h-5" strokeWidth={1.5} />
                        <span className="text-xs font-medium">Ustawienia</span>
                    </NavLink>
                </div>
            </nav>

            {/* User Info */}
            {user && (
                <div className="mt-auto pt-3 border-t border-zinc-200 px-4 pb-2">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px]">
                            <p className="text-zinc-800 font-medium truncate">{user.firstName} {user.lastName}</p>
                            <p className="text-zinc-400">{user.role}</p>
                        </div>
                        <button onClick={logout} className="p-1.5 text-zinc-400 hover:text-red-650 rounded-lg transition-colors" title="Wyloguj">
                            <LogOut className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default Sidebar;
