import { useState, useEffect, Fragment } from 'react';
import { useJobs } from '../../context/JobsContext';
import { useOffers } from '../../context/OffersContext';
import { stageBomCalculator } from '../../services/bom/stageBomCalculator';
import type { StageMaterialDemand, JobStageItem, JobMaterialItem, Construction } from '../../models/types';
import { getAdapter } from '../../services/storage/adapterFactory';
import { 
    Loader2, 
    ChevronDown, 
    ChevronRight, 
    Package, 
    Printer, 
    Info, 
    ListTodo, 
    Plus, 
    Trash2,
    FileDown,
    Copy
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { generateMaterialsReport } from '../../services/reports/MaterialsReportPDF';

interface JobMaterialsTabProps {
    jobId: string;
}

export const JobMaterialsTab = ({ jobId }: JobMaterialsTabProps) => {
    const [activeSubTab, setActiveSubTab] = useState<'bom' | 'logistics'>('bom');
    const [bomData, setBomData] = useState<StageMaterialDemand | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [fromOffer, setFromOffer] = useState(false);

    // Logistics List State
    const [newMatName, setNewMatName] = useState('');
    const [newMatQty, setNewMatQty] = useState<number>(1);

    const { jobs, updateJob } = useJobs();
    const { getConstructionsForOffer, offers } = useOffers();
    const job = jobs.find((j: { id: string }) => j.id === jobId);
    const logisticsList: JobMaterialItem[] = job?.materials || [];

    useEffect(() => {
        loadData();
    }, [jobId]);

    const loadData = async () => {
        setIsLoading(true);
        setFromOffer(false);
        try {
            const result = await stageBomCalculator.calculateForJob(jobId);
            if (result.items.length > 0) {
                setBomData(result);
                return;
            }

            const linkedOfferId = job?.offerId || job?.sourceOfferId;
            if (linkedOfferId) {
                const constructions = await getConstructionsForOffer(linkedOfferId);
                if (constructions.length > 0) {
                    const virtualItems: JobStageItem[] = constructions.map(c => ({
                        id: c.id,
                        jobId,
                        stageId: 'offer',
                        constructionId: c.id,
                        constructionName: c.name,
                        offerId: linkedOfferId,
                        quantityFromOffer: c.quantity,
                        quantityInStage: c.quantity,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }));
                    const offerResult = await stageBomCalculator.calculateForStage(virtualItems);
                    setBomData(offerResult);
                    setFromOffer(true);
                    return;
                }
            }

            const offerNumber = (job as any)?.offerNumber;
            if (offerNumber) {
                const matchedOffer = offers.find((o: any) => o.number === offerNumber);
                if (matchedOffer) {
                    const constructions = await getConstructionsForOffer(matchedOffer.id);
                    if (constructions.length > 0) {
                        const virtualItems: JobStageItem[] = constructions.map(c => ({
                            id: c.id,
                            jobId,
                            stageId: 'offer',
                            constructionId: c.id,
                            constructionName: c.name,
                            offerId: matchedOffer.id,
                            quantityFromOffer: c.quantity,
                            quantityInStage: c.quantity,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        }));
                        const offerResult = await stageBomCalculator.calculateForStage(virtualItems);
                        setBomData(offerResult);
                        setFromOffer(true);
                        return;
                    }
                }
            }

            // Fallback 3: check if there are constructions directly linked to the job via jobId
            const constructionsRepo = getAdapter<Construction>('constructions');
            const jobConstructions = await constructionsRepo.getByIndex('by-job', jobId);
            if (jobConstructions && jobConstructions.length > 0) {
                const virtualItems: JobStageItem[] = jobConstructions.map(c => ({
                    id: c.id,
                    jobId,
                    stageId: 'direct',
                    constructionId: c.id,
                    constructionName: c.name,
                    offerId: '',
                    quantityFromOffer: c.quantity,
                    quantityInStage: c.quantity,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }));
                const directResult = await stageBomCalculator.calculateForStage(virtualItems);
                setBomData(directResult);
                return;
            }

            setBomData(result);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleExpand = (materialId: string) => {
        const next = new Set(expandedItems);
        if (next.has(materialId)) {
            next.delete(materialId);
        } else {
            next.add(materialId);
        }
        setExpandedItems(next);
    };

    // Logistics List CRUD (Optimistic Updates in background)
    const updateLogisticsInDb = async (updatedList: JobMaterialItem[]) => {
        if (!job) return;
        try {
            await updateJob(job.id, { materials: updatedList });
        } catch (err) {
            console.error('Failed to update logistics list:', err);
            toast.error('Błąd podczas zapisywania zmian w tle.');
        }
    };

    const handleAddMaterial = () => {
        if (!newMatName.trim() || !job) return;
        const newItem: JobMaterialItem = {
            id: `mat-${uuidv4()}`,
            name: newMatName.trim(),
            quantity: Number(newMatQty) || 1,
            status: 'to_order'
        };

        const updated = [...logisticsList, newItem];
        // Save to state and trigger DB write in background (optimistic)
        updateLogisticsInDb(updated);
        
        setNewMatName('');
        setNewMatQty(1);
        toast.success('Dodano materiał do listy.');
    };

    const handleDeleteMaterial = (id: string) => {
        const updated = logisticsList.filter(item => item.id !== id);
        updateLogisticsInDb(updated);
        toast.info('Usunięto materiał.');
    };

    const handleStatusChange = (id: string, newStatus: JobMaterialItem['status']) => {
        const updated = logisticsList.map(item => 
            item.id === id ? { ...item, status: newStatus } : item
        );
        updateLogisticsInDb(updated);
    };

    const handleQtyChange = (id: string, newQty: number) => {
        const updated = logisticsList.map(item => 
            item.id === id ? { ...item, quantity: Math.max(0, newQty) } : item
        );
        updateLogisticsInDb(updated);
    };

    const handleCopyBomToLogistics = () => {
        if (!bomData || !job) return;
        if (confirm('Czy na pewno chcesz skopiować zapotrzebowanie BOM do listy logistycznej? Spowoduje to dodanie brakujących pozycji.')) {
            const currentList = [...logisticsList];
            let addedCount = 0;
            bomData.items.forEach(bomItem => {
                const exists = currentList.some(item => item.name.toLowerCase() === bomItem.materialName.toLowerCase());
                if (!exists) {
                    currentList.push({
                        id: `mat-${uuidv4()}`,
                        name: bomItem.materialName,
                        quantity: Math.ceil(bomItem.totalQuantity),
                        status: 'to_order'
                    });
                    addedCount++;
                }
            });
            if (addedCount > 0) {
                updateLogisticsInDb(currentList);
                toast.success(`Pomyślnie dodano ${addedCount} pozycji z BOM do listy logistycznej.`);
            } else {
                toast.info('Wszystkie pozycje z BOM znajdują się już na liście logistycznej.');
            }
        }
    };



    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>Przeliczanie zapotrzebowania zlecenia...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Sub-tab navigation */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200/60 shadow-sm print:hidden">
                <div className="flex bg-slate-100 p-1.5 rounded-xl border border-gray-200/50 w-fit">
                    <button
                        onClick={() => setActiveSubTab('bom')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                            activeSubTab === 'bom'
                                ? 'bg-white text-blue-600 shadow-sm border border-gray-200/20'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Package className="w-4 h-4" />
                        Zapotrzebowanie BOM (Z oferty)
                    </button>
                    <button
                        onClick={() => setActiveSubTab('logistics')}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                            activeSubTab === 'logistics'
                                ? 'bg-white text-blue-600 shadow-sm border border-gray-200/20'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <ListTodo className="w-4 h-4" />
                        Lista Logistyczna
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {activeSubTab === 'bom' && bomData && bomData.items.length > 0 && (
                        <button
                            onClick={handleCopyBomToLogistics}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-blue-100/50"
                            title="Kopiuj zapotrzebowanie BOM do listy logistycznej"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            Kopiuj do listy logistycznej
                        </button>
                    )}
                    
                    <button
                        onClick={() => generateMaterialsReport(job!, bomData, logisticsList)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-50 text-[#21808D] border border-teal-100/50 hover:bg-teal-100/50 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
                        title="Generuj wykaz materiałów montażowych w PDF"
                    >
                        <FileDown className="w-4 h-4" />
                        Pobierz wykaz PDF
                    </button>
                </div>
            </div>

            {activeSubTab === 'bom' ? (
                // ZAPOTRZEBOWANIE BOM (READ-ONLY)
                <>
                    {!bomData || bomData.items.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                            <div className="flex justify-center mb-4">
                                <div className="p-3 bg-gray-100 rounded-full">
                                    <Package className="w-6 h-6 text-gray-400" />
                                </div>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">Brak materiałów</h3>
                            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                                Zlecenie nie ma przypisanych żadnych konstrukcji w etapach ani powiązanej oferty.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                            <Package className="w-5 h-5 text-blue-600" />
                                            Główne Zestawienie Materiałowe
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Agregacja zapotrzebowania ze wszystkich etapów dla zlecenia {job?.jobCode}
                                        </p>
                                        {fromOffer && (
                                            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 w-fit">
                                                <Info className="w-3.5 h-3.5 shrink-0" />
                                                Dane pobrane z oferty — przypisz konstrukcje do etapów aby zobaczyć podział per-etap.
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 uppercase font-semibold">Pozycji</p>
                                            <p className="text-xl font-bold text-gray-900">{bomData.items.length}</p>
                                        </div>
                                        <div className="h-8 w-px bg-gray-200"></div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 uppercase font-semibold">Koszt całkowity</p>
                                            <p className="text-xl font-bold text-blue-600">
                                                {bomData.totalCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => window.print()}
                                            className="ml-4 p-2 text-gray-500 hover:text-gray-900 hover:bg-white rounded-lg transition-colors print:hidden"
                                            title="Drukuj"
                                        >
                                            <Printer className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 border-b border-gray-200 uppercase text-xs tracking-wider">
                                            <tr>
                                                <th className="w-8 px-6 py-3"></th>
                                                <th className="px-6 py-3 font-semibold">Materiał</th>
                                                <th className="px-6 py-3 font-semibold text-right">Ilość Brutto</th>
                                                <th className="px-6 py-3 font-semibold text-right">Jedn.</th>
                                                <th className="px-6 py-3 font-semibold text-right">Wartość</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {bomData.items.map((item) => (
                                                <Fragment key={item.materialId}>
                                                    <tr
                                                        className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                                        onClick={() => toggleExpand(item.materialId)}
                                                    >
                                                        <td className="px-6 py-4 text-gray-400 w-8">
                                                            {expandedItems.has(item.materialId) ? (
                                                                <ChevronDown className="w-4 h-4 text-blue-500" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 group-hover:text-blue-500" />
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                                                            {item.materialName}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-bold font-mono text-gray-900 bg-gray-50/50">
                                                            {item.totalQuantity.toFixed(2)}
                                                        </td>
                                                        <td className="px-6 py-4 text-right text-gray-500">
                                                            {item.unit}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-medium text-gray-900">
                                                            {item.totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                                                        </td>
                                                    </tr>
                                                    {expandedItems.has(item.materialId) && (
                                                        <tr className="bg-gray-50/80 animate-in fade-in duration-200">
                                                            <td colSpan={5} className="px-6 py-4 pl-14">
                                                                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Źródła zapotrzebowania (Konstrukcje)</h4>
                                                                    <div className="space-y-2">
                                                                        {item.sourceBreakdown.map((source: any, idx: number) => (
                                                                            <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                                                                                    <span className="text-gray-700 font-medium">{source.constructionName}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-4 text-gray-500">
                                                                                    <span className="font-mono text-xs">
                                                                                        Baza: {source.baseQuantity.toFixed(2)} {item.unit}
                                                                                        <span className="text-gray-300 mx-2">|</span>
                                                                                        Narzut: {item.wastePercent}%
                                                                                    </span>
                                                                                    <span className="font-bold text-gray-900 w-24 text-right">
                                                                                        {(source.baseQuantity * (1 + item.wastePercent / 100)).toFixed(2)} {item.unit}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </>
            ) : (
                // LISTA LOGISTYCZNA (EDITABLE & OPTIMISTIC AUTO-SAVE)
                <div className="space-y-4">
                    {/* Add material bar */}
                    <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200/60 shadow-sm">
                        <div className="flex-1">
                            <input 
                                type="text"
                                value={newMatName}
                                onChange={(e) => setNewMatName(e.target.value)}
                                placeholder="Nazwa materiału (np. Pianka niskoprężna, Kotwy montażowe)..."
                                className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="w-32">
                            <input 
                                type="number"
                                value={newMatQty}
                                onChange={(e) => setNewMatQty(Number(e.target.value) || 1)}
                                min={1}
                                className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold"
                            />
                        </div>
                        <button
                            onClick={handleAddMaterial}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Dodaj do listy
                        </button>
                    </div>

                    {/* Logistics Checklist Table */}
                    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        <th className="px-6 py-3.5">Materiał</th>
                                        <th className="px-6 py-3.5 w-32 text-right">Ilość (szt)</th>
                                        <th className="px-6 py-3.5 w-56 text-center">Status</th>
                                        <th className="px-6 py-3.5 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {logisticsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                                                <ListTodo className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                                <p className="font-semibold text-sm">Lista logistyczna jest pusta</p>
                                                <p className="text-xs mt-1">Wpisz materiał powyżej, aby dodać go do listy realizacji.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        logisticsList.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50/50 transition-all">
                                                <td className="px-6 py-3.5 font-medium text-gray-800">
                                                    {item.name}
                                                </td>
                                                <td className="px-6 py-3.5 text-right">
                                                    <input 
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => handleQtyChange(item.id, Number(e.target.value))}
                                                        className="w-20 text-right bg-transparent border-0 focus:ring-1 focus:ring-blue-500 focus:bg-white rounded py-0.5 px-1 font-bold text-gray-900"
                                                    />
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <div className="flex justify-center">
                                                        <select
                                                            value={item.status}
                                                            onChange={(e) => handleStatusChange(item.id, e.target.value as JobMaterialItem['status'])}
                                                            className={`text-xs font-semibold rounded-lg px-2.5 py-1 border outline-none ${
                                                                item.status === 'packed'
                                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                                    : item.status === 'in_stock'
                                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}
                                                        >
                                                            <option value="to_order">Do zamówienia</option>
                                                            <option value="in_stock">W magazynie</option>
                                                            <option value="packed">Spakowane</option>
                                                        </select>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3.5 text-center">
                                                    <button
                                                        onClick={() => handleDeleteMaterial(item.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
