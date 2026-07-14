import { X, Search, FileText, MapPin, User, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { Job, JobStatus } from '../../models/types';

interface JobPreviewModalProps {
    job: Job;
    onClose: () => void;
}

export default function JobPreviewModal({ job, onClose }: JobPreviewModalProps) {
    const revenue = job.totalPlannedRevenueNet || job.revenuePlannedNet || 0;
    const materialsCost = job.materialsPlannedNet || 0;
    const laborCost = job.laborPlannedNet || 0;
    const logisticsCost = job.logisticsPlannedNet || 0;
    const equipmentCost = job.equipmentPlannedNet || 0;
    const totalCosts = job.plannedTotalCost || (materialsCost + laborCost + logisticsCost + equipmentCost);
    
    const marginPercent = revenue > 0 ? ((revenue - totalCosts) / revenue) * 100 : 0;
    const isLowMargin = marginPercent < 18;

    // SVG Circular Doughnut metrics for costs
    const circ = 226.2;
    const matPercent = totalCosts > 0 ? (materialsCost / totalCosts) * 100 : 0;
    const labPercent = totalCosts > 0 ? (laborCost / totalCosts) * 100 : 0;
    const logPercent = totalCosts > 0 ? (logisticsCost / totalCosts) * 100 : 0;
    const eqPercent = totalCosts > 0 ? (equipmentCost / totalCosts) * 100 : 0;

    const matStroke = (matPercent / 100) * circ;
    const labStroke = (labPercent / 100) * circ;
    const logStroke = (logPercent / 100) * circ;
    const eqStroke = (eqPercent / 100) * circ;

    const matOffset = 0;
    const labOffset = -matStroke;
    const logOffset = -(matStroke + labStroke);
    const eqOffset = -(matStroke + labStroke + logStroke);

    const getStatusBadge = (status: JobStatus) => {
        const styles = {
            draft: 'bg-gray-100 text-gray-800 border-gray-200',
            planned: 'bg-teal-50 text-teal-800 border-teal-100/50',
            in_progress: 'bg-amber-50 text-amber-800 border-amber-100/50',
            paused: 'bg-orange-50 text-orange-800 border-orange-100/50',
            done: 'bg-green-50 text-green-800 border-green-100/50',
            cancelled: 'bg-red-50 text-red-850 border-red-100/50'
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
            <span className={`px-2.5 py-0.5 inline-flex text-[10px] leading-5 font-bold uppercase tracking-wider rounded-full border ${styles[status]}`}>
                {labels[status]}
            </span>
        );
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white border border-zinc-100 rounded-[28px] max-w-2xl w-full max-h-[85vh] overflow-y-auto p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative">
                
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-all"
                    title="Zamknij"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Title */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-teal-50 text-[#21808D] rounded-xl">
                        <Search className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-zinc-950">Podgląd Zlecenia</h2>
                            {getStatusBadge(job.status)}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">Podsumowanie postępu i rentowności montażu</p>
                    </div>
                </div>

                <hr className="border-zinc-150/40 my-5" />

                {/* Metadata Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <FileText className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Kod zlecenia</p>
                            <p className="font-bold text-zinc-900 mt-0.5">{job.jobCode}</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">{job.name}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <User className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Klient</p>
                            <p className="font-bold text-zinc-900 mt-0.5">{job.clientName || 'Brak'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Miejsce realizacji</p>
                            <p className="font-bold text-zinc-900 mt-0.5">{job.location || 'Brak'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <Calendar className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Termin montażu</p>
                            <p className="font-bold text-zinc-900 mt-0.5">
                                {job.plannedStartDate ? format(new Date(job.plannedStartDate), 'dd MMMM yyyy', { locale: pl }) : 'Brak'}
                                {job.plannedEndDate ? ` - ${format(new Date(job.plannedEndDate), 'dd MMMM yyyy', { locale: pl })}` : ''}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Risk Alert Flag */}
                {job.riskFlag && job.riskFlag !== 'none' && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-2.5 mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-amber-950">Wykryte ryzyko w zleceniu</p>
                            <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                                System oflagował zlecenie ryzykiem: <strong className="font-bold text-amber-900 uppercase text-[10px]">{job.riskFlag}</strong>. Monitoruj odchylenia robocizny i logistyki na bieżąco.
                            </p>
                        </div>
                    </div>
                )}

                <hr className="border-zinc-150/40 my-6" />

                {/* Financial Structure Grid */}
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Budżet i szacunki kosztów</h3>
                
                <div className="bg-zinc-50/50 border border-zinc-200/60 rounded-[24px] p-5 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex-1 w-full space-y-3">
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500"></span>Materiały i okna:</span>
                            <span className="font-semibold text-zinc-800">{materialsCost.toFixed(2)} PLN</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#0D9488]"></span>Robocizna brygad:</span>
                            <span className="font-semibold text-zinc-800">{laborCost.toFixed(2)} PLN</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#8B5CF6]"></span>Logistyka i dojazdy:</span>
                            <span className="font-semibold text-zinc-800">{logisticsCost.toFixed(2)} PLN</span>
                        </div>
                        {equipmentCost > 0 && (
                            <div className="flex justify-between items-center text-xs text-zinc-500">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500"></span>Wynajem sprzętu:</span>
                                <span className="font-semibold text-zinc-800">{equipmentCost.toFixed(2)} PLN</span>
                            </div>
                        )}
                        <hr className="border-zinc-200/40 my-1" />
                        <div className="flex justify-between items-center text-xs text-zinc-600 font-bold">
                            <span>Suma kosztów planowanych:</span>
                            <span>{totalCosts.toFixed(2)} PLN</span>
                        </div>
                    </div>

                    {/* Circular SVG Chart */}
                    {totalCosts > 0 && (
                        <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="36" fill="transparent" stroke="#F4F4F5" strokeWidth="12" />
                                {matStroke > 0 && (
                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#2563EB" strokeWidth="12" strokeDasharray={`${matStroke} ${circ}`} strokeDashoffset={matOffset} />
                                )}
                                {labStroke > 0 && (
                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#0D9488" strokeWidth="12" strokeDasharray={`${labStroke} ${circ}`} strokeDashoffset={labOffset} />
                                )}
                                {logStroke > 0 && (
                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#8B5CF6" strokeWidth="12" strokeDasharray={`${logStroke} ${circ}`} strokeDashoffset={logOffset} />
                                )}
                                {eqStroke > 0 && (
                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#D97706" strokeWidth="12" strokeDasharray={`${eqStroke} ${circ}`} strokeDashoffset={eqOffset} />
                                )}
                            </svg>
                            <div className="absolute text-center">
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Plan ROI</p>
                                <p className={`text-xs font-black mt-0.5 ${isLowMargin ? 'text-rose-600 animate-pulse' : 'text-[#21808D]'}`}>
                                    {marginPercent.toFixed(0)}%
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Revenue Net and Cost Comparison Footer */}
                <div className="mt-6 pt-5 border-t border-zinc-150/40 flex justify-between items-center">
                    <span className="text-sm font-black text-zinc-950 uppercase tracking-wider">Planowany Przychód Netto:</span>
                    <span className="text-3xl font-black text-[#21808D]">
                        {revenue.toFixed(2)} <span className="text-sm font-bold">PLN</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
