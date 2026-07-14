import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TimeRegistrationView } from './views/TimeRegistrationView';
import { EmployeesView } from './views/EmployeesView';
import { SubcontractorsView } from './views/SubcontractorsView';
import { PayrollView } from './views/PayrollView';
import { ReportsView } from './views/ReportsView';
import { ApprovalsView } from './views/ApprovalsView';
import { RequestsView } from './views/RequestsView';
import { CrewsView } from './views/CrewsView';

export default function TiCoPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('time');

    // Handle deep linking via query params
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        const params: Record<string, string> = { tab };
        const from = searchParams.get('from');
        const jobId = searchParams.get('jobId');
        const workerId = searchParams.get('workerId');
        if (from) params.from = from;
        if (jobId) params.jobId = jobId;
        if (workerId) params.workerId = workerId;
        setSearchParams(params);
    };

    const getTabClass = (id: string) => `px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === id ? 'bg-zinc-950 text-white shadow-sm border-zinc-950' : 'bg-white text-zinc-600 border-transparent hover:bg-zinc-50 hover:border-black/10'}`;

    // Filters for Payroll View
    const payrollJobId = searchParams.get('jobId') || undefined;
    const payrollWorkerId = searchParams.get('workerId') || undefined;
    const fromPath = searchParams.get('from');

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-950">KOSTIQ: Zarządzanie realizacją</h1>
                    <p className="text-zinc-500 text-sm">System zarządzania czasem pracy, kosztami i realizacją zleceń</p>
                </div>
                {fromPath && (
                    <button
                        onClick={() => navigate(fromPath)}
                        className="flex items-center gap-1.5 px-4 py-2 border border-zinc-200 hover:bg-zinc-50 bg-white rounded-xl text-sm font-semibold transition-all text-zinc-700 shadow-sm"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Powrót do Zlecenia
                    </button>
                )}
            </header>

            {/* Navigation Tabs */}
            <div className="bg-white rounded-2xl border border-black/10 p-2 overflow-x-auto">
                <nav className="flex space-x-1 min-w-max">
                    <button onClick={() => handleTabChange('time')} className={getTabClass('time')}>Rejestracja</button>
                    <button onClick={() => handleTabChange('approvals')} className={getTabClass('approvals')}>Akceptacja</button>
                    <button onClick={() => handleTabChange('requests')} className={getTabClass('requests')}>Wnioski</button>
                    <button onClick={() => handleTabChange('payroll')} className={getTabClass('payroll')}>Rozliczenia</button>
                    <button onClick={() => handleTabChange('reports')} className={getTabClass('reports')}>Raporty</button>
                    <div className="w-px bg-black/10 mx-2 h-6 self-center"></div>
                    <button onClick={() => handleTabChange('employees')} className={getTabClass('employees')}>Pracownicy</button>
                    <button onClick={() => handleTabChange('crews')} className={getTabClass('crews')}>Brygady</button>
                    <button onClick={() => handleTabChange('subcontractors')} className={getTabClass('subcontractors')}>Podwykonawcy</button>
                </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'time' && <TimeRegistrationView />}
                {activeTab === 'approvals' && <ApprovalsView />}
                {activeTab === 'requests' && <RequestsView />}
                {activeTab === 'payroll' && (
                    <PayrollView
                        initialJobId={payrollJobId}
                        initialWorkerId={payrollWorkerId}
                    />
                )}
                {activeTab === 'reports' && <ReportsView />}
                {activeTab === 'employees' && <EmployeesView />}
                {activeTab === 'crews' && <CrewsView />}
                {activeTab === 'subcontractors' && <SubcontractorsView />}
            </div>
        </div>
    );
}
