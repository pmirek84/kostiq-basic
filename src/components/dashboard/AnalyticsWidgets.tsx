import { AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';
import { useState, useEffect, useMemo } from 'react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

interface EmployeeStat {
    id: string;
    name: string;
    hours: number;
    entries: number;
}

export function EmployeePerformanceWidget() {
    const navigate = useNavigate();
    const [employeeStats, setEmployeeStats] = useState<EmployeeStat[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`${API_BASE}/analytics/employee-performance`, { headers: getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setEmployeeStats(data);
                }
            } catch (e) {
                console.error('Failed to fetch employee performance analytics', e);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full shadow-sm">
            <h3 className="text-slate-800 font-semibold mb-5 text-base tracking-tight">Wydajność pracowników (Top 5)</h3>

            <div>
                {loading ? (
                    <div className="text-center py-8 text-slate-400 text-sm">Ładowanie danych...</div>
                ) : employeeStats.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-sm">Brak wpisów czasu pracy</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {employeeStats.map((emp, i) => {
                            const initials = emp.name.split(' ').map(n => n[0]).join('').slice(0, 2);
                            return (
                                <div
                                    key={i}
                                    onClick={() => navigate('/tico')}
                                    className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
                                >
                                    {/* Rank + Avatar */}
                                    <span className="text-[10px] text-slate-400 font-bold w-4 text-center">{i + 1}</span>
                                    <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-bold text-teal-600">{initials}</span>
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate group-hover:text-teal-600 transition-colors">{emp.name}</p>
                                    </div>

                                    {/* Hours pill + Entries */}
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="bg-teal-50 text-teal-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-teal-200">
                                            {Math.round(emp.hours)}h
                                        </span>
                                        <span className="text-slate-400 text-xs w-8 text-right">
                                            {emp.entries} wp.
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

interface RiskJob {
    jobId: string;
    code: string;
    client: string;
    issue: string;
    val: string;
    severity: 'low' | 'high';
}

export function RiskJobsWidget() {
    const navigate = useNavigate();
    const [risks, setRisks] = useState<RiskJob[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRisks = async () => {
            try {
                const res = await fetch(`${API_BASE}/analytics/job-risks`, { headers: getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setRisks(data);
                }
            } catch (e) {
                console.error('Failed to fetch job risks analytics', e);
            } finally {
                setLoading(false);
            }
        };
        fetchRisks();
    }, []);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full shadow-sm">
            <h3 className="text-slate-800 font-semibold mb-6 text-base tracking-tight">Zlecenia ryzykowne</h3>

            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-8 text-slate-400 text-sm">Ładowanie danych...</div>
                ) : risks.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <TrendingUp className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                        <p className="text-sm">Brak zleceń zagrożonych</p>
                    </div>
                ) : risks.map((risk: any, i) => {
                    const color = risk.severity === 'high' ? '#ef4444' : '#f59e0b';
                    const bg = risk.severity === 'high' ? 'bg-red-50' : 'bg-amber-50';
                    const border = risk.severity === 'high' ? 'border-red-200' : 'border-amber-200';

                    return (
                        <div
                            key={i}
                            onClick={() => navigate(`/jobs/${risk.jobId}`)}
                            className={`flex items-center justify-between p-3 rounded-lg ${bg} border ${border} transition cursor-pointer hover:border-opacity-70`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border border-slate-100">
                                    <AlertTriangle className="h-4 w-4" style={{ color }} />
                                </div>
                                <div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-slate-700 text-sm font-medium">{risk.code}</span>
                                        <span className="text-[10px] px-1.5 rounded bg-white/50" style={{ color }}>{risk.issue}</span>
                                    </div>
                                    <p className="text-slate-400 text-xs truncate max-w-[140px]">{risk.client}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-sm font-bold" style={{ color }}>{risk.val}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function WorkloadWidget() {
    const navigate = useNavigate();
    const { jobs } = useJobs();
    const { employees: ticoEmployees } = useTiCo();

    const { weeklyLoad, totalCapacityH, usedH } = useMemo(() => {
        const activeJobs = jobs.filter(j => j.status === 'in_progress');
        const empCount = Math.max(ticoEmployees.length, 1);
        const totalCapacity = empCount * 8 * 14;
        const usedCapacity = activeJobs.length * 16 * 2;
        const load = totalCapacity > 0 ? Math.min(Math.round((usedCapacity / totalCapacity) * 100), 120) : 0;
        return { weeklyLoad: load, totalCapacityH: totalCapacity, usedH: usedCapacity };
    }, [jobs, ticoEmployees]);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full flex flex-col relative group shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-slate-800 font-semibold text-base tracking-tight">Obłożenie ekip (14 dni)</h3>
                <button
                    onClick={() => navigate('/calendar')}
                    className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors z-10"
                >
                    Kalendarz &rarr;
                </button>
            </div>

            <div
                onClick={() => navigate('/calendar')}
                className="flex flex-col items-center justify-center py-4 cursor-pointer hover:scale-105 transition-transform"
            >
                <div className="relative h-32 w-32 flex items-center justify-center">
                    <svg className="h-full w-full transform -rotate-90">
                        <circle cx="50%" cy="50%" r="56" stroke="currentColor" strokeWidth="10" className="text-slate-100" fill="transparent" />
                        <circle cx="50%" cy="50%" r="56" stroke="currentColor" strokeWidth="10" className={weeklyLoad > 90 ? 'text-red-500' : weeklyLoad > 70 ? 'text-amber-500' : 'text-teal-500'} fill="transparent" strokeDasharray="351" strokeDashoffset={351 - (351 * Math.min(weeklyLoad, 100)) / 100} strokeLinecap="round" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                        <span className={`text-3xl font-bold ${weeklyLoad > 90 ? 'text-red-500' : 'text-slate-800'}`}>{weeklyLoad}%</span>
                        <span className="text-xs text-slate-400">Obłożenie</span>
                    </div>
                </div>
            </div>

            <div className="mt-6 space-y-3">
                <div className="flex justify-between text-xs border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Aktywne zlecenia:</span>
                    <span className="text-slate-700 font-medium">{jobs.filter(j => j.status === 'in_progress').length}</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Wolne godziny:</span>
                    <span className="text-slate-700 font-medium">{Math.max(totalCapacityH - usedH, 0)}h / {totalCapacityH}h</span>
                </div>
            </div>
        </div>
    );
}
