import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Construction, ConstructionType, InstallationLocation } from '../../models/types';
import { AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface ImportConstructionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (constructions: Construction[]) => Promise<void>;
    offerId: string;
    nextNumber: number;
}

interface ParsedRow {
    isValid: boolean;
    errors: string[];
    data: {
        name: string;
        type: string;
        width: number; // mm
        height: number; // mm
        quantity: number;
    }
}

const CONSTRUCTION_TYPES: { label: string; value: ConstructionType }[] = [
    { label: 'Okno PVC', value: 'okno_pvc' },
    { label: 'Okno Alu', value: 'okno_alu' },
    { label: 'Okno Drewno', value: 'okno_drewno' },
    { label: 'Drzwi PVC', value: 'drzwi_pvc' },
    { label: 'Drzwi Alu', value: 'drzwi_alu' },
    { label: 'Drzwi Drewno', value: 'drzwi_drewno' },
    { label: 'HS PVC', value: 'hs_pvc' },
    { label: 'HS Alu', value: 'hs_alu' },
    { label: 'HS Drewno', value: 'hs_drewno' },
    { label: 'Fasada', value: 'fasada' },
    { label: 'Witryna', value: 'witryna' },
    { label: 'Fix', value: 'fix' },
    { label: 'Pergola', value: 'pergola' },
    { label: 'Roleta Zew.', value: 'roleta_zew' },
    { label: 'Żaluzja Fasad.', value: 'zaluzja_fasadowa' },
    { label: 'Zip Screen', value: 'zip_screen' },
];

