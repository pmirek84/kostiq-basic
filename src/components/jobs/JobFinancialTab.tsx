import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle, Edit2, Save, X, FileText, Receipt } from 'lucide-react';
import type { Job, JobExpenseCategory } from '../../models/types';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';
import { useOffers } from '../../context/OffersContext';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

interface CostInvoice {
    id: string; jobId: string; invoiceNumber: string; vendorName: string;
    description?: string; category: string; amountNet: number; amountGross: number;
    vatRate: number; status: 'pending' | 'paid'; issueDate: string;
}

interface JobFinancialTabProps {
    job: Job;
}

const CATEGORY_LABELS: Record<JobExpenseCategory, string> = {
    material: 'Materiały',
    transport: 'Transport',
    equipment: 'Wynajem sprzętu',
    other: 'Inne'
};

const CATEGORY_COLORS: Record<JobExpenseCategory, string> = {
    material: 'bg-blue-100 text-blue-800',
    transport: 'bg-orange-100 text-orange-800',
    equipment: 'bg-purple-100 text-purple-800',
    other: 'bg-gray-100 text-gray-800'
};

// TARCZA 1 (Grosze): Bezpieczna arytmetyka walutowa — eliminuje dryfowanie IEEE 754
// przy sumowaniu dziesiątek faktur. Operuj na groszach (integer), nie na float.
const toCents = (val: number): number => Math.round((val || 0) * 100);
const toCurrency = (cents: number): number => Math.round(cents) / 100;
const sumCents = (items: number[]): number => items.reduce((acc, v) => acc + toCents(v), 0);

