import { useState } from 'react';
import { BarChart3, Users, Briefcase, HardHat, CheckSquare } from 'lucide-react';
import EmployeeReportsPanel from '../components/reports/EmployeeReportsPanel';
import JobsReportsPanel from '../components/reports/JobsReportsPanel';
import ClosedJobsReportPanel from '../components/reports/ClosedJobsReportPanel';
import DifficultyReportsPanel from '../components/reports/DifficultyReportsPanel';
import SiteEventsReportsPanel from '../components/reports/SiteEventsReportsPanel';

type TabId = 'employees' | 'jobs' | 'closed-jobs' | 'difficulty' | 'site-events';

export default function ReportsDashboard() {
    const [activeTab, setActiveTab] = useState<TabId>('employees');

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Raporty i analityka</h1>
            </div>

            <div className="flex bg-zinc-100 p-1 rounded-xl space-x-1 max-w-fit border border-zinc-200/50">
                <button
                    onClick={() => setActiveTab('employees')}
                    className={`flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${activeTab === 'employees'
                        ? 'bg-zinc-950 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                        }`}
                >
                    <Users className="h-4 w-4 mr-2" strokeWidth={2} />
                    Pracownicy
                </button>
                <button
                    onClick={() => setActiveTab('jobs')}
                    className={`flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${activeTab === 'jobs'
                        ? 'bg-zinc-950 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                        }`}
                >
                    <Briefcase className="h-4 w-4 mr-2" strokeWidth={2} />
                    Zlecenia
                </button>
                <button
                    onClick={() => setActiveTab('closed-jobs')}
                    className={`flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${activeTab === 'closed-jobs'
                        ? 'bg-zinc-950 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                        }`}
                >
                    <CheckSquare className="h-4 w-4 mr-2" strokeWidth={2} />
                    Zamknięte Zlecenia
                </button>
                <button
                    onClick={() => setActiveTab('difficulty')}
                    className={`flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${activeTab === 'difficulty'
                        ? 'bg-zinc-950 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                        }`}
                >
                    <BarChart3 className="h-4 w-4 mr-2" strokeWidth={2} />
                    Trudność i standardy
                </button>
                <button
                    onClick={() => setActiveTab('site-events')}
                    className={`flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${activeTab === 'site-events'
                        ? 'bg-zinc-950 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                        }`}
                >
                    <HardHat className="h-4 w-4 mr-2" strokeWidth={2} />
                    Zdarzenia na budowie
                </button>
            </div>

            <div className="mt-6">
                {activeTab === 'employees' && <EmployeeReportsPanel />}
                {activeTab === 'jobs' && <JobsReportsPanel />}
                {activeTab === 'closed-jobs' && <ClosedJobsReportPanel />}
                {activeTab === 'difficulty' && <DifficultyReportsPanel />}
                {activeTab === 'site-events' && <SiteEventsReportsPanel />}
            </div>
        </div>
    );
}
