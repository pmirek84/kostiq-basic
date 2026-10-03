
import { useState, useEffect, Fragment } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Offer, Job, JobStage, OfferItem, OfferItemAllocation } from '../../../models/types';
import { useJobs } from '../../../context/JobsContext';
import { X, ChevronRight, ChevronLeft, Check, ChevronDown } from 'lucide-react';

interface CreateJobWizardProps {
    offer: Offer;
    offerItems?: OfferItem[];
    onClose: () => void;
    onSuccess?: () => Promise<void> | void;
}

export const CreateJobWizard = ({ offer, offerItems = [], onClose, onSuccess }: CreateJobWizardProps) => {
    const { createJobWithStages } = useJobs();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    // Operation idempotency key preserved across retries for this wizard session
    const [idempotencyKey] = useState(() => uuidv4());
    const [error, setError] = useState<string | null>(null);

    // State
    const [jobData, setJobData] = useState<Partial<Job>>(() => {
        const cb = offer.costBreakdown;
        const materialsPlannedNet = cb?.material_cost ?? offer.materialsCost ?? 0;
        const laborPlannedNet = cb?.assembly_cost ?? offer.laborCost ?? 0;
        const logisticsPlannedNet = cb?.transport_cost ?? offer.constructionTransportCost ?? (offer as any).logisticsCost ?? 0;
        const equipmentPlannedNet = cb?.equipment_rental_cost ?? offer.equipmentRentalCost ?? 0;
        const otherCostsNet = (offer as any).otherCosts ?? 0;
        const plannedTotalCost = materialsPlannedNet + laborPlannedNet + logisticsPlannedNet + equipmentPlannedNet + otherCostsNet;
        // Revenue = totalNet (price to client), NOT totalCost (our cost)
        const revenuePlannedNet = offer.totalNet
            || (offer as any).subtotalNet
            || (materialsPlannedNet + laborPlannedNet + logisticsPlannedNet + equipmentPlannedNet + otherCostsNet)
            || 0;
        const marginPlannedPercent = revenuePlannedNet > 0 ? parseFloat((((revenuePlannedNet - plannedTotalCost) / revenuePlannedNet) * 100).toFixed(2)) : 0;

        return {
            name: offer.title || `Zlecenie z oferty ${offer.number}`,
            clientId: offer.clientId,
            location: offer.location,
            revenuePlannedNet,
            totalPlannedRevenueNet: revenuePlannedNet,
            materialsPlannedNet,
            laborPlannedNet,
            logisticsPlannedNet,
            equipmentPlannedNet,
            otherCostsNet,
            plannedTotalCost,
            marginPlannedPercent,
            priority: 'normal',
            status: 'planned',
            offerId: offer.id,
            offerNumber: offer.number,
            sourceOfferId: offer.id
        };
    });

    const [stages, setStages] = useState<Partial<JobStage>[]>([
        {
            id: crypto.randomUUID(),
            name: 'Etap podstawowy',
            type: 'podstawowy',
            status: 'planowany',
            // Revenue: use totalNet (client price), fallback to offer cost sum
            plannedRevenueNet: offer.totalNet || (offer as any).subtotalNet || offer.totalCost || 0,
        }
    ]);

    const [allocations, setAllocations] = useState<OfferItemAllocation[]>([]);

    const handleCreate = async () => {
        try {
            setIsLoading(true);
            setError(null);
            await createJobWithStages(jobData, stages, allocations, idempotencyKey);
            if (onSuccess) {
                await onSuccess();
            }
            onClose();
        } catch (err) {
            console.error('Failed to create job:', err);
            setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas tworzenia zlecenia. Spróbuj ponownie.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-black/10 shadow-xl w-full max-w-4xl h-[80vh] flex flex-col animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className="p-6 border-b border-black/5 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-zinc-950">Utwórz zlecenie z oferty</h2>
                        <p className="text-sm text-zinc-500">Oferta: {offer.number}</p>
                    </div>
                    <button onClick={onClose} disabled={isLoading} className="text-zinc-400 hover:text-zinc-650 disabled:opacity-50">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Progress */}
                <div className="px-6 py-4 bg-zinc-50/50 border-b border-black/5">
                    <div className="flex items-center justify-between max-w-2xl mx-auto">
                        <StepIndicator current={step} number={1} label="Dane zlecenia" />
                        <div className={`flex-1 h-0.5 mx-4 ${step > 1 ? 'bg-[#21808D]' : 'bg-zinc-200'}`} />
                        <StepIndicator current={step} number={2} label="Definicja etapów" />
                        <div className={`flex-1 h-0.5 mx-4 ${step > 2 ? 'bg-[#21808D]' : 'bg-zinc-200'}`} />
                        <StepIndicator current={step} number={3} label="Alokacja pozycji" />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center border border-red-100">
                            <span className="mr-2">⚠️</span> {error}
                        </div>
                    )}
                    {step === 1 && (
                        <Step1JobDetails
                            jobData={jobData}
                            setJobData={setJobData}
                            offer={offer}
                        />
                    )}
                    {step === 2 && (
                        <Step2StageDefinition
                            stages={stages}
                            setStages={setStages}
                            offerTotal={offer.totalNet || (offer as any).subtotalNet || offer.totalCost || 0}
                            offerItems={offerItems}
                            allocations={allocations}
                            setAllocations={setAllocations}
                        />
                    )}
                    {step === 3 && (
                        <Step3Allocation
                            stages={stages}
                            offerItems={offerItems}
                            allocations={allocations}
                            setAllocations={setAllocations}
                            setStages={setStages}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-black/5 flex justify-between items-center bg-white">
                    <button
                        onClick={() => setStep(s => Math.max(1, s - 1))}
                        disabled={step === 1 || isLoading}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center border border-black/10 transition-all ${
                            step === 1 || isLoading ? 'text-zinc-300 border-black/5 cursor-not-allowed bg-zinc-50' : 'text-zinc-700 hover:bg-zinc-50'
                        }`}
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Wstecz
                    </button>

                    {step < 3 ? (
                        <button
                            onClick={() => setStep(s => Math.min(3, s + 1))}
                            className="bg-black hover:bg-zinc-800 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center"
                        >
                            Dalej
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </button>
                    ) : (
                        <button
                            onClick={handleCreate}
                            disabled={isLoading}
                            className="bg-[#21808D] hover:bg-[#1b6b77] text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>Przetwarzanie...</>
                            ) : (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Utwórz zlecenie
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const StepIndicator = ({ current, number, label }: { current: number, number: number, label: string }) => {
    const isActive = current === number;
    const isCompleted = current > number;

    return (
        <div className="flex items-center gap-2">
            <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors border
                ${isActive ? 'bg-[#21808D] border-[#21808D] text-white' :
                    isCompleted ? 'bg-teal-50 border-teal-100 text-[#21808D]' : 'bg-zinc-100 border-black/5 text-zinc-400'}
            `}>
                {isCompleted ? <Check className="w-4 h-4" /> : number}
            </div>
            <span className={`text-sm font-semibold ${isActive ? 'text-zinc-950 font-bold' : isCompleted ? 'text-teal-800' : 'text-zinc-400'}`}>
                {label}
            </span>
        </div>
    );
};

