import { useState } from 'react';
import { Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTiCo } from '../context/TiCoContext';
import { Button } from '../components/ui/Button';
import { offerStorage } from '../services/storage/offerStorage';
import { clientStorage } from '../services/storage/clientStorage';
import type { TimeEntry, EmployeePerformanceSummary } from '../models/types';
import ImportSection from '../components/shared/ImportSection';

export default function ImportExportPage() {
    const {
        importTimeEntries,
        clearTimeEntries: clearTimeTrackingData
    } = useTiCo();

    // Placeholder for performance data import if needed later
    // const importPerformanceData = ... 
    const importPerformanceData = (data: any[]) => { console.log('Import performance not implemented in TiCoContext yet', data); };
    const lastImportAt = null;

    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const handleExportData = async (type: 'clients' | 'offers') => {
        try {
            let data: any[];
            let filename;
            let headers: string[];
            let mapRow: (item: any) => string[];

            const BOM = '\uFEFF';

            if (type === 'clients') {
                data = await clientStorage.getAllClients();
                filename = `kostiq-klienci-${new Date().toISOString().slice(0, 10)}.csv`;
                headers = ['ID', 'Nazwa', 'Typ', 'NIP', 'Adres', 'Miasto', 'Kod Pocztowy', 'Telefon', 'Email', 'Notatki'];
                mapRow = (c: any) => [
                    c.id, c.name, c.type, c.taxId || '', c.address || '', c.city || '', c.postalCode || '', c.phone || '', c.email || '', (c.notes || '').replace(/[\r\n]+/g, ' ')
                ];
            } else {
                data = await offerStorage.getAllOffers();
                filename = `kostiq-oferty-${new Date().toISOString().slice(0, 10)}.csv`;
                headers = ['ID', 'Numer', 'ID Klienta', 'Lokalizacja', 'Status', 'Wartość Netto (PLN)', 'Data Utworzenia'];
                mapRow = (o: any) => [
                    o.id, o.number, o.clientId, o.location, o.status, (o.totalCost || 0).toFixed(2), new Date(o.createdAt).toLocaleDateString()
                ];
            }

            const csvRows = [headers.join(';')];
            data.forEach(item => {
                const row = mapRow(item).map(field => {
                    const stringField = String(field);
                    // Escape quotes and wrap in quotes if contains delimiter or newline
                    if (stringField.includes(';') || stringField.includes('"') || stringField.includes('\n')) {
                        return `"${stringField.replace(/"/g, '""')}"`;
                    }
                    return stringField;
                });
                csvRows.push(row.join(';'));
            });

            const csvContent = BOM + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', filename);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setSuccessMsg(`Pomyślnie wyeksportowano plik CSV: ${filename}`);
            setError(null);
        } catch (e) {
            console.error(e);
            setError('Błąd eksportu danych.');
        }
    };

    const handleImportTimeEntries = async (file: File) => {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    const data = JSON.parse(content) as TimeEntry[];
                    if (!Array.isArray(data)) throw new Error('Nieprawidłowy format danych');

                    const result = await importTimeEntries(data);
                    if (result.failed === 0) {
                        setSuccessMsg(`Pomyślnie zaimportowano wszystkie ${result.succeeded} wpisów czasu.`);
                        setError(null);
                    } else if (result.succeeded > 0) {
                        setSuccessMsg(`Częściowo zaimportowano: ${result.succeeded} z ${data.length} wpisów.`);
                        setError(`Nie udało się zapisać ${result.failed} wpisów. Sprawdź logi konsoli.`);
                    } else {
                        setError(`Błąd importu: żadnego z ${data.length} wpisów nie udało się zapisać.`);
                    }
                    resolve();
                } catch (err) {
                    console.error(err);
                    reject(new Error('Błąd importu pliku wpisów czasu. Sprawdź format JSON.'));
                }
            };
            reader.onerror = () => reject(new Error('Błąd odczytu pliku'));
            reader.readAsText(file);
        });
    };

    const handleImportPerformance = async (file: File) => {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const data = JSON.parse(content) as EmployeePerformanceSummary[];
                    if (!Array.isArray(data)) throw new Error('Nieprawidłowy format danych');

                    importPerformanceData(data);
                    setSuccessMsg(`Zaimportowano dane wydajności dla ${data.length} pracowników.`);
                    setError(null);
                    resolve();
                } catch (err) {
                    console.error(err);
                    reject(new Error('Błąd importu pliku wydajności. Sprawdź format JSON.'));
                }
            };
            reader.onerror = () => reject(new Error('Błąd odczytu pliku'));
            reader.readAsText(file);
        });
    };

    // Real CSV parser for material/logistics/equipment catalogs
    const handleGenericImport = async (type: string, file: File) => {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    const lines = content.split(/\r?\n/).filter(l => l.trim());
                    if (lines.length < 2) throw new Error('Plik jest pusty lub brakuje nagłówków.');

                    // Parse CSV with semicolon separator (Excel PL format)
                    const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
                    const items = lines.slice(1).map(line => {
                        const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                        const obj: Record<string, any> = {};
                        headers.forEach((h, i) => {
                            const val = cols[i] || '';
                            // Auto-parse numeric fields
                            if (['unitPrice', 'price', 'rate', 'cost', 'thickness', 'minRentalPeriod'].includes(h)) {
                                obj[h] = parseFloat(val.replace(',', '.')) || 0;
                            } else {
                                obj[h] = val;
                            }
                        });
                        return obj;
                    }).filter(obj => Object.values(obj).some(v => v !== '' && v !== 0));

                    if (items.length === 0) throw new Error('Brak danych do importu w pliku.');

                    // Determine target collection based on type
                    const collectionMap: Record<string, string> = {
                        'Materiały': 'materials',
                        'Logistyka': 'materials',
                        'Wynajem': 'equipment',
                        'Obróbki': 'materials',
                        'Pracownicy': 'employees'
                    };
                    const collection = collectionMap[type] || 'materials';

                    // POST to bulk endpoint
                    const token = localStorage.getItem('kostiq_token');
                    const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
                    const res = await fetch(`${base}/${collection}/bulk`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify(items)
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || `Błąd serwera: ${res.status}`);
                    }

                    const result = await res.json();
                    setSuccessMsg(`Zaimportowano ${result.inserted} rekordów dla: ${type}`);
                    setError(null);
                    resolve();
                } catch (err: any) {
                    console.error(err);
                    setError(err.message || 'Błąd importu pliku CSV.');
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Błąd odczytu pliku'));
            reader.readAsText(file, 'UTF-8');
        });
    };

    const handleDownloadTemplate = (cols: string[]) => {
        console.log('Generating template for:', cols);
        // Helper to generate simple CSV with BOM for Excel compatibility
        const BOM = '\uFEFF';
        const csvContent = BOM + cols.join(';') + '\n' + cols.map(() => 'Przykładowa wartość').join(';');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'szablon_importu.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Import i Eksport Danych</h1>
                <p className="text-gray-500">Zarządzaj migracją danych w systemie KOSTIQ.</p>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    {error}
                </div>
            )}

            {successMsg && (
                <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-md flex items-center">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    {successMsg}
                </div>
            )}

            {/* Eksport Section */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                        <Download className="h-6 w-6 text-green-600" />
                    </div>
                    <h2 className="text-lg font-semibold">Eksport Danych (Kopia Zapasowa)</h2>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                    Pobierz swoje dane w formacie CSV (Excel), aby zachować kopię bezpieczeństwa.
                </p>
                <div className="flex space-x-4">
                    <Button variant="secondary" onClick={() => handleExportData('clients')}>
                        <Download className="h-4 w-4 mr-2" />
                        Eksportuj Klientów (CSV)
                    </Button>
                    <Button variant="secondary" onClick={() => handleExportData('offers')}>
                        <Download className="h-4 w-4 mr-2" />
                        Eksportuj Oferty (CSV)
                    </Button>
                </div>
            </div>

            <div className="border-t border-gray-200 my-8"></div>

            <h2 className="text-xl font-semibold text-gray-900 mb-4">Import Danych</h2>

            {/* Time Tracking Section (Functional) */}
            <ImportSection
                title="Wpisy Czasu Pracy"
                description="Importuj pliki JSON z logami pracy (Time Entries)."
                accept=".json"
                onImport={handleImportTimeEntries}
                onDownloadTemplate={() => handleDownloadTemplate(['id', 'jobId', 'startTime', 'endTime', 'description'])}
            />

            {/* Performance Section (Functional) */}
            <ImportSection
                title="Wydajność Pracowników"
                description="Dane historyczne wydajności do estymacji kosztów."
                accept=".json"
                onImport={handleImportPerformance}
                onDownloadTemplate={() => handleDownloadTemplate(['employeeId', 'taskType', 'avgTime', 'efficiencyScore'])}
            />

            {/* Placeholder Sections to match Bolt Project */}
            <ImportSection
                title="Materiały montażowe"
                description="Cennik i lista materiałów montażowych."
                onImport={(f) => handleGenericImport('Materiały', f)}
                onDownloadTemplate={() => handleDownloadTemplate(['name', 'category', 'subCategory', 'unit', 'unitPrice', 'usage'])}
            />

            <ImportSection
                title="Koszty pracownicze"
                description="Stawki godzinowe i miesięczne pracowników."
                onImport={(f) => handleGenericImport('Pracownicy', f)}
                onDownloadTemplate={() => handleDownloadTemplate(['position', 'hourlyRate', 'monthlyRate', 'additionalCostsPercentage'])}
            />

            <ImportSection
                title="Logistyka"
                description="Koszty transportu i dojazdu."
                onImport={(f) => handleGenericImport('Logistyka', f)}
                onDownloadTemplate={() => handleDownloadTemplate(['name', 'unit', 'unitPrice', 'category'])}
            />

            <ImportSection
                title="Wynajem sprzętu"
                description="Cennik wynajmu podnośników i sprzętu specjalistycznego."
                onImport={(f) => handleGenericImport('Wynajem', f)}
                onDownloadTemplate={() => handleDownloadTemplate(['name', 'unit', 'unitPrice', 'category', 'minRentalPeriod'])}
            />

            <ImportSection
                title="Obróbki blacharskie"
                description="Cennik obróbek i parapetów."
                onImport={(f) => handleGenericImport('Obróbki', f)}
                onDownloadTemplate={() => handleDownloadTemplate(['name', 'material', 'thickness', 'unitPrice', 'unit'])}
            />

            {lastImportAt && (
                <div className="flex justify-center mt-8">
                    <Button
                        variant="secondary"
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 border-red-200"
                        onClick={async () => {
                            if (window.confirm('Czy na pewno chcesz usunąć dane czasu pracy i wydajności?')) {
                                const result = await clearTimeTrackingData();
                                if (result.failed === 0) {
                                    setSuccessMsg(`Wyczyszczono wszystkie wpisy operacyjne (${result.succeeded}).`);
                                    setError(null);
                                } else if (result.succeeded > 0) {
                                    setSuccessMsg(`Usunięto ${result.succeeded} wpisów.`);
                                    setError(`Nie udało się usunąć ${result.failed} wpisów. Pozostały w systemie.`);
                                } else {
                                    setError(`Błąd: nie udało się usunąć żadnego z ${result.failed} wpisów.`);
                                }
                            }
                        }}
                    >
                        Wyczyść dane operacyjne
                    </Button>
                </div>
            )}
        </div>
    );
}