export const JobFinancialTab = ({ job }: JobFinancialTabProps) => {
    const { updateJob } = useJobs();
    const { timeEntries, settlements, employees, subcontractors } = useTiCo();
    const { offers } = useOffers();
    const [isEditing, setIsEditing] = useState(false);
    const isLocked = job.status === 'done' || job.status === 'cancelled';

    // Cost invoices from Faktury tab (read-only here)
    const [costInvoices, setCostInvoices] = useState<CostInvoice[]>([]);
    const fetchCostInvoices = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/cost-invoices?jobId=${job.id}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                const arr = Array.isArray(data) ? data : (data?.data ?? data?.invoices ?? []);
                setCostInvoices(arr.filter((i: CostInvoice) => i.jobId === job.id));
            }
        } catch (e) { console.error('cost-invoices fetch error', e); }
    }, [job.id]);
    useEffect(() => { fetchCostInvoices(); }, [fetchCostInvoices]);

    // Resolve linked offer for cost fallback
    const linkedOffer = useMemo(() => {
        const offerId = job.sourceOfferId || job.offerId;
        return offerId ? offers.find(o => o.id === offerId) : undefined;
    }, [job.sourceOfferId, job.offerId, offers]);

    // Effective planned costs: job fields take priority, offer.costBreakdown as fallback
    const effectivePlanned = useMemo(() => {
        const cb = linkedOffer?.costBreakdown;
        return {
            materials: job.materialsPlannedNet
                || cb?.material_cost
                || linkedOffer?.materialsCost || 0,
            labor: job.laborPlannedNet
                || cb?.assembly_cost
                || linkedOffer?.laborCost || 0,
            logistics: job.logisticsPlannedNet
                || cb?.transport_cost
                || linkedOffer?.constructionTransportCost
                || (linkedOffer as any)?.logisticsCost || 0,
            equipment: job.equipmentPlannedNet
                || cb?.equipment_rental_cost
                || linkedOffer?.equipmentRentalCost || 0,
            other: job.otherCostsNet || (linkedOffer as any)?.otherCosts || 0,
            // Revenue: try every field that might hold the offer's net price
            revenue: job.revenuePlannedNet
                || job.totalPlannedRevenueNet
                || linkedOffer?.totalNet
                || linkedOffer?.subtotalNet
                || linkedOffer?.totalCost
                || (linkedOffer as any)?.totalGross
                || (linkedOffer?.materialsCost || 0) + (linkedOffer?.laborCost || 0) + (linkedOffer?.equipmentRentalCost || 0)
                || 0,
        };
    }, [job, linkedOffer]);

    const [editValues, setEditValues] = useState({
        revenuePlannedNet: effectivePlanned.revenue,
        materialsPlannedNet: effectivePlanned.materials,
        laborPlannedNet: effectivePlanned.labor,
        logisticsPlannedNet: effectivePlanned.logistics,
        equipmentPlannedNet: effectivePlanned.equipment,
        otherCostsNet: effectivePlanned.other
    });

    // Calculate Actual Labor Cost Breakdown from KOSTIQ
    const laborCosts = useMemo(() => {
        const jobEntries = timeEntries.filter(e => e.jobId === job.id && (e.status === 'approved' || e.status === 'admin_approved'));
        // TARCZA 1: sum costs in cents to avoid IEEE 754 drift
        let ownCents = 0;
        let subCents = 0;
        const empIds = new Set(employees.map(e => e.id));
        const subIds = new Set(subcontractors.map(s => s.id));

        jobEntries.forEach(e => {
            if (empIds.has(e.employeeId)) {
                ownCents += toCents(e.cost || 0);
            } else if (subIds.has(e.employeeId)) {
                subCents += toCents(e.cost || 0);
            } else {
                ownCents += toCents(e.cost || 0);
            }
        });

        const jobSettlements = settlements.filter(s => s.jobId === job.id && s.type === 'contract');
        jobSettlements.forEach(s => { subCents += toCents(s.totalAmount); });

        return {
            own: toCurrency(ownCents),
            sub: toCurrency(subCents),
            total: toCurrency(ownCents + subCents)
        };
    }, [timeEntries, settlements, employees, subcontractors, job.id]);

    const actualLabor = laborCosts.total;

    // Calculate actual costs from expenses per category
    // TARCZA 1: expense totals calculated in cents, converted back to PLN
    const expenseTotals = useMemo(() => {
        const expenses = job.expenses || [];
        return {
            material: toCurrency(sumCents(expenses.filter(e => e.category === 'material').map(e => e.amountNet))),
            transport: toCurrency(sumCents(expenses.filter(e => e.category === 'transport').map(e => e.amountNet))),
            equipment: toCurrency(sumCents(expenses.filter(e => e.category === 'equipment').map(e => e.amountNet))),
            other: toCurrency(sumCents(expenses.filter(e => e.category === 'other').map(e => e.amountNet))),
        };
    }, [job.expenses]);

    // Planned costs from team assignments (live, from employeeAssignments / subcontractorAssignments)
    const assignedLaborCost = useMemo(() => {
        return toCurrency(sumCents((job.employeeAssignments || []).map(a => a.plannedCost)));
    }, [job.employeeAssignments]);

    const assignedSubcontractorCost = useMemo(() => {
        return toCurrency(sumCents((job.subcontractorAssignments || []).map(a => a.plannedBudget)));
    }, [job.subcontractorAssignments]);

    // Use whichever is higher: offer budget or assigned team cost
    const effectiveLaborPlanned = Math.max(effectivePlanned.labor, assignedLaborCost);

    useEffect(() => {
        setEditValues({
            revenuePlannedNet: effectivePlanned.revenue,
            materialsPlannedNet: effectivePlanned.materials,
            laborPlannedNet: effectivePlanned.labor,
            logisticsPlannedNet: effectivePlanned.logistics,
            equipmentPlannedNet: effectivePlanned.equipment,
            otherCostsNet: effectivePlanned.other
        });
    }, [effectivePlanned]);

    const getVariance = (planned: number = 0, actual: number = 0) => planned - actual;
    const fmt = (val: number = 0) => val.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });

    const handleSave = () => {
        // TARCZA 1: sum planned costs in cents to prevent IEEE 754 accumulation
        const plannedTotalCost = toCurrency(
            toCents(editValues.materialsPlannedNet) +
            toCents(editValues.laborPlannedNet) +
            toCents(editValues.logisticsPlannedNet) +
            toCents(editValues.equipmentPlannedNet) +
            toCents(editValues.otherCostsNet)
        );

        const revenue = Number(editValues.revenuePlannedNet);
        const marginPlannedPercent = revenue > 0 ? ((revenue - plannedTotalCost) / revenue) * 100 : 0;

        updateJob(job.id, {
            ...editValues,
            plannedTotalCost,
            marginPlannedPercent: parseFloat(marginPlannedPercent.toFixed(2)),
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditValues({
            revenuePlannedNet: job.revenuePlannedNet || 0,
            materialsPlannedNet: job.materialsPlannedNet || 0,
            laborPlannedNet: job.laborPlannedNet || 0,
            logisticsPlannedNet: job.logisticsPlannedNet || 0,
            equipmentPlannedNet: job.equipmentPlannedNet || 0,
            otherCostsNet: job.otherCostsNet || 0
        });
        setIsEditing(false);
    };

    // TARCZA 1: all total aggregations use cents arithmetic
    const totalActualCost = toCurrency(
        toCents(expenseTotals.material) + toCents(actualLabor) +
        toCents(expenseTotals.transport) + toCents(expenseTotals.equipment) + toCents(expenseTotals.other)
    );
    const totalPlannedCost = toCurrency(
        toCents(effectivePlanned.materials) + toCents(effectiveLaborPlanned) +
        toCents(effectivePlanned.logistics) + toCents(effectivePlanned.equipment) + toCents(effectivePlanned.other)
    );
    const revenue = effectivePlanned.revenue;
    const plannedMargin = revenue - totalPlannedCost;
    const plannedMarginPercent = revenue > 0 ? (plannedMargin / revenue) * 100 : 0;
    const actualMargin = revenue - totalActualCost;
    const actualMarginPercent = revenue > 0 ? (actualMargin / revenue) * 100 : 0;
    const totalCostDeviationPercent = totalPlannedCost > 0 ? ((totalActualCost - totalPlannedCost) / totalPlannedCost) * 100 : 0;
    const marginDeviation = actualMargin - plannedMargin;

    // 4-bucket data for table
    const costBuckets = [
        {
            label: '1. Materiały',
            planned: effectivePlanned.materials,
            actual: expenseTotals.material,
            editKey: 'materialsPlannedNet' as const,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        {
            label: '2. Montaż (Robocizna)',
            planned: effectiveLaborPlanned,
            actual: actualLabor,
            editKey: 'laborPlannedNet' as const,
            color: 'text-green-600',
            bg: 'bg-green-50',
            isLive: true,
            // planDetails shown always (from team assignments)
            planDetails: [
                ...(assignedLaborCost > 0 ? [{ label: '📋 Pracownicy (przypisani)', amount: assignedLaborCost }] : []),
                ...(assignedSubcontractorCost > 0 ? [{ label: '📋 Podwykonawcy (przypisani)', amount: assignedSubcontractorCost }] : []),
            ],
            // details shown only when actual time entries exist
            details: [
                { label: 'Własne ekipy (czas pracy)', amount: laborCosts.own },
                { label: 'Podwykonawcy (czas pracy)', amount: laborCosts.sub },
            ]
        },
        {
            label: '3. Transport',
            planned: effectivePlanned.logistics,
            actual: expenseTotals.transport,
            editKey: 'logisticsPlannedNet' as const,
            color: 'text-orange-600',
            bg: 'bg-orange-50'
        },
        {
            label: '4. Wynajem sprzętu',
            planned: effectivePlanned.equipment,
            actual: expenseTotals.equipment,
            editKey: 'equipmentPlannedNet' as const,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        },
        {
            label: '5. Inne',
            planned: effectivePlanned.other,
            actual: expenseTotals.other,
            editKey: 'otherCostsNet' as const,
            color: 'text-gray-600',
            bg: 'bg-gray-50'
        },
    ];

    return (
        <div className="space-y-6">
            {isLocked && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-amber-800">Zlecenie jest zamknięte</h4>
                        <p className="text-xs text-amber-700 mt-1">
                            Status zlecenia to <span className="font-bold">{job.status === 'done' ? 'Zakończone' : 'Anulowane'}</span>.
                            Edycja budżetu oraz dodawanie nowych kosztów zostało zablokowane dla zachowania spójności historycznej.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══ PRAWDZIWA MARŻA — Summary Card ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
                    <p className="text-xs text-gray-500 mb-1">Przychód planowany</p>
                    {isEditing ? (
                        <input type="number" value={editValues.revenuePlannedNet} onChange={(e) => setEditValues({ ...editValues, revenuePlannedNet: Number(e.target.value) })} className="text-center font-bold w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                    ) : (
                        <p className="text-xl font-bold text-gray-900">{fmt(revenue)}</p>
                    )}
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
                    <p className="text-xs text-gray-500 mb-1">Koszty estymowane</p>
                    <p className="text-xl font-bold text-gray-700">{fmt(totalPlannedCost)}</p>
                    <p className="text-xs text-gray-400 mt-1">Marża plan: <span className={`font-semibold ${plannedMarginPercent < 18 ? 'text-red-500' : 'text-green-600'}`}>{plannedMarginPercent.toFixed(1)}%</span></p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
                    <p className="text-xs text-gray-500 mb-1">Koszty rzeczywiste</p>
                    <p className={`text-xl font-bold ${totalActualCost > totalPlannedCost ? 'text-red-600' : 'text-gray-700'}`}>{fmt(totalActualCost)}</p>
                    <p className={`text-xs mt-1 font-semibold ${totalCostDeviationPercent > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {totalCostDeviationPercent > 0 ? '+' : ''}{totalCostDeviationPercent.toFixed(1)}% vs plan
                    </p>
                </div>
                <div className={`p-5 rounded-xl shadow-sm border text-center ${actualMargin >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-xs text-gray-500 mb-1">PRAWDZIWA MARŻA</p>
                    <p className={`text-2xl font-bold ${actualMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(actualMargin)}</p>
                    <p className={`text-sm font-bold mt-1 ${actualMarginPercent >= 18 ? 'text-green-600' : 'text-red-600'}`}>
                        {actualMarginPercent.toFixed(1)}%
                    </p>
                </div>
                <div className={`p-5 rounded-xl shadow-sm border text-center ${marginDeviation >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                    <p className="text-xs text-gray-500 mb-1">Odchylenie marży</p>
                    <p className={`text-xl font-bold ${marginDeviation >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>{marginDeviation >= 0 ? '+' : ''}{fmt(marginDeviation)}</p>
                    <p className={`text-xs mt-1 ${marginDeviation >= 0 ? 'text-blue-500' : 'text-amber-600'}`}>
                        {(actualMarginPercent - plannedMarginPercent).toFixed(1)} p.p. vs plan
                    </p>
                </div>
            </div>

            {/* ─── Edit Controls ─── */}
            <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">Estymacja vs. Rzeczywistość</h3>
                {!isEditing ? (
                    <button
                        onClick={() => !isLocked && setIsEditing(true)}
                        disabled={isLocked}
                        className={`p-2 rounded-lg transition-colors shadow-sm ${isLocked
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : 'text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-gray-100'}`}
                        title={isLocked ? "Zlecenie zamknięte - edycja zablokowana" : "Edytuj finanse"}
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="p-2 text-white bg-green-600 hover:bg-green-700 transition-colors rounded-lg shadow-sm" title="Zapisz"><Save className="w-4 h-4" /></button>
                        <button onClick={handleCancel} className="p-2 text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors rounded-lg" title="Anuluj"><X className="w-4 h-4" /></button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ─── 4-Bucket Cost Table (Estymacja vs Rzeczywistość) ─── */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 lg:col-span-2">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Estymacja vs. Rzeczywistość (4 koszyki)
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-gray-500">
                                    <th className="py-2 font-medium">Kategoria</th>
                                    <th className="py-2 font-medium text-right">Estymacja</th>
                                    <th className="py-2 font-medium text-right">Rzeczywistość</th>
                                    <th className="py-2 font-medium text-right">Odchylenie</th>
                                    <th className="py-2 font-medium text-right">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {costBuckets.map(bucket => {
                                    const variance = getVariance(bucket.planned, bucket.actual);
                                    const variancePercent = bucket.planned > 0 ? ((bucket.actual - bucket.planned) / bucket.planned) * 100 : (bucket.actual > 0 ? 100 : 0);
                                    const hasData = bucket.planned > 0 || bucket.actual > 0;
                                    return (
                                        <Fragment key={bucket.label}>
                                            <tr>
                                                <td className={`py-3 font-medium ${bucket.color}`}>{bucket.label}</td>
                                                <td className="py-3 text-right">
                                                    {isEditing ? (
                                                        <input type="number" value={editValues[bucket.editKey]} onChange={(e) => setEditValues({ ...editValues, [bucket.editKey]: Number(e.target.value) })} className="text-right w-28 p-1 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm" />
                                                    ) : fmt(bucket.planned)}
                                                </td>
                                                <td className={`py-3 text-right font-medium ${bucket.isLive ? 'text-blue-600' : ''}`}>
                                                    {fmt(bucket.actual)}
                                                    {bucket.isLive && <span className="ml-1 text-xs text-blue-400">(live)</span>}
                                                </td>
                                                <td className={`py-3 text-right font-medium ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                                    {hasData ? `${variance > 0 ? '+' : ''}${fmt(variance)}` : '-'}
                                                </td>
                                                <td className={`py-3 text-right text-xs font-semibold ${variancePercent > 0 ? 'text-red-500' : variancePercent < 0 ? 'text-green-500' : 'text-gray-400'}`}>
                                                    {hasData ? (bucket.planned > 0 ? `${variancePercent > 0 ? '+' : ''}${variancePercent.toFixed(1)}%` : (bucket.actual > 0 ? <span className="text-red-500">nowy</span> : '0%')) : '-'}
                                                </td>
                                            </tr>
                                            {/* Plan sub-rows: assignment costs, always visible */}
                                            {(bucket as any).planDetails?.filter((d: any) => d.amount > 0).map((d: any) => (
                                                <tr key={d.label} className="text-xs bg-indigo-50/60">
                                                    <td className="pl-8 py-1 text-indigo-600 font-medium">↳ {d.label}</td>
                                                    <td className="text-right py-1 text-indigo-700 font-semibold">{fmt(d.amount)}</td>
                                                    <td className="text-right py-1 text-gray-400">-</td>
                                                    <td className="text-right py-1 text-gray-400">-</td>
                                                    <td className="text-right py-1 text-gray-400">-</td>
                                                </tr>
                                            ))}
                                            {/* Actual sub-rows: KOSTIQ time entries, shown when actual > 0 */}
                                            {bucket.details && bucket.actual > 0 && bucket.details.map(d => (
                                                <tr key={d.label} className="text-xs text-gray-400 bg-gray-50/50">
                                                    <td className="pl-8 py-1">↳ {d.label}</td>
                                                    <td className="text-right py-1">-</td>
                                                    <td className="text-right py-1">{fmt(d.amount)}</td>
                                                    <td className="text-right py-1">-</td>
                                                    <td className="text-right py-1">-</td>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    );
                                })}

                                {/* TOTAL */}
                                <tr className="font-bold bg-gray-50 border-t-2 border-gray-300">
                                    <td className="py-3 pl-2 rounded-l-lg">SUMA KOSZTÓW</td>
                                    <td className="py-3 text-right">{fmt(totalPlannedCost)}</td>
                                    <td className="py-3 text-right">{fmt(totalActualCost)}</td>
                                    <td className={`py-3 text-right ${getVariance(totalPlannedCost, totalActualCost) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {fmt(getVariance(totalPlannedCost, totalActualCost))}
                                    </td>
                                    <td className={`py-3 text-right font-semibold rounded-r-lg ${totalCostDeviationPercent > 0 ? 'text-red-600' : totalCostDeviationPercent < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                        {totalPlannedCost > 0 ? `${totalCostDeviationPercent > 0 ? '+' : ''}${totalCostDeviationPercent.toFixed(1)}%` : '-'}
                                    </td>
                                </tr>

                                {/* PRZYCHÓD ROW */}
                                <tr className="font-bold bg-blue-50 border-t border-blue-200">
                                    <td className="py-3 pl-2 text-blue-800 rounded-l-lg">PRZYCHÓD</td>
                                    <td className="py-3 text-right text-blue-700" colSpan={4}>{fmt(revenue)}</td>
                                </tr>

                                {/* MARŻA PLANOWANA */}
                                <tr className="font-bold bg-gray-50">
                                    <td className="py-3 pl-2 text-gray-700 rounded-l-lg">MARŻA PLANOWANA</td>
                                    <td className="py-3 text-right text-gray-600">{fmt(plannedMargin)}</td>
                                    <td className="py-3 text-right text-gray-400" colSpan={2}>—</td>
                                    <td className={`py-3 text-right font-bold rounded-r-lg ${plannedMarginPercent < 18 ? 'text-red-600' : 'text-green-600'}`}>
                                        {plannedMarginPercent.toFixed(1)}%
                                    </td>
                                </tr>

                                {/* PRAWDZIWA MARŻA */}
                                <tr className={`font-bold border-t-2 ${actualMargin >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                                    <td className={`py-3 pl-2 rounded-l-lg ${actualMargin >= 0 ? 'text-green-800' : 'text-red-800'}`}>PRAWDZIWA MARŻA</td>
                                    <td className="py-3"></td>
                                    <td className={`py-3 text-right text-lg ${actualMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(actualMargin)}</td>
                                    <td className={`py-3 text-right ${marginDeviation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {marginDeviation >= 0 ? '+' : ''}{fmt(marginDeviation)}
                                    </td>
                                    <td className={`py-3 text-right font-bold rounded-r-lg ${actualMarginPercent < 18 ? 'text-red-600' : 'text-green-600'}`}>
                                        {actualMarginPercent.toFixed(1)}%
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ─── Budget Status ─── */}
                <div className="space-y-6 col-span-1">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <AlertCircle className="w-5 h-5 mr-2 text-blue-600" />
                            Status Budżetu
                        </h3>
                        <p className="text-gray-600 text-sm mb-4">
                            {totalPlannedCost && totalActualCost > totalPlannedCost
                                ? 'Uwaga: Przekroczono zaplanowany budżet!'
                                : 'Budżet zlecenia jest pod kontrolą.'}
                        </p>
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-gray-700">Wykorzystanie budżetu</span>
                                <span className="text-sm font-bold text-blue-600">
                                    {totalPlannedCost ? Math.round((totalActualCost / totalPlannedCost) * 100) : 0}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full transition-all ${totalPlannedCost && totalActualCost > totalPlannedCost ? 'bg-red-600' : 'bg-blue-600'}`}
                                    style={{ width: `${totalPlannedCost ? Math.min(100, Math.round((totalActualCost / totalPlannedCost) * 100)) : 0}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Per-bucket mini bars */}
                        <div className="mt-4 space-y-3">
                            {costBuckets.slice(0, 4).map(b => {
                                const pct = b.planned > 0 ? Math.round((b.actual / b.planned) * 100) : 0;
                                return (
                                    <div key={b.label} className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className={`font-medium ${b.color}`}>{b.label}</span>
                                            <span className={pct > 100 ? 'text-red-600 font-bold' : 'text-gray-500'}>{pct}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full ${pct > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, pct)}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Expenses / Invoices Section ─── */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-purple-600" />
                        Koszty zewnętrzne / Faktury
                    </h3>
                </div>

                {/* Expenses List — read-only, add in Faktury tab */}
                {(job.expenses || []).length === 0 ? (
                    <p className="text-sm text-gray-500 italic py-4">Brak zarejestrowanych kosztów zewnętrznych. Dodaj faktury kosztowe w zakładce <strong>Faktury</strong>.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                                    <th className="py-2 font-medium">Data</th>
                                    <th className="py-2 font-medium">Kategoria</th>
                                    <th className="py-2 font-medium">Opis</th>
                                    <th className="py-2 font-medium">Dostawca</th>
                                    <th className="py-2 font-medium">Nr faktury</th>
                                    <th className="py-2 font-medium text-right">Kwota netto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(job.expenses || []).map(expense => (
                                    <tr key={expense.id} className="hover:bg-gray-50">
                                        <td className="py-2 text-gray-600">{new Date(expense.date).toLocaleDateString('pl-PL')}</td>
                                        <td className="py-2">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[expense.category]}`}>
                                                {CATEGORY_LABELS[expense.category]}
                                            </span>
                                        </td>
                                        <td className="py-2 text-gray-900 font-medium">{expense.description}</td>
                                        <td className="py-2 text-gray-600">{expense.vendorName || '-'}</td>
                                        <td className="py-2 text-gray-600 font-mono text-xs">{expense.invoiceNumber || '-'}</td>
                                        <td className="py-2 text-right font-semibold text-gray-900">{fmt(expense.amountNet)}</td>
                                    </tr>
                                ))}
                                <tr className="font-bold bg-gray-50 border-t border-gray-200">
                                    <td colSpan={5} className="py-2 pl-2">SUMA FAKTUR</td>
                                    <td className="py-2 text-right">{fmt(expenseTotals.material + expenseTotals.transport + expenseTotals.equipment + expenseTotals.other)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Cost Invoices — read-only, managed in Faktury tab */}
            {costInvoices.length > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-orange-500" />
                            Faktury kosztowe
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{costInvoices.length}</span>
                        </h3>
                        <span className="text-xs text-gray-400 italic">Zarządzaj w zakładce Faktury →</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                                    <th className="py-2 font-medium">Nr faktury</th>
                                    <th className="py-2 font-medium">Dostawca</th>
                                    <th className="py-2 font-medium">Kategoria</th>
                                    <th className="py-2 font-medium">Opis</th>
                                    <th className="py-2 font-medium">Data</th>
                                    <th className="py-2 font-medium text-right">Netto</th>
                                    <th className="py-2 font-medium text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {costInvoices.map(inv => (
                                    <tr key={inv.id} className="hover:bg-orange-50/30">
                                        <td className="py-2 font-mono text-xs text-gray-700">{inv.invoiceNumber}</td>
                                        <td className="py-2 font-medium text-gray-900">{inv.vendorName}</td>
                                        <td className="py-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-medium">
                                                {({ material: 'Materiały', labor: 'Robocizna', transport: 'Transport', equipment: 'Sprzęt', other: 'Inne' } as Record<string, string>)[inv.category] ?? inv.category}
                                            </span>
                                        </td>
                                        <td className="py-2 text-gray-600 max-w-[140px] truncate" title={inv.description}>{inv.description || '-'}</td>
                                        <td className="py-2 text-gray-600 text-xs">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
                                        <td className="py-2 text-right font-semibold text-red-700">{fmt(inv.amountNet)}</td>
                                        <td className="py-2 text-center">
                                            {inv.status === 'paid'
                                                ? <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Opłacona</span>
                                                : <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Oczekująca</span>}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="font-bold bg-orange-50 border-t-2 border-orange-200">
                                    <td colSpan={5} className="py-2 pl-2">SUMA FAKTUR KOSZTOWYCH</td>
                                    <td className="py-2 text-right text-red-700">{fmt(costInvoices.reduce((s, i) => s + i.amountNet, 0))}</td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ─── Stage Analysis ─── */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Analiza Rentowności Etapów</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-500">
                                <th className="py-2 font-medium">Etap</th>
                                <th className="py-2 font-medium">Typ</th>
                                <th className="py-2 font-medium text-right">Przychód (Netto)</th>
                                <th className="py-2 font-medium text-right">Koszt Plan. (Netto)</th>
                                <th className="py-2 font-medium text-right">Marża</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {job.stages?.map(stage => {
                                const cost = stage.plannedCostNet || 0;
                                const stageRevenue = stage.plannedRevenueNet || 0;
                                const margin = stageRevenue - cost;
                                const marginPercent = stageRevenue > 0 ? (margin / stageRevenue) * 100 : 0;
                                return (
                                    <tr key={stage.id}>
                                        <td className="py-3 text-gray-900 font-medium">{stage.name}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${stage.type === 'dodatkowy' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {stage.type === 'dodatkowy' ? 'Dodatkowy' : 'Podstawowy'}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right">{fmt(stageRevenue)}</td>
                                        <td className="py-3 text-right">{stage.type === 'dodatkowy' ? fmt(cost) : '-'}</td>
                                        <td className="py-3 text-right">
                                            {stage.type === 'dodatkowy' ? (
                                                <span className={marginPercent < 18 ? 'text-red-600' : 'text-green-600'}>
                                                    {marginPercent.toFixed(1)}% ({fmt(margin)})
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            <tr className="bg-gray-50 font-bold border-t border-gray-200">
                                <td className="py-3 pl-2" colSpan={2}>SUMA</td>
                                <td className="py-3 text-right">{fmt(job.totalPlannedRevenueNet)}</td>
                                <td className="py-3 text-right">{fmt(totalPlannedCost)}</td>
                                <td className="py-3 text-right">
                                    <span className={(job.marginPlannedPercent || 0) < 18 ? 'text-red-600' : 'text-green-600'}>
                                        {job.marginPlannedPercent}%
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