// --- Sub-components placeholders ---

const Step1JobDetails = ({ jobData, setJobData, offer }: any) => {
    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zlecenia</label>
                <input
                    type="text"
                    value={jobData.name}
                    onChange={e => setJobData({ ...jobData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lokalizacja</label>
                <input
                    type="text"
                    value={jobData.location}
                    onChange={e => setJobData({ ...jobData, location: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
            </div>

            {/* Schedule dates */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Realizacja od</label>
                    <input
                        type="date"
                        value={jobData.plannedStartDate ? jobData.plannedStartDate.slice(0, 10) : ''}
                        onChange={e => setJobData({
                            ...jobData,
                            plannedStartDate: e.target.value ? new Date(e.target.value).toISOString() : undefined
                        })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Realizacja do</label>
                    <input
                        type="date"
                        value={jobData.plannedEndDate ? jobData.plannedEndDate.slice(0, 10) : ''}
                        min={jobData.plannedStartDate ? jobData.plannedStartDate.slice(0, 10) : undefined}
                        onChange={e => setJobData({
                            ...jobData,
                            plannedEndDate: e.target.value ? new Date(e.target.value).toISOString() : undefined
                        })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </div>
            </div>
            {jobData.plannedStartDate && jobData.plannedEndDate && new Date(jobData.plannedStartDate) > new Date(jobData.plannedEndDate) && (
                <p className="text-xs text-red-600">⚠️ Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.</p>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Planowana wartość (Netto)</label>
                <input
                    type="number"
                    value={jobData.revenuePlannedNet}
                    onChange={e => setJobData({ ...jobData, revenuePlannedNet: parseFloat(e.target.value) || 0, totalPlannedRevenueNet: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Domyślnie wartość oferty: {offer.totalCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</p>
            </div>
        </div>
    );
};

import { Plus } from 'lucide-react';

const Step2StageDefinition = ({ stages, setStages, offerTotal, offerItems, allocations, setAllocations }: any) => {

    // Recalculate stage value based on allocations whenever allocations change
    useEffect(() => {
        const stageSums: Record<string, number> = {};
        allocations.forEach((a: any) => {
            if (a.jobStageId) {
                stageSums[a.jobStageId] = (stageSums[a.jobStageId] || 0) + a.allocatedValueNet;
            }
        });

        setStages((prev: any[]) => prev.map(s => ({
            ...s,
            // If allocations exist for this stage, use sum. Else keep manual (or 0).
            // Actually to enforcing "modality", we should arguably overwrite.
            // But let's overwrite only if > 0 to allow manual override if really needed? 
            // Or strictly: Value = Sum of Allocations. 
            // Result: If you assign items, value updates. If you change value manually, it might drift?
            // Let's rely on Step 3 logic which already enforces this.
            plannedRevenueNet: stageSums[s.id] || s.plannedRevenueNet || 0
        })));
    }, [allocations]); // Intentionally not depending on setStages to avoid loops if setStages is stable

    const addStage = () => {
        setStages([...stages, {
            id: crypto.randomUUID(),
            name: `Etap ${stages.length + 1}`,
            type: 'podstawowy',
            status: 'planowany',
            plannedRevenueNet: 0
        }]);
    };

    const removeStage = (id: string) => {
        setStages(stages.filter((s: any) => s.id !== id));
        // Also remove allocations for this stage
        setAllocations(allocations.filter((a: any) => a.jobStageId !== id));
    };

    const updateStage = (id: string, field: string, value: any) => {
        setStages(stages.map((s: any) => s.id === id ? { ...s, [field]: value } : s));
    };

    const handleAssignItem = (stageId: string, itemId: string, checked: boolean) => {
        if (checked) {
            const item = offerItems.find((i: any) => i.id === itemId);
            if (!item) return;

            // Calculate remaining quantity
            const existingAllocations = allocations.filter((a: any) => a.offerItemId === itemId);
            const allocatedQty = existingAllocations.reduce((acc: number, a: any) => acc + (a.allocatedQuantity || (a.allocatedValueNet / (item.valueNet / item.quantity)) || 0), 0);

            // Default to remaining, or 1 if remaining is small/zero (to allow over-allocation if user wants, or just 1)
            // Let's default to remaining.
            const remainingQty = Math.max(0, item.quantity - allocatedQty);
            const quantityToAssign = remainingQty > 0 ? remainingQty : 0;

            // Calculate value
            const unitPrice = item.valueNet / item.quantity;
            const valueToAssign = quantityToAssign * unitPrice;

            // Remove existing allocations for this item IF we were in "steal" mode logic, 
            // BUT now with partials, we might want to ADD to existing?
            // User request: "In stage 1 there can be 1 piece". This implies splitting.
            // So if I check it here, I am adding a new allocation to THIS stage.
            // I should probably NOT wipe other stages if I am doing partials.
            // But the previous "stealing" logic was convenient. 
            // Hybrid: If I assign here, I check if it's fully assigned elsewhere. 
            // If handling quantities, "stealing" full item is less likely the only intent.
            // Let's KEEP "stealing" for simplicity of "Take Over" check, 
            // BUT if I change quantity, I am refining.
            // Actually, if I just "check" it, it's safer to not wipe others if we support partials.
            // However, the *primary* use case for Step 2 is "Define Scope". 
            // Usually scope is unique. 
            // If user wants split, they might check it here (getting remaining), and keep others.
            // Let's TRY to preserve others if quantity allows.

            const newAlloc = {
                id: crypto.randomUUID(),
                offerItemId: itemId,
                jobStageId: stageId,
                jobId: '',
                allocatedValueNet: valueToAssign,
                allocatedQuantity: quantityToAssign,
                // Extra fields for context creation
                offerItemName: item.name,
                originalQuantity: item.quantity
            };
            setAllocations([...allocations, newAlloc]);
        } else {
            // Unassign
            setAllocations(allocations.filter((a: any) => !(a.offerItemId === itemId && a.jobStageId === stageId)));
        }
    };

    const handleUpdateQuantity = (stageId: string, itemId: string, qty: number) => {
        const item = offerItems.find((i: any) => i.id === itemId);
        if (!item) return;

        setAllocations(allocations.map((a: any) => {
            if (a.offerItemId === itemId && a.jobStageId === stageId) {
                const unitPrice = item.valueNet / item.quantity;
                return {
                    ...a,
                    allocatedQuantity: qty,
                    allocatedValueNet: qty * unitPrice,
                    offerItemName: item.name,
                    originalQuantity: item.quantity
                };
            }
            return a;
        }));
    };

    const currentTotal = stages.reduce((acc: number, s: any) => acc + (s.plannedRevenueNet || 0), 0);
    const remaining = offerTotal - currentTotal;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-zinc-950">Zdefiniuj etapy</h3>
                <button onClick={addStage} className="text-[#21808D] hover:opacity-80 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all">
                    <Plus className="w-4 h-4" /> Dodaj etap
                </button>
            </div>

            <div className="bg-teal-50/50 border border-teal-100/50 p-4 rounded-xl flex justify-between items-center text-sm text-[#21808D] font-medium shadow-sm">
                <span>Wartość oferty: <b>{offerTotal.toLocaleString('pl-PL')} PLN</b></span>
                <span className={remaining !== 0 ? 'text-amber-700' : 'text-teal-800'}>
                    Do przydzielenia: <b>{remaining.toLocaleString('pl-PL')} PLN</b>
                </span>
            </div>

            <div className="space-y-4">
                {stages.map((stage: any) => {
                    // Get items assigned to this stage
                    const stageAllocations = allocations.filter((a: any) => a.jobStageId === stage.id);

                    return (
                        <div key={stage.id} className="flex flex-col gap-4 p-5 bg-white rounded-2xl border border-black/10 shadow-sm transition-all">
                            <div className="flex gap-4 items-start">
                                <div className="flex-1 space-y-3">
                                    <input
                                        type="text"
                                        value={stage.name}
                                        onChange={e => updateStage(stage.id, 'name', e.target.value)}
                                        className="w-full border border-black/10 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:border-[#21808D] outline-none transition-all font-semibold text-zinc-900"
                                        placeholder="Nazwa etapu"
                                    />
                                    <div className="flex gap-3">
                                        <select
                                            value={stage.type}
                                            onChange={e => updateStage(stage.id, 'type', e.target.value)}
                                            className="border border-black/10 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:border-[#21808D] outline-none transition-all font-semibold text-zinc-800"
                                        >
                                            <option value="podstawowy">Podstawowy</option>
                                            <option value="dodatkowy">Dodatkowy</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={stage.plannedRevenueNet}
                                            onChange={e => updateStage(stage.id, 'plannedRevenueNet', parseFloat(e.target.value) || 0)}
                                            className="border border-black/10 rounded-xl px-3 py-2 text-sm w-36 bg-zinc-100/50 font-bold text-zinc-950 text-right cursor-not-allowed" // Make read-only-ish visual
                                            placeholder="Wartość"
                                            readOnly
                                        />
                                    </div>
                                </div>
                                {stages.length > 1 && (
                                    <button onClick={() => removeStage(stage.id)} className="p-2 text-zinc-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Item Selector Section */}
                            <div className="bg-zinc-50/50 p-4 rounded-xl border border-black/5">
                                <div className="text-[10px] font-bold text-zinc-400 mb-3 uppercase tracking-wider">Przypisane pozycje z oferty</div>
                                <div className="space-y-2">
                                    {offerItems.map((item: any) => {
                                        const alloc = stageAllocations.find((a: any) => a.offerItemId === item.id);
                                        const isAssignedToThis = !!alloc;
                                        const isAssignedToOther = allocations.some((a: any) => a.offerItemId === item.id && a.jobStageId !== stage.id);

                                        return (
                                            <label key={item.id} className={`flex items-start gap-3 text-sm p-2 rounded-xl border border-transparent hover:border-black/5 hover:bg-white transition-all cursor-pointer ${isAssignedToOther && !isAssignedToThis ? 'opacity-50 bg-zinc-50/20' : 'bg-white/60'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isAssignedToThis}
                                                    onChange={(e) => handleAssignItem(stage.id, item.id, e.target.checked)}
                                                    className="mt-1 rounded border-black/10 text-[#21808D] focus:ring-[#21808D] h-4 w-4"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <span className={isAssignedToThis ? 'font-semibold text-[#21808D]' : isAssignedToOther ? 'text-zinc-400 line-through' : 'text-zinc-700'}>
                                                            {item.name}
                                                        </span>
                                                        {isAssignedToThis && item.quantity > 1 && (
                                                            <div className="flex items-center gap-1.5 ml-2" onClick={e => e.stopPropagation()}>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.quantity}
                                                                    step="0.01"
                                                                    className="w-16 h-7 text-xs text-right border border-black/10 rounded-lg px-2 font-semibold bg-zinc-50"
                                                                    value={alloc.allocatedQuantity ?? item.quantity}
                                                                    onChange={e => handleUpdateQuantity(stage.id, item.id, parseFloat(e.target.value) || 0)}
                                                                />
                                                                <span className="text-xs text-zinc-550 font-medium">/ {item.quantity} {item.unit}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {isAssignedToOther && !isAssignedToThis && (
                                                        <span className="text-[10px] text-amber-700 ml-1 font-semibold uppercase tracking-wider bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/50">Przypisany w innym</span>
                                                    )}
                                                    <div className="text-xs text-zinc-450 mt-1">
                                                        {!isAssignedToThis && <>{item.quantity} {item.unit} · </>}
                                                        {isAssignedToThis && <>{(alloc.allocatedValueNet || 0).toLocaleString('pl-PL')} PLN / </>}
                                                        {item.valueNet?.toLocaleString('pl-PL')} PLN
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const Step3Allocation = ({ stages, offerItems, allocations, setAllocations, setStages }: any) => {
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const [quickStageId, setQuickStageId] = useState<string>(stages[0]?.id || '');

    // Auto-set quickStageId when stages change
    useEffect(() => {
        if (!quickStageId && stages.length > 0) setQuickStageId(stages[0].id);
    }, [stages]);

    // Assign ALL items to one stage at once
    const handleAssignAll = () => {
        if (!quickStageId) return;
        const stage = stages.find((s: any) => s.id === quickStageId);
        if (!stage) return;

        const newAllocations = offerItems.map((item: any) => ({
            id: crypto.randomUUID(),
            offerItemId: item.id,
            jobStageId: quickStageId,
            jobId: '',
            allocatedValueNet: item.valueNet,
            offerItemName: item.name,
            originalQuantity: item.quantity
        }));
        // Replace all allocations with new ones (bulk assign)
        setAllocations(newAllocations);
    };


    // Calculate stage sums from allocations
    useEffect(() => {
        const stageSums: Record<string, number> = {};
        allocations.forEach((a: any) => {
            if (a.jobStageId) {
                stageSums[a.jobStageId] = (stageSums[a.jobStageId] || 0) + a.allocatedValueNet;
            }
        });

        setStages((prev: any[]) => prev.map(s => ({
            ...s,
            plannedRevenueNet: stageSums[s.id] || 0
        })));

    }, [allocations, setStages]);

    const handleAddAllocation = (itemId: string, maxAvailable: number) => {
        const newAlloc = {
            id: crypto.randomUUID(),
            offerItemId: itemId,
            jobStageId: '',
            jobId: '',
            allocatedValueNet: maxAvailable, // Default to remaining
            offerItemName: (offerItems.find((i: any) => i.id === itemId) as any)?.name,
            originalQuantity: (offerItems.find((i: any) => i.id === itemId) as any)?.quantity
        };
        setAllocations([...allocations, newAlloc]);
    };

    const handleUpdateAllocation = (allocId: string, field: string, value: any) => {
        setAllocations(allocations.map((a: any) => a.id === allocId ? { ...a, [field]: value } : a));
    };

    const handleRemoveAllocation = (allocId: string) => {
        setAllocations(allocations.filter((a: any) => a.id !== allocId));
    };

    // Quick assign: Removes all existing and sets one 100% allocation
    const handleQuickAssign = (itemId: string, stageId: string, itemValue: number) => {
        // Remove old
        const others = allocations.filter((a: any) => a.offerItemId !== itemId);

        if (!stageId) {
            setAllocations(others);
            return;
        }

        const newAlloc = {
            id: crypto.randomUUID(),
            offerItemId: itemId,
            jobStageId: stageId,
            jobId: '',
            allocatedValueNet: itemValue,
            offerItemName: (offerItems.find((i: any) => i.id === itemId) as any)?.name,
            originalQuantity: (offerItems.find((i: any) => i.id === itemId) as any)?.quantity
        };
        setAllocations([...others, newAlloc]);
    };

    const getItemAllocations = (itemId: string) => allocations.filter((a: any) => a.offerItemId === itemId);

    const getItemStats = (item: any) => {
        const itemAllocations = getItemAllocations(item.id);
        const allocatedSum = itemAllocations.reduce((acc: number, a: any) => acc + (a.allocatedValueNet || 0), 0);
        const remaining = item.valueNet - allocatedSum;
        return { allocatedSum, remaining, isFullyAllocated: Math.abs(remaining) < 0.01 };
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4">
                <p>Przypisz pozycje z oferty do etapów. Możesz podzielić jedną pozycję na wiele etapów.</p>
            </div>

            {/* Quick assign ALL */}
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-sm font-medium text-amber-900 whitespace-nowrap">Przypisz wszystkie do:</span>
                <select
                    className="flex-1 border border-amber-300 rounded px-2 py-1.5 text-sm bg-white"
                    value={quickStageId}
                    onChange={e => setQuickStageId(e.target.value)}
                >
                    {stages.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                <button
                    onClick={handleAssignAll}
                    disabled={!quickStageId}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm font-semibold whitespace-nowrap disabled:opacity-50 transition-colors"
                >
                    ✓ Przypisz wszystkie
                </button>
            </div>

            <div className="overflow-hidden border border-gray-200 rounded-lg">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-4 py-3">Pozycja</th>
                            <th className="px-4 py-3 text-right">Wartość pozycji</th>
                            <th className="px-4 py-3 w-48">Szybkie przypisanie</th>
                            <th className="px-4 py-3 text-right">Przydzielono</th>
                            <th className="px-4 py-3 text-right">Pozostało</th>
                            <th className="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {offerItems.map((item: any) => {
                            const { allocatedSum, remaining, isFullyAllocated } = getItemStats(item);
                            const isExpanded = expandedItem === item.id;
                            const itemAllocations = getItemAllocations(item.id);

                            // Determine quick state
                            const isSplit = itemAllocations.length > 1;
                            const singleStageId = itemAllocations.length === 1 ? itemAllocations[0].jobStageId : '';

                            return (
                                <Fragment key={item.id}>
                                    {/* Use Fragment replacement since key is on tr */}
                                    <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{item.name}</div>
                                            <div className="text-xs text-gray-500">{item.quantity} {item.unit}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {item.valueNet?.toLocaleString('pl-PL')}
                                        </td>
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            {isSplit ? (
                                                <button
                                                    onClick={() => setExpandedItem(item.id)}
                                                    className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded w-full border border-amber-200"
                                                >
                                                    Rozdzielone (edytuj)
                                                </button>
                                            ) : (
                                                <select
                                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                                    value={singleStageId}
                                                    onChange={(e) => handleQuickAssign(item.id, e.target.value, item.valueNet)}
                                                >
                                                    <option value="">-- Wybierz --</option>
                                                    {stages.map((s: any) => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-blue-600">
                                            {allocatedSum.toLocaleString('pl-PL')}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={remaining < -0.01 ? 'text-red-600 font-bold' : isFullyAllocated ? 'text-green-600 flex items-center justify-end gap-1' : 'text-amber-600'}>
                                                {isFullyAllocated && <Check className="w-3 h-3" />}
                                                {remaining.toLocaleString('pl-PL')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={6} className="bg-gray-50 px-4 py-4 shadow-inner">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-semibold uppercase text-gray-500">Alokacje szczegółowe</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAddAllocation(item.id, Math.max(0, remaining)); }}
                                                            disabled={remaining <= 0}
                                                            className="text-xs bg-white border border-gray-300 hover:bg-gray-100 px-2 py-1 rounded disabled:opacity-50"
                                                        >
                                                            + Dodaj podział
                                                        </button>
                                                    </div>

                                                    {itemAllocations.length === 0 && (
                                                        <div className="text-sm text-gray-400 italic text-center py-2">Brak alokacji. Wybierz etap wyżej lub dodaj podział.</div>
                                                    )}

                                                    {itemAllocations.map((alloc: any) => (
                                                        <div key={alloc.id} className="flex gap-3 items-center">
                                                            <div className="flex-1">
                                                                <select
                                                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                                                    value={alloc.jobStageId}
                                                                    onChange={(e) => handleUpdateAllocation(alloc.id, 'jobStageId', e.target.value)}
                                                                >
                                                                    <option value="">-- Wybierz etap --</option>
                                                                    {stages.map((s: any) => (
                                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="w-32">
                                                                <input
                                                                    type="number"
                                                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right"
                                                                    value={alloc.allocatedValueNet}
                                                                    onChange={(e) => handleUpdateAllocation(alloc.id, 'allocatedValueNet', parseFloat(e.target.value) || 0)}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => handleRemoveAllocation(alloc.id)}
                                                                className="text-gray-400 hover:text-red-500"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
                {stages.map((stage: any) => (
                    <div key={stage.id} className="p-4 bg-gray-50 rounded border border-gray-200">
                        <div className="text-sm font-medium text-gray-700">{stage.name}</div>
                        <div className="text-xl font-bold text-blue-600 mt-1">
                            {stage.plannedRevenueNet?.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Suma z alokacji</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