export const ImportConstructionModal = ({ isOpen, onClose, onSave, offerId, nextNumber }: ImportConstructionModalProps) => {
    const [rawText, setRawText] = useState('');
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const parseText = (text: string) => {
        if (!text.trim()) {
            setParsedRows([]);
            return;
        }

        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        
        // Detect and skip header row if the 3rd or 4th column is non-numeric text
        const hasHeader = lines.length > 0 && (() => {
            const parts = lines[0].split(/[\t;]/).map(p => p.trim());
            return isNaN(Number(parts[2]?.replace(',', '.'))) || isNaN(Number(parts[3]?.replace(',', '.')));
        })();

        const dataLines = hasHeader ? lines.slice(1) : lines;

        const rows: ParsedRow[] = dataLines.map((line, index) => {
            const parts = line.split(/[\t;]/).map(p => p.trim());

            // Expected format: Name | Type | Width | Height | Qty
            // Relaxed: Name | Width | Height (defaults: Type=okno_pvc, Qty=1)

            // Basic extraction
            const name = parts[0] || `Pozycja ${nextNumber + index}`;
            const typeRaw = parts[1] || '';
            const widthRaw = parts[2] || '0';
            const heightRaw = parts[3] || '0';
            const qtyRaw = parts[4] || '1';

            const errors: string[] = [];

            // Validate Width/Height
            const width = parseFloat(widthRaw.replace(',', '.'));
            const height = parseFloat(heightRaw.replace(',', '.'));
            const quantity = parseFloat(qtyRaw.replace(',', '.'));

            if (isNaN(width) || width <= 0) errors.push('Nieprawidłowa szerokość');
            if (isNaN(height) || height <= 0) errors.push('Nieprawidłowa wysokość');
            if (isNaN(quantity) || quantity <= 0) errors.push('Nieprawidłowa ilość');

            // Find type
            let foundType = typeRaw; // Default to raw input if not recognised (CostFrame Logic Update)

            if (typeRaw) {
                const match = CONSTRUCTION_TYPES.find(t =>
                    t.label.toLowerCase() === typeRaw.toLowerCase() ||
                    t.value.toLowerCase() === typeRaw.toLowerCase()
                );

                if (match) {
                    // If exactly matched standard, use the LABEL (CostFrame Convention: types are saved as Labels like 'Okno PVC')
                    // Wait, ConstructionList uses c.type.
                    // OfferForm uses c.type as Label (key for rates).
                    // So we should normalize to Label if standard, or keep raw if custom.
                    foundType = match.label;
                } else {
                    // Custom type case
                    foundType = typeRaw.trim();
                }
            } else {
                // Fallback if empty
                foundType = 'Okno PVC';
            }

            // Correction for common aliases if needed, but 'foundType = typeRaw' covers most.
            // But we want to ensure standard types get normalized to their Proper Case Label (e.g. "okno pvc" -> "Okno PVC") 
            // to match default installation rates keys.

            return {
                isValid: errors.length === 0,
                errors,
                data: {
                    name,
                    type: foundType,
                    width,
                    height,
                    quantity
                }
            };
        });

        setParsedRows(rows);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setRawText(e.target.value);
        parseText(e.target.value);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setRawText(text);
            parseText(text);
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleImport = async () => {
        const validRows = parsedRows.filter(r => r.isValid);
        if (validRows.length === 0) return;

        setIsProcessing(true);
        try {
            const constructions: Construction[] = validRows.map((row, idx) => {
                const widthM = row.data.width / 1000;
                const heightM = row.data.height / 1000;

                // Matches the logic in ConstructionModal
                const area = (widthM * heightM * row.data.quantity);
                const perimeter = (2 * (widthM + heightM) * row.data.quantity);

                // Type is already resolved to Label or Custom String in parseText
                const typeLabel = row.data.type;

                // Simple estimation logic for imported items if no standard
                const materialsCost = perimeter * 15;
                const laborCost = perimeter * 25;

                return {
                    id: uuidv4(),
                    offerId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    number: nextNumber + idx,
                    name: row.data.name,
                    type: typeLabel,
                    widthMm: row.data.width,
                    heightMm: row.data.height,
                    width: widthM,
                    height: heightM,
                    quantity: row.data.quantity,
                    installationLocation: 'wew' as InstallationLocation,

                    totalArea: parseFloat(area.toFixed(2)),
                    area: parseFloat((widthM * heightM).toFixed(2)),

                    totalPerimeter: parseFloat(perimeter.toFixed(2)),
                    perimeter: parseFloat((2 * (widthM + heightM)).toFixed(2)),

                    weight: 0,
                    materialBreakdown: [],
                    installationStandardId: '', // Default to none

                    materialCosts: {
                        total: materialsCost, // Basic estimate
                        items: []
                    },
                    installationCosts: {
                        total: laborCost,
                        rate: 0
                    },
                    totalCost: materialsCost + laborCost // Basic estimate
                };
            });

            await onSave(constructions);
            onClose();
            setRawText('');
            setParsedRows([]);
        } catch (e) {
            console.error(e);
            alert("Błąd importu");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadTemplate = () => {
        const headers = 'Nazwa;Typ;Szerokość (mm);Wysokość (mm);Ilość\n';
        const sampleRow1 = 'Okno O1;okno_pvc;1500;1500;2\n';
        const sampleRow2 = 'Drzwi balkonowe B1;drzwi_pvc;900;2100;1\n';
        const content = headers + sampleRow1 + sampleRow2;
        
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'szablon_importu_konstrukcji.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const validCount = parsedRows.filter(r => r.isValid).length;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import Pozycji (Kopiuj-Wklej)">
            <div className="space-y-4 max-h-[80vh] overflow-y-auto px-1">
                <div className="bg-blue-50 p-4 rounded-md flex gap-3 text-sm text-blue-800">
                    <HelpCircle className="flex-shrink-0 w-5 h-5 text-blue-600" />
                    <div>
                        <p className="font-semibold mb-1">Instrukcja formatu:</p>
                        <p>Wklej dane w formacie: <code>Nazwa; Typ; Szerokość (mm); Wysokość (mm); Ilość</code></p>
                        <p className="opacity-75 mt-1 text-xs">Akceptowane separatory: średnik (;) lub tabulacja (Excel).</p>
                        <p className="opacity-75 text-xs">Przykład: <code>Okno O1; okno_pvc; 1500; 1500; 2</code></p>
                        <div className="mt-3">
                            <button
                                type="button"
                                onClick={handleDownloadTemplate}
                                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                            >
                                📥 Pobierz szablon CSV (Excel)
                            </button>
                        </div>
                    </div>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer relative bg-gray-50/50">
                    <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="space-y-2">
                        <div className="text-gray-600 text-sm">
                            <span className="font-semibold text-blue-600 hover:text-blue-800">Wgraj plik CSV / TXT</span> lub przeciągnij i upuść go tutaj
                        </div>
                        <p className="text-xs text-gray-500">System automatycznie odczyta i sparsuje dane</p>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Lub wklej dane tekstowe bezpośrednio:</label>
                    <textarea
                        className="w-full h-32 p-3 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Wklej dane tutaj..."
                        value={rawText}
                        onChange={handleTextChange}
                    />
                </div>

                {parsedRows.length > 0 && (
                    <div className="border rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between">
                            <span>Podgląd ({validCount} / {parsedRows.length})</span>
                            {validCount < parsedRows.length && <span className="text-red-500">Wykryto błędy!</span>}
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nazwa</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Typ</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Wymiary (mm)</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Ilość</th>
                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {parsedRows.map((row, i) => (
                                        <tr key={i} className={row.isValid ? 'hover:bg-gray-50' : 'bg-red-50'}>
                                            <td className="px-3 py-2 text-sm text-gray-900">{row.data.name}</td>
                                            <td className="px-3 py-2 text-sm text-gray-500">{row.data.type}</td>
                                            <td className="px-3 py-2 text-sm text-gray-500 text-right font-mono">
                                                {row.data.width} x {row.data.height}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-gray-500 text-right">{row.data.quantity}</td>
                                            <td className="px-3 py-2 text-center">
                                                {row.isValid ? (
                                                    <CheckCircle className="w-4 h-4 text-green-500 inline" />
                                                ) : (
                                                    <div className="group relative inline-block">
                                                        <AlertCircle className="w-4 h-4 text-red-500 inline cursor-help" />
                                                        <div className="hidden group-hover:block absolute right-0 z-10 w-48 p-2 mt-1 text-xs text-white bg-red-600 rounded shadow-lg">
                                                            {row.errors.join(', ')}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <Button variant="secondary" onClick={onClose}>Anuluj</Button>
                    <Button
                        onClick={handleImport}
                        disabled={validCount === 0 || isProcessing}
                        isLoading={isProcessing}
                    >
                        Importuj {validCount > 0 ? `(${validCount})` : ''}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
