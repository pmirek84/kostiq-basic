import { useMemo, useState } from 'react';
import { useJobs } from '../context/JobsContext';
import type { JobStatus, Job } from '../models/types';
import {
    Briefcase,
    Calendar,
    Clock,
    AlertTriangle,
    Search,
    Filter,
    Plus,
    FileText,
    MapPin,
    User,
    TrendingUp,
    AlertCircle,
    Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, isFuture, format } from 'date-fns';
import { pl } from 'date-fns/locale';
import JobPreviewModal from '../components/jobs/JobPreviewModal';

export const JobsPage = () => {
    const { jobs, deleteJob } = useJobs();
    const navigate = useNavigate();

    const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [riskFilter, setRiskFilter] = useState<boolean>(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [previewJob, setPreviewJob] = useState<Job | null>(null);

    // KPI Calculations
    const kpiStats = useMemo(() => {
        const active = jobs.filter(j => j.status === 'in_progress');
        const planned = jobs.filter(j => j.status === 'planned');

        const totalActiveValue = active.reduce((acc, curr) => acc + (curr.totalPlannedRevenueNet || curr.revenuePlannedNet || 0), 0);
        const upcoming30Days = planned.filter(j =>
            j.plannedStartDate && differenceInDays(new Date(j.plannedStartDate), new Date()) <= 30 && isFuture(new Date(j.plannedStartDate))
        ).length;

        const avgMargin = active.length > 0
            ? active.reduce((acc, curr) => acc + (curr.marginPlannedPercent || 0), 0) / active.length
            : 0;

        return {
            activeCount: active.length,
            activeValue: totalActiveValue,
            upcomingCount: upcoming30Days,
            avgMargin: avgMargin
        };
    }, [jobs]);

    // Filtering
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
            const matchesSearch =
                (job.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (job.jobCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (job.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (job.location || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRisk = riskFilter ? job.riskFlag !== 'none' : true;

            return matchesStatus && matchesSearch && matchesRisk;
        });
    }, [jobs, statusFilter, searchQuery, riskFilter]);

    const getStatusBadge = (status: JobStatus) => {
        const styles = {
            draft: 'bg-gray-100 text-gray-800',
            planned: 'bg-teal-50 text-teal-800 border border-teal-100/50 font-semibold',
            in_progress: 'bg-amber-100 text-amber-800',
            paused: 'bg-orange-100 text-orange-800',
            done: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800'
        };
        const labels = {
            draft: 'Szkic',
            planned: 'Zaplanowane',
            in_progress: 'W realizacji',
            paused: 'Wstrzymane',
            done: 'Zakończone',
            cancelled: 'Anulowane'
        };
        return (
            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>
                {labels[status]}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header with Title and Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-950">Zlecenia</h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Zarządzanie montażami i realizacjami
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/offers?filter=accepted')}
                        className="px-4 py-2 border border-black/10 hover:bg-zinc-50 text-zinc-900 rounded-xl text-sm font-semibold transition-all flex items-center"
                    >
                        <Briefcase className="w-4 h-4 mr-2 text-zinc-500" />
                        Z ofert
                    </button>
                    <button
                        onClick={() => navigate('/jobs/new')}
                        className="px-4 py-2 bg-black hover:bg-zinc-800 text-white rounded-xl text-sm font-semibold transition-all flex items-center"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nowe zlecenie
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-black/10">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">W realizacji</p>
                            <h3 className="text-2xl font-bold text-zinc-900 mt-2">{kpiStats.activeCount}</h3>
                            <p className="text-sm text-zinc-650 mt-1">
                                Wartość: {kpiStats.activeValue.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                            </p>
                        </div>
                        <div className="p-3 bg-amber-55/40 rounded-xl">
                            <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-black/10">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">Nadchodzące (30 dni)</p>
                            <h3 className="text-2xl font-bold text-zinc-900 mt-2">{kpiStats.upcomingCount}</h3>
                            <p className="text-sm text-zinc-650 mt-1">Zaplanowane montaże</p>
                        </div>
                        <div className="p-3 bg-teal-50/50 rounded-xl">
                            <Calendar className="w-6 h-6 text-[#21808D]" />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-black/10">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-zinc-500">Średnia marża (aktywne)</p>
                            <h3 className={`text-2xl font-bold mt-2 ${kpiStats.avgMargin < 15 ? 'text-red-600' : 'text-green-600'}`}>
                                {kpiStats.avgMargin.toFixed(1)}%
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">Cel: {'>'} 18%</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                            <TrendingUp className="w-6 h-6 text-green-600" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-black/10 space-y-4">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    {/* Status Tabs */}
                    <div className="flex overflow-x-auto pb-2 md:pb-0 gap-1">
                        {[
                            { id: 'all', label: 'Wszystkie' },
                            { id: 'in_progress', label: 'W realizacji' },
                            { id: 'planned', label: 'Zaplanowane' },
                            { id: 'done', label: 'Zakończone' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setStatusFilter(tab.id as any);
                                    setRiskFilter(false);
                                }}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors border ${statusFilter === tab.id
                                    ? 'bg-teal-50 text-[#21808D] border-teal-100/50'
                                    : 'bg-white text-zinc-650 border-transparent hover:bg-zinc-50 hover:border-black/10'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setRiskFilter(!riskFilter)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors flex items-center border ${riskFilter
                                ? 'bg-red-50 text-red-700 border-red-100/50'
                                : 'bg-white text-zinc-650 border-transparent hover:bg-zinc-50 hover:border-black/10'
                                }`}
                        >
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Ryzykowne
                        </button>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Szukaj zlecenia, klienta..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-black/10 rounded-xl focus:ring-2 focus:ring-[#21808D] focus:border-[#21808D] outline-none transition-all"
                            />
                        </div>
                        <button className="p-2 border border-black/10 rounded-xl hover:bg-zinc-50 text-zinc-650">
                            <Filter className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Jobs Table */}
            <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-zinc-50/50 border-b border-black/10 text-xs text-zinc-500 font-semibold tracking-wider">
                                <th className="px-6 py-4 font-semibold">Kod / Nazwa</th>
                                <th className="px-6 py-4 font-semibold">Klient</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold">Termin</th>
                                <th className="px-6 py-4 font-semibold">Lokalizacja</th>
                                <th className="px-6 py-4 font-semibold">Wartość zlecenia</th>
                                <th className="px-6 py-4 font-semibold">Marża / ROI</th>
                                <th className="px-6 py-4 font-semibold text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {filteredJobs.length > 0 ? (
                                filteredJobs.map((job) => (
                                    <tr key={job.id} className="hover:bg-zinc-50/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span
                                                    onClick={() => navigate(`/jobs/${job.id}`)}
                                                    className="font-semibold text-zinc-900 hover:text-[#21808D] hover:underline cursor-pointer"
                                                >
                                                    {job.jobCode}
                                                </span>
                                                <span className="text-sm text-zinc-650 mt-0.5">{job.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center text-gray-700">
                                                <User className="w-4 h-4 mr-2 text-gray-400" />
                                                <span className="text-sm">{job.clientName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(job.status)}
                                            {job.riskFlag !== 'none' && (
                                                <span className="ml-2 inline-flex items-center text-red-600" title={`Ryzyko: ${job.riskFlag}`}>
                                                    <AlertCircle className="w-4 h-4" />
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col text-sm">
                                                <span className="text-gray-900">
                                                    {job.plannedStartDate ? format(new Date(job.plannedStartDate), 'dd MMM yyyy', { locale: pl }) : '-'}
                                                </span>
                                                {job.plannedEndDate && (
                                                    <span className="text-gray-500 text-xs">
                                                        do {format(new Date(job.plannedEndDate), 'dd MMM', { locale: pl })}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center text-gray-500 text-sm">
                                                <MapPin className="w-4 h-4 mr-1.5" />
                                                {job.location}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-medium text-gray-900">
                                                {job.totalPlannedRevenueNet || job.revenuePlannedNet ? (job.totalPlannedRevenueNet || job.revenuePlannedNet)?.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) : '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const revenue = job.totalPlannedRevenueNet || job.revenuePlannedNet || 0;
                                                const cost = job.plannedTotalCost || (
                                                    (job.materialsPlannedNet || 0) + 
                                                    (job.laborPlannedNet || 0) + 
                                                    (job.logisticsPlannedNet || 0) + 
                                                    (job.equipmentPlannedNet || 0)
                                                );
                                                const marginPercent = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
                                                const isLowMargin = marginPercent < 18;

                                                return (
                                                    <span className={`text-sm font-semibold inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
                                                        isLowMargin 
                                                            ? 'text-red-700 bg-red-50 border border-red-150 animate-pulse' 
                                                            : 'text-green-700 bg-green-50 border border-green-150'
                                                    }`}>
                                                        {marginPercent.toFixed(1)}%
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 relative z-10">
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setPreviewJob(job);
                                                    }}
                                                    className="p-1.5 text-zinc-400 hover:text-[#21808D] hover:bg-teal-50/50 rounded-xl transition-colors cursor-pointer"
                                                    title="Szybki podgląd"
                                                >
                                                    <Search className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        navigate(`/jobs/${job.id}`);
                                                    }}
                                                    className="p-1.5 text-zinc-400 hover:text-[#21808D] hover:bg-teal-50/50 rounded-xl transition-colors cursor-pointer"
                                                    title="Szczegóły"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setDeleteConfirmation(job.id);
                                                    }}
                                                    className="p-1.5 text-zinc-400 hover:text-red-650 hover:bg-red-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-red-150/30"
                                                    title="Usuń"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        Brak zleceń spełniających kryteria wyszukiwania.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Delete Confirmation Modal */}
            {deleteConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
                    <div className="bg-white rounded-2xl border border-black/10 shadow-2xl w-full max-w-md p-6">
                        <div className="flex items-center gap-4 mb-4 text-red-600">
                            <div className="p-3 bg-red-50 rounded-xl">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900">Usuwanie zlecenia</h3>
                        </div>
                        <p className="text-zinc-650 mb-6">
                            Czy na pewno chcesz usunąć zlecenie <span className="font-bold text-zinc-950">{jobs.find(j => j.id === deleteConfirmation)?.jobCode}</span>?
                            <br />
                            Tej operacji nie można cofnąć.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirmation(null)}
                                className="px-4 py-2 text-zinc-650 hover:bg-zinc-50 rounded-xl font-medium transition-colors"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={async () => {
                                    if (deleteConfirmation) {
                                        try {
                                            const targetJob = jobs.find(j => j.id === deleteConfirmation);
                                            await deleteJob(deleteConfirmation, targetJob?.editVersion);
                                            setDeleteConfirmation(null);
                                        } catch (err) {
                                            console.error('Failed to delete job:', err);
                                            alert('Wystąpił błąd podczas usuwania zlecenia.');
                                        }
                                    }
                                }}
                                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-semibold transition-colors shadow-none"
                            >
                                Usuń zlecenie
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Preview Modal */}
            {previewJob && (
                <JobPreviewModal
                    job={previewJob}
                    onClose={() => setPreviewJob(null)}
                />
            )}
        </div>
    );
};

export default JobsPage;
