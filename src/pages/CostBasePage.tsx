import { Package, Hammer, Truck, Settings as SettingsIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import MaterialsTab from '../components/costbase/MaterialsTab';
import RatesTab from '../components/costbase/RatesTab';
import LogisticsTab from '../components/costbase/LogisticsTab';
import RentalTab from '../components/costbase/RentalTab';
import FlashingsTab from '../components/costbase/FlashingsTab';

type TabId = 'materials' | 'rates' | 'logistics' | 'rental' | 'flashings';

export default function CostBasePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = (searchParams.get('tab') as TabId) || 'materials';

    const setActiveTab = (tab: TabId) => {
        setSearchParams({ tab });
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Baza Kosztów i Standardy</h1>
                    <p className="text-sm text-slate-500 mt-1">Zarządzaj katalogiem materiałów, stawkami i standardami montażu</p>
                </div>
            </div>

            <div className="mt-8">
                <nav className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
                    <TabButton id="materials" label="Materiały" icon={<Package className="h-4 w-4" />} activeTab={activeTab} onClick={setActiveTab} />
                    <TabButton id="rates" label="Stawki Montażu" icon={<Hammer className="h-4 w-4" />} activeTab={activeTab} onClick={setActiveTab} />
                    <TabButton id="logistics" label="Logistyka" icon={<Truck className="h-4 w-4" />} activeTab={activeTab} onClick={setActiveTab} />
                    <TabButton id="rental" label="Wynajem sprzętu" icon={<SettingsIcon className="h-4 w-4" />} activeTab={activeTab} onClick={setActiveTab} />
                    <TabButton id="flashings" label="Obróbki" icon={<SettingsIcon className="h-4 w-4" />} activeTab={activeTab} onClick={setActiveTab} />
                </nav>
            </div>

            <div className="mt-6 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                {activeTab === 'materials' && <MaterialsTab />}
                {activeTab === 'rates' && <RatesTab />}
                {activeTab === 'logistics' && <LogisticsTab />}
                {activeTab === 'rental' && <RentalTab />}
                {activeTab === 'flashings' && <FlashingsTab />}
            </div>
        </div>
    );
}

function TabButton({ id, label, icon, activeTab, onClick }: { id: TabId, label: string, icon: React.ReactNode, activeTab: TabId, onClick: (id: TabId) => void }) {
    const isActive = activeTab === id;
    return (
        <button
            onClick={() => onClick(id)}
            className={`group inline-flex items-center py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200 ${isActive
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
        >
            <span className={`mr-2.5 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`}>
                {icon}
            </span>
            {label}
        </button>
    );
}
