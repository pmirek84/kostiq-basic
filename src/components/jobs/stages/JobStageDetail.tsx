import { useState, useEffect } from 'react';
import type { Job, JobStage, JobStageItem, Construction } from '../../../models/types';
import { useJobs } from '../../../context/JobsContext';
import { useOffers } from '../../../context/OffersContext';
import { stageBomCalculator } from '../../../services/bom/stageBomCalculator';
import type { StageMaterialDemand } from '../../../models/types';
import { StageBOMTable } from './StageBOMTable';
import { Plus, Trash2, ArrowLeft, Save, X } from 'lucide-react';

interface JobStageDetailProps {
    job: Job;
    stage: JobStage;
    onBack: () => void;
}

export const JobStageDetail = ({ job, stage, onBack }: JobStageDetailProps) => {
    const { getJobStageItems, addJobStageItem, updateJobStageItem, deleteJobStageItem } = useJobs();
    const { getConstructionsForOffer } = useOffers();

    // State
    const [items, setItems] = useState<JobStageItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Add Modal State
    const [offerConstructions, setOfferConstructions] = useState<Construction[]>([]);
    const [selectedConstraints, setSelectedConstraints] = useState<{ [constId: string]: number }>({}); // store quantity
    const [loadingConstructions, setLoadingConstructions] = useState(false);

    // BOM State
    const [bomData, setBomData] = useState<StageMaterialDemand | null>(null);
    const [calculating, setCalculating] = useState(false);

    const handleCalculateBom = async () => {
        setCalculating(true);
        try {
            const result = await stageBomCalculator.calculateForStage(items);
            setBomData(result);
        } catch (error) {
            console.error('BOM Calculation failed:', error);
            alert('Błąd obliczeń BOM');
        } finally {
            setCalculating(false);
        }
    };

    useEffect(() => {
        loadItems();
    }, [stage.id, job.id]);

    const loadItems = async () => {
        try {
            setIsLoading(true);
            const data = await getJobStageItems(job.id);
            const stageItems = data.filter(i => i.stageId === stage.id);
            setItems(stageItems);
        } catch (error) {
            console.error('Failed to load stage items:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenAddModal = async () => {
        if (!job.offerId) {
            alert('To zlecenie nie jest powiązane z ofertą.');
            return;
        }
        setIsAddModalOpen(true);
        setLoadingConstructions(true);
        try {
            const constructions = await getConstructionsForOffer(job.offerId);
            setOfferConstructions(constructions);
        } catch (e) {
            console.error('Failed to load constructions', e);
        } finally {
            setLoadingConstructions(false);
        }
    };

    const handleToggleConstruction = (c: Construction) => {
        const currentQty = selectedConstraints[c.id];
        if (currentQty !== undefined) {
            // Deselect
            const next = { ...selectedConstraints };
            delete next[c.id];
            setSelectedConstraints(next);
        } else {
            // Select (default to max available from offer, minus used maybe? logic simpler for now: just offer qty)
            setSelectedConstraints({
                ...selectedConstraints,
                [c.id]: c.quantity
            });
        }
    };

    const handleQuantityChange = (cId: string, qty: number) => {
        setSelectedConstraints({
            ...selectedConstraints,
            [cId]: qty
        });
    };

    const handleSaveSelection = async () => {
        if (!job.offerId) return;

        for (const [cId, qty] of Object.entries(selectedConstraints)) {
            const construction = offerConstructions.find(c => c.id === cId);
            if (!construction) continue;

            const existingAssignment = items.find(i => i.constructionId === cId);
            if (existingAssignment) {
                // Update existing? Or skip? For now skip or maybe update qty
                continue;
            }

            await addJobStageItem({
                jobId: job.id,
                stageId: stage.id,
                constructionId: cId,
                constructionName: construction.name,
                offerId: job.offerId,
                quantityFromOffer: construction.quantity,
                quantityInStage: qty
            });
        }
        setIsAddModalOpen(false);
        setSelectedConstraints({});
        loadItems();
    };

    const handleDeleteItem = async (itemId: string) => {
        if (window.confirm('Czy na pewno chcesz usunąć tę konstrukcję z etapu?')) {
            await deleteJobStageItem(itemId);
            loadItems();
        }
    };

    const handleUpdateQuantity = async (item: JobStageItem, newQty: number) => {
        await updateJobStageItem(item.id, { quantityInStage: newQty });
        loadItems();
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{stage.name}</h2>
                        <p className="text-sm text-gray-500">Zarządzanie zakresem i materiałami</p>
                    </div>
                </div>
                <div>
                    {/* Placeholder for BOM button later */}
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Assigned Items */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-gray-900">Konstrukcje w etapie</h3>
                            <button
                                onClick={handleOpenAddModal}
                                className="text-sm text-blue-600 font-medium hover:text-blue-800 flex items-center bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                                <Plus className="w-4 h-4 mr-1.5" />
                                Dodaj z oferty
                            </button>
                        </div>

                        {isLoading ? (
                            <div className="text-center py-8 text-gray-400">Ładowanie...</div>
                        ) : items.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <p className="text-gray-500 text-sm">Brak przypisanych konstrukcji.</p>
                                <button onClick={handleOpenAddModal} className="mt-2 text-blue-600 text-sm font-medium hover:underline">
                                    Przypisz konstrukcje z oferty
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-medium">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Konstrukcja</th>
                                            <th className="px-4 py-3 text-center">Ilość w ofercie</th>
                                            <th className="px-4 py-3 text-center w-32">Ilość w etapie</th>
                                            <th className="px-4 py-3 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.map(item => (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-900">
                                                    {item.constructionName}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-500">
                                                    {item.quantityFromOffer}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-20 text-center border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                                                        value={item.quantityInStage}
                                                        onChange={(e) => handleUpdateQuantity(item, parseFloat(e.target.value) || 0)}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Calculations/Summary */}
                <div className="space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <StageBOMTable
                            data={bomData}
                            isLoading={calculating}
                            onRecalculate={handleCalculateBom}
                        />
                    </div>
                </div>

            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">Wybierz konstrukcje z oferty</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {loadingConstructions ? (
                                <div className="text-center py-8">Ładowanie...</div>
                            ) : offerConstructions.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">Brak konstrukcji w ofercie.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="px-4 py-2 w-10"></th>
                                            <th className="px-4 py-2 text-left">Nazwa</th>
                                            <th className="px-4 py-2 text-center">Wymiar</th>
                                            <th className="px-4 py-2 text-center">Ilość w ofercie</th>
                                            <th className="px-4 py-2 text-center w-24">Do etapu</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {offerConstructions.map(c => {
                                            const isSelected = selectedConstraints[c.id] !== undefined;
                                            return (
                                                <tr key={c.id} className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleConstruction(c)}
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-medium">{c.name}</td>
                                                    <td className="px-4 py-3 text-center text-gray-500">{c.width} x {c.height}</td>
                                                    <td className="px-4 py-3 text-center">{c.quantity}</td>
                                                    <td className="px-4 py-3">
                                                        {isSelected && (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={c.quantity}
                                                                className="w-full text-center border border-gray-300 rounded px-1 py-1 text-sm bg-white"
                                                                value={selectedConstraints[c.id]}
                                                                onChange={(e) => handleQuantityChange(c.id, parseFloat(e.target.value) || 0)}
                                                            />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSaveSelection}
                                disabled={Object.keys(selectedConstraints).length === 0}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Zapisz wybrane
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
