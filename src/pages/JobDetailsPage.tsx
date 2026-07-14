import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { toast } from 'sonner';
import {
    ChevronLeft,
    Calendar,
    Users,
    DollarSign,
    FileText,
    CheckSquare,
    Wrench,
    AlertTriangle,
    PlayCircle,
    PauseCircle,
    CheckCircle,
    Copy,
    CreditCard,
    LayoutDashboard,
    Package,
    BarChart,
    PlusCircle,
    Archive,
    ArrowLeft,
    Edit3,
    BookOpen
} from 'lucide-react';

import type { Job, JobStatus } from '../models/types';
import { offerStorage } from '../services/storage/offerStorage';

// Tab Components
import { JobScheduleTab } from '../components/jobs/JobScheduleTab';
import { JobFinancialTab } from '../components/jobs/JobFinancialTab';
import { JobDocumentsTab } from '../components/jobs/JobDocumentsTab';
import { JobChecklistsTab } from '../components/jobs/JobChecklistsTab';
import { JobStagesTab } from '../components/jobs/JobStagesTab';
import { ExtraWorkTab } from '../components/jobs/extrawork/ExtraWorkTab';
import { JobTeamTab } from '../components/jobs/JobTeamTab';
import { JobReportsArchiveTab } from '../components/jobs/JobReportsArchiveTab';
import { ClientReportsTab } from '../components/jobs/reports/ClientReportsTab';
import { JobMaterialsTab } from '../components/jobs/JobMaterialsTab';
import { JobSubcontractorsTab } from '../components/jobs/JobSubcontractorsTab';
import { JobTimeline } from '../components/jobs/timeline/JobTimeline';
import JobInvoicesTab from '../components/jobs/JobInvoicesTab';
import { JobStructuresTab } from '../components/jobs/JobStructuresTab';
import { JobDiaryTab } from '../components/jobs/diary/JobDiaryTab';



import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useOffers } from '../context/OffersContext';

// Helper to calculate margin dynamically if missing
const calculateMargin = (job: Job) => {
    // If we have an explicit value, use it (unless it's 0 and we suspect it wasn't calc'd? No, trust explicit)
    if (job.marginPlannedPercent !== undefined && job.marginPlannedPercent !== null) return job.marginPlannedPercent;

    // Fallback calculation
    const revenue = job.totalPlannedRevenueNet || job.revenuePlannedNet || 0;
    if (revenue <= 0) return null;

    const cost = (job.plannedTotalCost ||
        ((job.materialsPlannedNet || 0) + (job.plannedLaborCost || 0) + (job.logisticsPlannedNet || 0) + (job.otherCostsNet || 0)));

    // Allow cost to be 0 (100% margin)
    if (cost < 0) return null;

    const margin = ((revenue - cost) / revenue) * 100;
    return parseFloat(margin.toFixed(2));
};

const calculateActualMargin = (job: Job) => {
    if (job.marginActualPercent !== undefined && job.marginActualPercent !== null) return job.marginActualPercent;

    const revenue = job.actualRevenue || job.revenueActualNet || 0; // Use actual revenue if tracked, or fallback
    // Often actual revenue = planned if not invoiced differently. Let's use planned revenue if actual is missing? 
    // Usually Actual Margin = (Actual Revenue - Actual Cost) / Actual Revenue.
    // If Actual Revenue is 0, we can't calc actual margin.
    if (revenue <= 0) return null;

    const cost = job.actualTotalCost ||
        ((job.materialsActualNet || 0) + (job.actualLaborCost || 0) + (job.logisticsActualNet || 0) + (job.otherCostsNet || 0)); // Note: otherCosts is usually Net?

    const margin = ((revenue - cost) / revenue) * 100;
    return parseFloat(margin.toFixed(2));
}

