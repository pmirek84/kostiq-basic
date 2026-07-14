import { Plus, Trash2, FileText, List, Briefcase, Info, Package } from 'lucide-react';

interface OfferTemplateEditorProps {
    title: string;
    setTitle: (value: string) => void;
    scopeOfWork: string[];
    setScopeOfWork: (value: string[]) => void;
    notes: string[];
    setNotes: (value: string[]) => void;
    customMaterials: {
        providedByUs: string[];
        providedByClient: string[];
    };
    setCustomMaterials: (value: { providedByUs: string[]; providedByClient: string[] }) => void;
}

export default function OfferTemplateEditor({
    title,
    setTitle,
    scopeOfWork,
    setScopeOfWork,
    notes,
    setNotes,
    customMaterials,
    setCustomMaterials
}: OfferTemplateEditorProps) {

    const handleAddItem = (setter: (val: string[]) => void, current: string[]) => {
        setter([...current, '']);
    };

    const handleRemoveItem = (setter: (val: string[]) => void, current: string[], index: number) => {
        setter(current.filter((_, i) => i !== index));
    };

    const handleChangeItem = (setter: (val: string[]) => void, current: string[], index: number, value: string) => {
        const newItems = [...current];
        newItems[index] = value;
        setter(newItems);
    };

    return (
        <div className="space-y-10">
            {/* Title Section */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center space-x-2 mb-4 text-[#21808D]">
                    <FileText className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest px-2">Nagłówek i Tytuł Oferty</span>
                </div>
                <div className="relative">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-white border-2 border-gray-100 rounded-xl px-6 py-4 text-xl font-black text-gray-900 focus:border-[#21808D] focus:ring-4 focus:ring-[#21808D]/10 outline-none shadow-sm transition-all"
                        placeholder="Wpisz profesjonalny tytuł oferty..."
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Nazwa Wydruku</div>
                </div>
            </div>

            {/* Scope of Work */}
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center space-x-3">
                        <div className="bg-[#21808D]/10 p-2 rounded-lg">
                            <List className="h-5 w-5 text-[#21808D]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Zakres prac i usług</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">Szczegółowy opis czynności do wykonania</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleAddItem(setScopeOfWork, scopeOfWork)}
                        className="flex items-center space-x-2 bg-gray-50 hover:bg-[#21808D] hover:text-white text-[#21808D] px-4 py-2 rounded-lg text-xs font-black transition-all border border-gray-100 active:scale-95"
                    >
                        <Plus className="h-4 w-4" />
                        <span>DODAJ PUNKT</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {scopeOfWork.map((item, index) => (
                        <div key={index} className="group flex items-start gap-4 bg-white p-4 rounded-xl border border-gray-100 hover:border-[#21808D]/30 transition-all shadow-sm">
                            <div className="flex flex-col items-center">
                                <span className="text-xs font-black text-[#21808D] bg-[#21808D]/5 w-8 h-8 rounded-lg flex items-center justify-center border border-[#21808D]/10">{index + 1}</span>
                                <div className="w-[2px] flex-1 bg-gray-50 my-1 group-last:hidden"></div>
                            </div>
                            <textarea
                                value={item}
                                onChange={(e) => handleChangeItem(setScopeOfWork, scopeOfWork, index, e.target.value)}
                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 resize-none py-1 h-auto min-h-[40px] leading-relaxed"
                                rows={2}
                                placeholder="Wpisz opis czynności..."
                            />
                            <button
                                onClick={() => handleRemoveItem(setScopeOfWork, scopeOfWork, index)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all self-center opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                    {scopeOfWork.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-12 bg-gray-50/30 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
                            <Briefcase className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest text-center">Brak zdefiniowanego zakresu prac w ofercie</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Materials */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Provided by Us */}
                <div className="space-y-4">
                    <div className="bg-[#21808D]/5 p-4 rounded-xl border border-[#21808D]/10 flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                            <Package className="h-4 w-4 text-[#21808D]" />
                            <span className="text-xs font-black text-[#21808D] uppercase tracking-widest">Materiały Wykonawcy</span>
                        </div>
                        <button
                            onClick={() => handleAddItem(
                                (val) => setCustomMaterials({ ...customMaterials, providedByUs: val }),
                                customMaterials.providedByUs
                            )}
                            className="bg-white p-1.5 rounded-lg text-[#21808D] shadow-sm hover:bg-[#21808D] hover:text-white transition-all active:scale-95"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        {customMaterials.providedByUs.map((item, index) => (
                            <div key={index} className="flex gap-2 items-center bg-white p-2 pr-4 rounded-xl border border-gray-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#21808D] ml-4 shrink-0"></span>
                                <input
                                    type="text"
                                    value={item}
                                    onChange={(e) => {
                                        const newItems = [...customMaterials.providedByUs];
                                        newItems[index] = e.target.value;
                                        setCustomMaterials({ ...customMaterials, providedByUs: newItems });
                                    }}
                                    placeholder="Wpisz materiał..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-bold text-gray-700 py-2"
                                />
                                <button
                                    onClick={() => {
                                        const newItems = customMaterials.providedByUs.filter((_, i) => i !== index);
                                        setCustomMaterials({ ...customMaterials, providedByUs: newItems });
                                    }}
                                    className="text-gray-300 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Provided by Client */}
                <div className="space-y-4">
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                            <Info className="h-4 w-4 text-orange-600" />
                            <span className="text-xs font-black text-orange-600 uppercase tracking-widest">Materiały Zleceniodawcy</span>
                        </div>
                        <button
                            onClick={() => handleAddItem(
                                (val) => setCustomMaterials({ ...customMaterials, providedByClient: val }),
                                customMaterials.providedByClient
                            )}
                            className="bg-white p-1.5 rounded-lg text-orange-600 shadow-sm hover:bg-orange-600 hover:text-white transition-all active:scale-95"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        {customMaterials.providedByClient.map((item, index) => (
                            <div key={index} className="flex gap-2 items-center bg-white p-2 pr-4 rounded-xl border border-gray-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 ml-4 shrink-0"></span>
                                <input
                                    type="text"
                                    value={item}
                                    onChange={(e) => {
                                        const newItems = [...customMaterials.providedByClient];
                                        newItems[index] = e.target.value;
                                        setCustomMaterials({ ...customMaterials, providedByClient: newItems });
                                    }}
                                    placeholder="Wpisz materiał..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-bold text-gray-700 py-2"
                                />
                                <button
                                    onClick={() => {
                                        const newItems = customMaterials.providedByClient.filter((_, i) => i !== index);
                                        setCustomMaterials({ ...customMaterials, providedByClient: newItems });
                                    }}
                                    className="text-gray-300 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Notes */}
            <div className="bg-amber-50/50 p-8 rounded-2xl border border-amber-100">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-2 text-amber-900">
                        <Info className="h-5 w-5" />
                        <h3 className="text-sm font-black uppercase tracking-widest">Uwagi i warunki dodatkowe</h3>
                    </div>
                    <button
                        onClick={() => handleAddItem(setNotes, notes)}
                        className="bg-amber-600 text-white px-5 py-2 rounded-xl text-xs font-black shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95 flex items-center space-x-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span>DODAJ UWAGĘ</span>
                    </button>
                </div>
                <div className="space-y-3">
                    {notes.map((item, index) => (
                        <div key={index} className="group flex gap-4 items-start bg-white p-4 rounded-xl shadow-sm border border-amber-50/50">
                            <span className="text-amber-400 font-black mt-1.5 shrink-0">•</span>
                            <textarea
                                value={item}
                                onChange={(e) => handleChangeItem(setNotes, notes, index, e.target.value)}
                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-amber-900/80 leading-relaxed resize-none py-1 h-auto min-h-[40px]"
                                rows={1}
                                placeholder="Wpisz uwagę lub zastrzeżenie..."
                            />
                            <button
                                onClick={() => handleRemoveItem(setNotes, notes, index)}
                                className="p-2 text-amber-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all self-center opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                    {notes.length === 0 && (
                        <p className="text-xs font-bold text-amber-600/50 text-center py-4 uppercase tracking-widest italic">Brak uwag dodatkowych w ofercie</p>
                    )}
                </div>
            </div>
        </div>
    );
}
