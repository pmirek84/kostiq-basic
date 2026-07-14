import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { useClientReports } from '../../../context/ClientReportsContext';
import { subDays, startOfDay, format } from 'date-fns';

interface CreateReportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    jobId: string;
    onReportCreated: (reportId: string) => void;
}

export const CreateReportWizard = ({ isOpen, onClose, jobId, onReportCreated }: CreateReportWizardProps) => {
    const { createReportFromDiary } = useClientReports();
    // const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form State
    const [periodType, setPeriodType] = useState<'last7' | 'last30' | 'thisMonth' | 'custom'>('last7');
    const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

    const [reportType, setReportType] = useState<'weekly' | 'daily' | 'monthly' | 'custom'>('weekly');
    const [title, setTitle] = useState(`Raport tygodniowy ${format(new Date(), 'dd.MM')}`);

    const [includePhotos, setIncludePhotos] = useState(true);
    const [includeExtraCosts, setIncludeExtraCosts] = useState(true);

    const handlePeriodChange = (type: 'last7' | 'last30' | 'thisMonth' | 'custom') => {
        setPeriodType(type);
        const today = new Date();
        switch (type) {
            case 'last7':
                setDateFrom(format(subDays(today, 7), 'yyyy-MM-dd'));
                setDateTo(format(today, 'yyyy-MM-dd'));
                setReportType('weekly');
                setTitle(`Raport tygodniowy ${format(subDays(today, 7), 'dd.MM')} - ${format(today, 'dd.MM')}`);
                break;
            case 'last30':
                setDateFrom(format(subDays(today, 30), 'yyyy-MM-dd'));
                setDateTo(format(today, 'yyyy-MM-dd'));
                setReportType('monthly');
                setTitle(`Raport miesięczny ${format(subDays(today, 30), 'dd.MM')} - ${format(today, 'dd.MM')}`);
                break;
            case 'thisMonth':
                const start = startOfDay(new Date(today.getFullYear(), today.getMonth(), 1));
                setDateFrom(format(start, 'yyyy-MM-dd'));
                setDateTo(format(today, 'yyyy-MM-dd'));
                setReportType('monthly');
                setTitle(`Raport ${format(today, 'MMMM yyyy')}`);
                break;
            case 'custom':
                setReportType('custom');
                setTitle('Raport niestandardowy');
                break;
        }
    };

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const reportId = await createReportFromDiary({
                jobId,
                periodStart: dateFrom,
                periodEnd: dateTo,
                type: reportType,
                title,
                includePhotos,
                includeExtraCosts
            });
            onReportCreated(reportId);
            onClose();
        } catch (error) {
            console.error("Failed to generate report", error);
            alert("Błąd podczas generowania raportu");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-900">Utwórz raport dla klienta</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Period Selector */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">Wybierz okres raportowania</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handlePeriodChange('last7')}
                                className={`px-3 py-2 text-sm border rounded-lg transition-colors ${periodType === 'last7' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                Ostatnie 7 dni
                            </button>
                            <button
                                onClick={() => handlePeriodChange('last30')}
                                className={`px-3 py-2 text-sm border rounded-lg transition-colors ${periodType === 'last30' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                Ostatnie 30 dni
                            </button>
                            <button
                                onClick={() => handlePeriodChange('thisMonth')}
                                className={`px-3 py-2 text-sm border rounded-lg transition-colors ${periodType === 'thisMonth' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                Ten miesiąc
                            </button>
                            <button
                                onClick={() => handlePeriodChange('custom')}
                                className={`px-3 py-2 text-sm border rounded-lg transition-colors ${periodType === 'custom' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-gray-50'}`}
                            >
                                Niestandardowy
                            </button>
                        </div>
                    </div>

                    {/* Custom Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Od</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                value={dateFrom}
                                onChange={(e) => {
                                    setDateFrom(e.target.value);
                                    setPeriodType('custom');
                                }}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Do</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                value={dateTo}
                                onChange={(e) => {
                                    setDateTo(e.target.value);
                                    setPeriodType('custom');
                                }}
                            />
                        </div>
                    </div>

                    {/* Report Title */}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Tytuł raportu</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    {/* Options */}
                    <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opcje generowania</h4>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${includePhotos ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300'}`}>
                                {includePhotos && <Check className="w-3 h-3" />}
                            </div>
                            <input type="checkbox" className="hidden" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
                            <span className="text-sm text-gray-700">Dołącz zdjęcia z dziennika</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${includeExtraCosts ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300'}`}>
                                {includeExtraCosts && <Check className="w-3 h-3" />}
                            </div>
                            <input type="checkbox" className="hidden" checked={includeExtraCosts} onChange={(e) => setIncludeExtraCosts(e.target.checked)} />
                            <span className="text-sm text-gray-700">Podsumuj koszty dodatkowe</span>
                        </label>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover shadow-lg shadow-primary/30 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? 'Generowanie...' : 'Generuj szkic'}
                    </button>
                </div>
            </div>
        </div>
    );
};