const SummaryTab = ({ job }: { job: Job }) => {
    const navigate = useNavigate();
    const { offers } = useOffers();

    // Resolve linked offer for fallback planned costs
    const linkedOffer = React.useMemo(() => {
        const offerId = job.sourceOfferId || job.offerId;
        return offerId ? offers.find(o => o.id === offerId) : undefined;
    }, [job.sourceOfferId, job.offerId, offers]);

    // Cost breakdown from offer (4 buckets or legacy fields)
    const offerCb = linkedOffer?.costBreakdown;
    const plannedMaterials = job.materialsPlannedNet
        || offerCb?.material_cost
        || linkedOffer?.materialsCost || 0;
    const plannedLabor = job.laborPlannedNet
        || offerCb?.assembly_cost
        || linkedOffer?.laborCost || 0;
    const plannedLogistics = job.logisticsPlannedNet
        || offerCb?.transport_cost
        || linkedOffer?.constructionTransportCost || 0;
    const plannedEquipment = job.equipmentPlannedNet
        || offerCb?.equipment_rental_cost
        || linkedOffer?.equipmentRentalCost || 0;
    // totalCost on Offer = totalNet = client price (not own cost)
    const plannedRevenue = job.revenuePlannedNet
        || job.totalPlannedRevenueNet
        || linkedOffer?.totalNet
        || linkedOffer?.totalCost || 0;
    const plannedTotalCost = job.plannedTotalCost
        || (plannedMaterials + plannedLabor + plannedLogistics + plannedEquipment);

    const settledAmount = job.settledLaborCost || 0;
    const actualLaborCost = job.actualLaborCost || 0;
    const difference = actualLaborCost - settledAmount;

    const plannedMargin = calculateMargin(job);
    const actualMargin = calculateActualMargin(job);

    // Live assignment costs from team tab
    const assignedLaborCost = React.useMemo(() =>
        (job.employeeAssignments || []).reduce((sum, a) => sum + a.plannedCost, 0)
        , [job.employeeAssignments]);
    const assignedSubCost = React.useMemo(() =>
        (job.subcontractorAssignments || []).reduce((sum, a) => sum + a.plannedBudget, 0)
        , [job.subcontractorAssignments]);
    const totalAssignedCost = assignedLaborCost + assignedSubCost;
    // Use whichever is higher: offer planned labor vs assigned team total
    const effectiveLaborDisplay = Math.max(plannedLabor, totalAssignedCost);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Basic Data Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Podstawowe dane</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Klient</span>
                            <span className="font-medium text-gray-900">{job.clientName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Lokalizacja</span>
                            <span className="font-medium text-gray-900">{job.location}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Kraj</span>
                            <span className="font-medium text-gray-900">{job.country || 'PL'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">PM</span>
                            <span className="font-medium text-gray-900">{job.projectManager || '-'}</span>
                        </div>
                    </div>
                </div>

                {/* Financial Status Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Finanse</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-500">Przychód planowany (netto)</span>
                                <span className="font-medium text-gray-900">
                                    {plannedRevenue > 0
                                        ? plannedRevenue.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })
                                        : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-500">Koszt własny (Plan)</span>
                                <span className="font-semibold text-gray-900">
                                    {plannedTotalCost > 0
                                        ? plannedTotalCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })
                                        : '-'}
                                </span>
                            </div>
                        </div>

                        {/* Material Stats */}
                        <div className="pt-2 border-t border-gray-100 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Materiały Montażowe</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Koszt (Plan / Rzecz.)</span>
                                <span className="font-medium text-gray-900">
                                    {plannedMaterials.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })} / <span className={(job.materialsActualNet || 0) > plannedMaterials ? 'text-red-600' : 'text-green-600'}>{(job.materialsActualNet || 0).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</span>
                                </span>
                            </div>
                        </div>

                        {/* Logistics Stats */}
                        <div className="pt-2 border-t border-gray-100 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transport / Logistyka</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Koszt (Plan / Rzecz.)</span>
                                <span className="font-medium text-gray-900">
                                    {plannedLogistics.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })} / <span className={(job.logisticsActualNet || 0) > plannedLogistics ? 'text-red-600' : 'text-green-600'}>{(job.logisticsActualNet || 0).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</span>
                                </span>
                            </div>
                        </div>

                        {/* Labor Stats */}
                        <div className="pt-2 border-t border-gray-100 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Robocizna</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Godziny (Plan / Rzecz.)</span>
                                <span className="font-medium text-gray-900">
                                    {job.plannedLaborHours || 0} / <span className={(job.actualLaborHours || 0) > (job.plannedLaborHours || 0) ? 'text-red-600' : 'text-green-600'}>{job.actualLaborHours || 0}</span> h
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Budżet robocizny (Oferta)</span>
                                <span className="font-medium text-gray-900">
                                    {plannedLabor.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })} / <span className={actualLaborCost > effectiveLaborDisplay ? 'text-red-600' : 'text-green-600'}>{actualLaborCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</span>
                                </span>
                            </div>
                            {totalAssignedCost > 0 && (
                                <div className="flex justify-between text-sm bg-indigo-50 -mx-2 px-2 py-1 rounded">
                                    <span className="text-indigo-600 font-medium">📋 Przypisano (Zespół)</span>
                                    <span className={`font-semibold ${totalAssignedCost > plannedLabor ? 'text-red-600' : 'text-indigo-700'}`}>
                                        {totalAssignedCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                        {totalAssignedCost > plannedLabor && <span className="text-xs ml-1 text-red-500">↑ przekroczony budżet</span>}
                                    </span>
                                </div>
                            )}

                            {/* New Settlement Stats */}
                            <div className="mt-2 pt-2 border-t border-gray-100 bg-gray-50 -mx-2 px-2 py-1 rounded">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Rozliczono (Wypłacono)</span>
                                    <span className="font-medium text-blue-600">
                                        {(job.settledLaborCost || 0).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-gray-500">Do rozliczenia</span>
                                    <span className={`font-medium ${difference > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                        {difference.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </span>
                                </div>
                                <button
                                    onClick={() => navigate(`/tico?tab=payroll&jobId=${job.id}&from=${encodeURIComponent(`/jobs/${job.id}`)}`)}
                                    className="text-xs text-blue-500 hover:text-blue-700 mt-1 underline"
                                >
                                    Zobacz rozliczenia (TiCo)
                                </button>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-500">Koszty rzeczywiste (Całość)</span>
                                <span className="font-medium text-gray-900">
                                    {job.actualTotalCost?.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) || '0,00 zł'}
                                </span>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-gray-100">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-500">Marża planowana</span>
                                <span className={`font-bold ${(plannedMargin ?? 0) < 18 ? 'text-red-500' : 'text-green-600'}`}>
                                    {plannedMargin !== null ? `${plannedMargin}%` : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Marża rzeczywista</span>
                                <span className={`font-bold ${(actualMargin ?? 0) < 18 ? 'text-red-500' : 'text-green-600'}`}>
                                    {actualMargin !== null ? `${actualMargin}%` : '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Risk Card */}
                <div className={`p-6 rounded-xl shadow-sm border col-span-1 ${job.riskFlag !== 'none' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                    <h3 className={`text-lg font-semibold mb-4 ${job.riskFlag !== 'none' ? 'text-red-800' : 'text-green-800'}`}>
                        Status Ryzyka
                    </h3>
                    <div className="flex items-start gap-3">
                        {job.riskFlag !== 'none' ? (
                            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                        ) : (
                            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                        )}
                        <div>
                            <p className={`text-sm font-medium ${job.riskFlag !== 'none' ? 'text-red-700' : 'text-green-700'}`}>
                                {job.riskFlag === 'none' ? 'Brak zidentyfikowanych ryzyk' : `Ryzyko: ${job.riskFlag}`}
                            </p>
                            {job.riskComment && (
                                <p className={`text-sm mt-1 ${job.riskFlag !== 'none' ? 'text-red-600' : 'text-green-600'}`}>
                                    {job.riskComment}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <JobTimeline
                job={job}
                onStageClick={(stage) => navigate(`/jobs/${job.id}?tab=stages&stageId=${stage.id}`)}
            />
        </div>
    );
};

// ... (existing helper functions)


export const JobDetailsPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { getJob, updateJob } = useJobs();

    // Default to 'dashboard' instead of 'summary'
    const [activeTab, setActiveTabState] = useState(searchParams.get('tab') || 'dashboard');
    const job = getJob(id || '');
    const isLocked = job?.status === 'done' || job?.status === 'cancelled';

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<Job>>({});

    // Keep activeTab state in sync with URL
    const setActiveTab = (tab: string) => {
        setActiveTabState(tab);
        setSearchParams({ tab });
        // Scroll to top when changing views
        window.scrollTo(0, 0);
    };

    useEffect(() => {
        const tabFromUrl = searchParams.get('tab');
        if (tabFromUrl && tabFromUrl !== activeTab) {
            setActiveTabState(tabFromUrl);
        }
    }, [searchParams]);

    if (!job) {
        return <div className="p-8 text-center">Zlecenie nie znalezione</div>;
    }

    const groups = [
        {
            title: 'Kluczowe',
            items: [
                { id: 'stages', label: 'Etapy', icon: Wrench, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { id: 'structures', label: 'Stolarka', icon: FileText, color: 'text-teal-600', bg: 'bg-teal-50' },
                { id: 'schedule', label: 'Harmonogram', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
            ]
        },
        {
            title: 'Finanse',
            items: [
                { id: 'costs', label: 'Koszty', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { id: 'invoices', label: 'Faktury', icon: CreditCard, color: 'text-teal-600', bg: 'bg-teal-50' },
                { id: 'extrawork', label: 'Prace dodatkowe', icon: PlusCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
            ]
        },
        {
            title: 'Zasoby',
            items: [
                { id: 'team', label: 'Zespół (KOSTIQ)', icon: Users, color: 'text-sky-600', bg: 'bg-sky-50' },
                { id: 'subcontractors', label: 'Podwykonawcy', icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
                { id: 'materials', label: 'Materiały', icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
            ]
        },
        {
            title: 'Dokumentacja',
            items: [
                { id: 'docs', label: 'Dokumenty', icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50' },
                { id: 'diary', label: 'Dziennik budowy', icon: BookOpen, color: 'text-amber-600', bg: 'bg-amber-50' },
                { id: 'archive', label: 'Archiwum PDF', icon: Archive, color: 'text-rose-600', bg: 'bg-rose-50' },
                { id: 'checklists', label: 'Checklisty', icon: CheckSquare, color: 'text-green-600', bg: 'bg-green-50' },
                { id: 'reports', label: 'Raporty', icon: BarChart, color: 'text-pink-600', bg: 'bg-pink-50' },
            ]
        }
    ];

    const getStatusColor = (status: JobStatus) => {
        switch (status) {
            case 'planned': return 'bg-blue-100 text-blue-800';
            case 'in_progress': return 'bg-amber-100 text-amber-800';
            case 'done': return 'bg-green-100 text-green-800';
            case 'paused': return 'bg-orange-100 text-orange-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleEditClick = () => {
        setEditFormData({
            name: job?.name,
            clientName: job?.clientName,
            location: job?.location,
            country: job?.country,
            projectManager: job?.projectManager,
            // notesInternal: job?.notesInternal, // Use notesInternal instead of description if needed
            status: job?.status // Allow status edit too? Maybe not, status has specific flow.
        });
        setIsEditModalOpen(true);
    };

    const handleSaveJob = async (e: React.FormEvent) => {
        e.preventDefault();
        if (job && editFormData) {
            try {
                await updateJob(job.id, editFormData);
                toast.success('Dane zlecenia zostały zaktualizowane');
                setIsEditModalOpen(false);
            } catch (err) {
                console.error('Update failed:', err);
            }
        }
    };

    return (
        <div className="space-y-6">
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-zinc-50/90 backdrop-blur pt-2 pb-4 border-b border-black/10">
                <div className="flex flex-col space-y-4">
                    {/* Breadcrumbs or Dashboard Home */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-zinc-550">
                            <button
                                onClick={() => navigate(-1)}
                                className="hover:text-black flex items-center font-bold bg-white text-zinc-700 px-3 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 shadow-sm transition-all text-xs"
                                title="Powrót do poprzedniej strony"
                            >
                                <ChevronLeft className="w-4 h-4 mr-0.5" />
                                Powrót
                            </button>
                            <span className="text-zinc-300">|</span>
                            <span className="font-semibold text-zinc-800">{job.jobCode}</span>
                            {activeTab !== 'dashboard' && (
                                <>
                                    <span>/</span>
                                    <button
                                        onClick={() => setActiveTab('dashboard')}
                                        className="text-[#21808D] font-semibold hover:underline flex items-center"
                                    >
                                        <LayoutDashboard className="w-4 h-4 mr-1" />
                                        Dashboard
                                    </button>
                                </>
                            )}
                        </div>
                        {activeTab !== 'dashboard' && (
                            <button
                                onClick={() => setActiveTab('dashboard')}
                                className="text-zinc-500 hover:text-black flex items-center text-sm gap-1 bg-white px-3 py-1.5 rounded-xl border border-black/10 transition-all hover:bg-zinc-50 font-medium"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Powrót do panelu
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
                            <span className={`px-2.5 py-0.5 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
                                {job.status === 'in_progress' ? 'W realizacji' :
                                    job.status === 'planned' ? 'Zaplanowane' :
                                        job.status === 'done' ? 'Zakończone' :
                                            job.status === 'paused' ? 'Wstrzymane' :
                                                job.status === 'cancelled' ? 'Anulowane' : 'Szkic'}
                            </span>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={async () => {
                                    if (!job) return;
                                    if (confirm('Czy na pewno chcesz utworzyć nową ofertę na podstawie tego zlecenia?')) {
                                        console.log('Creating offer from job:', job.id);
                                        try {
                                            const newOfferId = await offerStorage.createOfferFromJob(job);
                                            console.log('Offer created:', newOfferId);
                                            navigate(`/offers/${newOfferId}`);
                                        } catch (err) {
                                            console.error('Error creating offer:', err);
                                            toast.error('Wystąpił błąd podczas tworzenia oferty.');
                                        }
                                    }
                                }}
                                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2"
                            >
                                <Copy className="w-4 h-4" />
                                <span className="hidden lg:inline">Utwórz ofertę</span>
                            </button>
                            <button
                                onClick={handleEditClick}
                                disabled={isLocked}
                                className={`px-4 py-2 rounded-lg font-medium border flex items-center gap-2 transition-all ${isLocked
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                title={isLocked ? "Zlecenie zamknięte - edycja zablokowana" : "Edytuj dane zlecenia"}
                            >
                                <Edit3 className="w-4 h-4" />
                                <span className="hidden lg:inline">Edytuj</span>
                            </button>
                            {/* Action Buttons based on status */}
                            {job.status === 'planned' && (
                                <button
                                    disabled={isLocked}
                                    className="btn btn-primary flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={async () => {
                                        await updateJob(job.id, { status: 'in_progress', actualStartDate: new Date().toISOString() });
                                        toast.info('Zlecenie zostało rozpoczęte');
                                    }}
                                >
                                    <PlayCircle className="w-4 h-4 mr-2" />
                                    Rozpocznij
                                </button>
                            )}
                            {job.status === 'in_progress' && (
                                <>
                                    <button
                                        disabled={isLocked}
                                        className="btn flex items-center bg-orange-100 text-orange-700 hover:bg-orange-200 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={async () => {
                                            await updateJob(job.id, { status: 'paused' });
                                            toast.warning('Zlecenie zostało wstrzymane');
                                        }}
                                    >
                                        <PauseCircle className="w-4 h-4 mr-2" />
                                        Wstrzymaj
                                    </button>
                                    <button
                                        disabled={isLocked}
                                        className="btn btn-primary flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={async () => {
                                            if (confirm('Czy na pewno chcesz zakończyć zlecenie? Zablokuje to edycję finansów.')) {
                                                await updateJob(job.id, { status: 'done', actualEndDate: new Date().toISOString() });
                                                toast.success('Zlecenie zostało zakończone');
                                            }
                                        }}
                                    >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Zakończ
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Persistent Tile Navigation — visible on every tab */}
            <div className="flex flex-wrap gap-1.5 pb-3 border-b border-black/10">
                {/* Dashboard home tile */}
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-tight transition-all ${activeTab === 'dashboard'
                        ? 'bg-teal-50 text-[#21808D] border-teal-100/50'
                        : 'bg-white text-zinc-500 border-black/10 hover:bg-zinc-50 hover:text-zinc-800'
                        }`}
                    title="Dashboard"
                >
                    <LayoutDashboard className={`w-3.5 h-3.5 ${activeTab === 'dashboard' ? 'text-[#21808D]' : 'text-zinc-400'}`} />
                    Dashboard
                </button>
                {groups.flatMap(g => g.items).map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-tight transition-all ${isActive
                                ? 'bg-teal-50 text-[#21808D] border-teal-100/50'
                                : 'bg-white text-zinc-500 border-black/10 hover:bg-zinc-50 hover:text-zinc-800'
                                }`}
                            title={item.label}
                        >
                            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#21808D]' : 'text-zinc-400'}`} />
                            <span className="hidden sm:inline">{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {activeTab === 'dashboard' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mt-4">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <BarChart className="w-5 h-5 text-blue-600" />
                                Podsumowanie zlecenia
                            </h3>
                            <SummaryTab job={job} />
                        </div>
                    </div>
                )}
                {activeTab === 'stages' && <div className="animate-in fade-in duration-300"><JobStagesTab job={job} /></div>}
                {activeTab === 'structures' && <div className="animate-in fade-in duration-300"><JobStructuresTab job={job} /></div>}
                {activeTab === 'schedule' && <div className="animate-in fade-in duration-300"><JobScheduleTab job={job} /></div>}
                {activeTab === 'costs' && <div className="animate-in fade-in duration-300"><JobFinancialTab job={job} /></div>}
                {activeTab === 'invoices' && <div className="animate-in fade-in duration-300"><JobInvoicesTab job={job} /></div>}
                {activeTab === 'docs' && <div className="animate-in fade-in duration-300"><JobDocumentsTab job={job} /></div>}
                {activeTab === 'diary' && <div className="animate-in fade-in duration-300"><JobDiaryTab job={job} /></div>}
                {activeTab === 'checklists' && <div className="animate-in fade-in duration-300"><JobChecklistsTab job={job} /></div>}
                {activeTab === 'extrawork' && (
                    <div className="animate-in fade-in duration-300"><ExtraWorkTab jobId={job.id} /></div>
                )}
                {activeTab === 'archive' && <div className="animate-in fade-in duration-300"><JobReportsArchiveTab job={job} /></div>}
                {activeTab === 'reports' && <div className="animate-in fade-in duration-300"><ClientReportsTab job={job} /></div>}
                {activeTab === 'team' && (
                    <div className="animate-in fade-in duration-300 mt-4">
                        <JobTeamTab jobId={job.id} />
                    </div>
                )}
                {activeTab === 'materials' && <div className="animate-in fade-in duration-300"><JobMaterialsTab jobId={job.id} /></div>}
                {activeTab === 'subcontractors' && <div className="animate-in fade-in duration-300"><JobSubcontractorsTab job={job} /></div>}
            </div>

            {/* Edit Job Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edytuj zlecenie"
            >
                <form onSubmit={handleSaveJob} className="space-y-4">
                    <Input
                        label="Nazwa zlecenia"
                        value={editFormData.name || ''}
                        onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                        required
                    />
                    <Input
                        label="Klient"
                        value={editFormData.clientName || ''}
                        onChange={e => setEditFormData({ ...editFormData, clientName: e.target.value })}
                        required
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Lokalizacja (Miasto/Adres)"
                            value={editFormData.location || ''}
                            onChange={e => setEditFormData({ ...editFormData, location: e.target.value })}
                            required
                        />
                        <Input
                            label="Kraj"
                            value={editFormData.country || 'PL'}
                            onChange={e => setEditFormData({ ...editFormData, country: e.target.value })}
                        />
                    </div>
                    <Input
                        label="Project Manager (PM)"
                        value={editFormData.projectManager || ''}
                        onChange={e => setEditFormData({ ...editFormData, projectManager: e.target.value })}
                    />
                    <div className="pt-4 flex justify-end space-x-3">
                        <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>
                            Anuluj
                        </Button>
                        <Button type="submit">
                            Zapisz zmiany
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default JobDetailsPage;
