import React, { useState, useCallback } from 'react';
import { useJobs } from '../../context/JobsContext';
import { parseJobStructuresFile } from '../../utils/xlsParser';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { 
    Upload, 
    Trash2, 
    Plus, 
    Save, 
    FileSpreadsheet, 
    FileText
} from 'lucide-react';
import type { Job, JobStructureItem } from '../../models/types';

interface JobStructuresTabProps {
    job: Job;
}

export const JobStructuresTab = ({ job }: JobStructuresTabProps) => {
    const { updateJob } = useJobs();
    const [structures, setStructures] = useState<JobStructureItem[]>(job.structures || []);
    const [isDragActive, setIsDragActive] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // File Drag & Drop Handlers
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragActive(true);
        } else if (e.type === "dragleave") {
            setIsDragActive(false);
        }
    }, []);

    const processFile = async (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
            toast.error('Niewłaściwy format pliku. Dozwolone są tylko pliki .xlsx, .xls oraz .csv');
            return;
        }

        const loadingToast = toast.loading('Parsowanie pliku zestawienia...');
        try {
            const parsed = await parseJobStructuresFile(file);
            const itemsWithId: JobStructureItem[] = parsed.map(item => ({
                ...item,
                id: `str-${uuidv4()}`
            }));
            
            setStructures(prev => [...prev, ...itemsWithId]);
            toast.success(`Pomyślnie zaimportowano ${itemsWithId.length} pozycji stolarki.`, { id: loadingToast });
        } catch (err: any) {
            console.error('Import error:', err);
            toast.error(err.message || 'Błąd podczas parsowania pliku.', { id: loadingToast });
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    // Table Row Operations
    const handleCellChange = (id: string, field: keyof JobStructureItem, value: any) => {
        setStructures(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item };
                if (field === 'width' || field === 'height' || field === 'quantity' || field === 'priceNet') {
                    (updated as any)[field] = Number(value) || 0;
                } else {
                    (updated as any)[field] = value;
                }
                return updated;
            }
            return item;
        }));
    };

    const handleAddRow = () => {
        const newRow: JobStructureItem = {
            id: `str-${uuidv4()}`,
            lp: String(structures.length + 1),
            type: 'FIX',
            width: 0,
            height: 0,
            quantity: 1,
            priceNet: 0,
            notes: ''
        };
        setStructures(prev => [...prev, newRow]);
    };

    const handleDeleteRow = (id: string) => {
        setStructures(prev => prev.filter(item => item.id !== id));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Update materialsPlannedNet or other costs dynamically? 
            // In Open Plan, this is saved into job.structures
            const totalNet = structures.reduce((sum, item) => sum + (item.priceNet * item.quantity), 0);
            
            await updateJob(job.id, {
                structures: structures,
                // Automatically copy window net cost to job materials planned budget if not set manually
                materialsPlannedNet: job.materialsPlannedNet || totalNet
            });
            toast.success('Zestawienie stolarki zostało zapisane.');
        } catch (err) {
            console.error('Save job structures failed:', err);
            toast.error('Błąd podczas zapisywania zestawienia.');
        } finally {
            setIsSaving(false);
        }
    };

    const totalQty = structures.reduce((sum, item) => sum + item.quantity, 0);
    const totalPriceNet = structures.reduce((sum, item) => sum + (item.priceNet * item.quantity), 0);

    return (
        <div className="space-y-6">
            {/* Header section with actions */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200/60 shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-teal-600" />
                        Zestawienie Stolarki Otworowej
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Zarządzaj zaimportowaną listą okien i drzwi dla tego zlecenia.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleAddRow}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors border border-slate-200/50"
                    >
                        <Plus className="w-4 h-4" />
                        Dodaj wiersz
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Zapisywanie...' : 'Zapisz zmiany'}
                    </button>
                </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragActive 
                        ? 'border-teal-500 bg-teal-50/40' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
            >
                <div className="max-w-md mx-auto flex flex-col items-center">
                    <div className="p-3.5 bg-teal-50 text-teal-600 rounded-full mb-3">
                        <Upload className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-800">
                        Przeciągnij i upuść plik Excel / CSV od producenta
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-xs">
                        System automatycznie rozpozna kolumny: Lp, Typ (FIX/RU/HST/Drzwi), Szerokość, Wysokość, Ilość, Cena Netto, Uwagi.
                    </p>
                    
                    <label className="mt-4 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-sm">
                        Wybierz plik z dysku
                        <input 
                            type="file" 
                            className="hidden" 
                            accept=".xlsx,.xls,.csv" 
                            onChange={handleFileInput}
                        />
                    </label>
                </div>
            </div>

            {/* Editable DataGrid */}
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                                <th className="px-4 py-3.5 w-12 text-center">Lp</th>
                                <th className="px-4 py-3.5 w-44">Typ Konstrukcji</th>
                                <th className="px-4 py-3.5 w-28 text-right">Szerokość (mm)</th>
                                <th className="px-4 py-3.5 w-28 text-right">Wysokość (mm)</th>
                                <th className="px-4 py-3.5 w-24 text-right">Ilość (szt)</th>
                                <th className="px-4 py-3.5 w-36 text-right">Cena Netto (zł)</th>
                                <th className="px-4 py-3.5 w-36 text-right">Suma Netto (zł)</th>
                                <th className="px-4 py-3.5">Uwagi</th>
                                <th className="px-4 py-3.5 w-16 text-center"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {structures.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                                        <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                        <p className="font-semibold text-sm">Brak zaimportowanej stolarki</p>
                                        <p className="text-xs mt-1">Przeciągnij plik Excel powyżej lub dodaj wiersz ręcznie.</p>
                                    </td>
                                </tr>
                            ) : (
                                structures.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-2 py-1 text-center">
                                            <input 
                                                type="text" 
                                                value={item.lp} 
                                                onChange={(e) => handleCellChange(item.id, 'lp', e.target.value)}
                                                className="w-full text-center bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-0.5 text-gray-500 font-medium"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <select 
                                                value={item.type}
                                                onChange={(e) => handleCellChange(item.id, 'type', e.target.value)}
                                                className="w-full bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-1.5 font-medium text-gray-800"
                                            >
                                                <option value="FIX">FIX (Stałe)</option>
                                                <option value="RU">RU (Rozwierno-Uchylne)</option>
                                                <option value="HST">HST (Przesuwne)</option>
                                                <option value="Drzwi">Drzwi</option>
                                                <option value="Balkon">Balkon</option>
                                                <option value="Inne">Inne</option>
                                            </select>
                                        </td>
                                        <td className="px-2 py-1">
                                            <input 
                                                type="number" 
                                                value={item.width || ''} 
                                                onChange={(e) => handleCellChange(item.id, 'width', e.target.value)}
                                                placeholder="0"
                                                className="w-full text-right bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-1.5 text-gray-800 font-medium"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <input 
                                                type="number" 
                                                value={item.height || ''} 
                                                onChange={(e) => handleCellChange(item.id, 'height', e.target.value)}
                                                placeholder="0"
                                                className="w-full text-right bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-1.5 text-gray-800 font-medium"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <input 
                                                type="number" 
                                                value={item.quantity} 
                                                onChange={(e) => handleCellChange(item.id, 'quantity', e.target.value)}
                                                className="w-full text-right bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-1.5 text-gray-800 font-bold"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <input 
                                                type="number" 
                                                value={item.priceNet || ''} 
                                                onChange={(e) => handleCellChange(item.id, 'priceNet', e.target.value)}
                                                placeholder="0.00"
                                                className="w-full text-right bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-1.5 text-teal-700 font-semibold"
                                            />
                                        </td>
                                        <td className="px-4 py-1 text-right text-gray-900 font-bold bg-slate-50/30">
                                            {((item.priceNet || 0) * item.quantity).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                                        </td>
                                        <td className="px-2 py-1">
                                            <input 
                                                type="text" 
                                                value={item.notes || ''} 
                                                onChange={(e) => handleCellChange(item.id, 'notes', e.target.value)}
                                                placeholder="Wpisz uwagi..."
                                                className="w-full bg-transparent border-0 focus:ring-1 focus:ring-teal-500 focus:bg-white rounded py-1 px-1.5 text-gray-600 text-xs"
                                            />
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                            <button 
                                                onClick={() => handleDeleteRow(item.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                                title="Usuń wiersz"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {structures.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-50 font-bold border-t-2 border-gray-200 text-gray-900">
                                    <td colSpan={2} className="px-4 py-4">Suma ogólna</td>
                                    <td className="px-4 py-4 text-right"></td>
                                    <td className="px-4 py-4 text-right"></td>
                                    <td className="px-4 py-4 text-right text-blue-700">{totalQty} szt</td>
                                    <td className="px-4 py-4 text-right"></td>
                                    <td className="px-4 py-4 text-right text-teal-700">
                                        {totalPriceNet.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                                    </td>
                                    <td colSpan={2} className="px-4 py-4"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};
