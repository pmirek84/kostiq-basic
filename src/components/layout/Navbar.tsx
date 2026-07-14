
import { Link, useLocation } from 'react-router-dom';
import { Settings, ChevronRight } from 'lucide-react';
import NotificationsDropdown from './NotificationsDropdown';
import GlobalSearch from './GlobalSearch';

const getBreadcrumbName = (segment: string) => {
    switch (segment) {
        case '': return 'Dashboard';
        case 'dashboard': return 'Dashboard';
        case 'offers': return 'Oferty';
        case 'offer-templates': return 'Szablony Ofert';
        case 'clients': return 'Klienci';
        case 'cost-base': return 'Baza Kosztów';
        case 'jobs': return 'Zlecenia';
        case 'orders': return 'Faktury';
        case 'calendar': return 'Kalendarz';
        case 'reports': return 'Raporty';
        case 'standards': return 'Standardy';
        case 'import-time': return 'Import/Eksport';
        case 'tico': return 'TiCo (Rozliczenia)';
        case 'settings': return 'Ustawienia';
        case 'new': return 'Nowy';
        default: return segment;
    }
};

export const Navbar = () => {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = pathSegments.length > 0 ? pathSegments : [''];

    return (
        <nav className="bg-white border-b border-gray-200 print:hidden z-20">
            <div className="w-full px-6">
                <div className="flex justify-between h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0 flex items-center">
                        </div>

                        <nav className="hidden md:flex items-center text-sm font-medium text-slate-450">
                            {breadcrumbs.filter(b => b !== 'dashboard').map((segment, index) => {
                                const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
                                const isLast = index === breadcrumbs.length - 1;
                                const name = getBreadcrumbName(segment);

                                return (
                                    <div key={path} className="flex items-center">
                                        <ChevronRight className="flex-shrink-0 h-4 w-4 mx-2 text-slate-350" />
                                        {isLast ? (
                                            <span className="text-slate-800 font-semibold">{name}</span>
                                        ) : (
                                            <Link
                                                to={path}
                                                className="hover:text-black transition-colors"
                                            >
                                                {name}
                                            </Link>
                                        )}
                                    </div>
                                );
                            })}
                        </nav>

                        <div className="md:hidden ml-4">
                            <h1 className="text-lg font-medium text-slate-800">
                                {getBreadcrumbName(breadcrumbs[breadcrumbs.length - 1] || 'dashboard')}
                            </h1>
                        </div>

                    </div>
                    <div className="flex items-center gap-2">
                        <div className="hidden md:block">
                            <GlobalSearch />
                        </div>
                        <NotificationsDropdown />
                        <Link
                            to="/settings"
                            className="p-2 rounded-full text-slate-500 hover:text-black hover:bg-zinc-100 transition-colors"
                        >
                            <Settings className="w-5 h-5" />
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
};
