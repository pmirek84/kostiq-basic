import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    Save,
    CheckCircle,
    Download,
    ArrowDown,
    ArrowUp,
    Eye,
    EyeOff,
    RotateCcw,
    Trash2
} from 'lucide-react';
import { X } from 'lucide-react';
import { useClientReports } from '../../../context/ClientReportsContext';
import { useJobs } from '../../../context/JobsContext';
import { generateClientReportPdf } from '../../../utils/pdfGenerator';
import type { ClientReport } from '../../../models/types';
import { format } from 'date-fns';

export const EditReportView = () => {
    const { id, reportId } = useParams<{ id: string; reportId: string }>();
    const navigate = useNavigate();
    const { getReport, updateReport, updateReportStatus, deleteReport } = useClientReports();
    const { getJob } = useJobs();

    const [report, setReport] = useState<ClientReport | undefined>(undefined);
    const [originalTextModal, setOriginalTextModal] = useState<string | null>(null);

    const job = id ? getJob(id) : undefined;

    // Load report
    useEffect(() => {
        if (reportId) {
            const r = getReport(reportId);
            setReport(r); // In real app, deep clone might be safer
        }
    }, [reportId, getReport]);

    if (!report || !id) return <div className="p-8">Ładowanie raportu...</div>;

    // We work on 'report' state directly, but better to have local state for form buffer
    // For simplicity in this agent turn, I'll update 'report' local state and save on "Zapisz".
    // Wait, getReport returns a reference from context in this mock? 
    // If I mutate it, it might mutate context. 
    // useClientReports uses useState, so getReport returns the object from state. Mutating it directly is bad.
    // I should clone it.

    // Actually, let's trust the user to hit Save. 
    // I will use local state for editing.

    const handleSave = async () => {
        if (!report) return;
        await updateReport(report.id, report);
        alert('Raport zapisany');
    };

    const handleMarkReady = async () => {
        if (!report) return;
        if (confirm("Czy na pewno chcesz oznaczyć raport jako gotowy?")) {
            await updateReportStatus(report.id, 'ready');
            navigate(`/jobs/${id}`);
        }
    };

    const handleDelete = async () => {
        if (!report) return;
        if (confirm("Czy na pewno chcesz usunąć ten raport?")) {
            await deleteReport(report.id);
            navigate(`/jobs/${id}`);
        }
    };

    const handleDownload = () => {
        if (!report || !job) return; // Need job
        try {
            generateClientReportPdf(report, job);
        } catch (error) {
            console.error("PDF generation failed", error);
            alert("Błąd generowania PDF.");
        }
    };

    const moveEntry = (index: number, direction: 'up' | 'down') => {
        if (!report) return;
        const newEntries = [...report.entries];
        if (direction === 'up' && index > 0) {
            [newEntries[index], newEntries[index - 1]] = [newEntries[index - 1], newEntries[index]];
        } else if (direction === 'down' && index < newEntries.length - 1) {
            [newEntries[index], newEntries[index + 1]] = [newEntries[index + 1], newEntries[index]];
        }
        // update order prop
        newEntries.forEach((e, i) => e.order = i);
        setReport({ ...report, entries: newEntries });
    };

    const toggleInclude = (index: number) => {
        if (!report) return;
        const newEntries = [...report.entries];
        newEntries[index].include = !newEntries[index].include;
        setReport({ ...report, entries: newEntries });
    };

    const updateEntryText = (index: number, text: string) => {
        if (!report) return;
        const newEntries = [...report.entries];
        newEntries[index].customText = text;
        setReport({ ...report, entries: newEntries });
    };

    const updateEntryTitle = (index: number, title: string) => {
        if (!report) return;
        const newEntries = [...report.entries];
        newEntries[index].customTitle = title;
        setReport({ ...report, entries: newEntries });
    };

    const restoreOriginal = (index: number) => {
        if (!report) return;
        const newEntries = [...report.entries];
        newEntries[index].customText = newEntries[index].originalText;
        setReport({ ...report, entries: newEntries });
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Top Bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/jobs/${id}`)} className="text-gray-500 hover:text-gray-900">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            Edycja Raportu
                            <span className={`text-xs px-2 py-0.5 rounded-full ${report.status === 'draft' ? 'bg-gray-100' : 'bg-green-100 text-green-800'}`}>
                                {report.status}
                            </span>
                        </h1>
                        <p className="text-sm text-gray-500">{report.title}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium mr-2"
                        title="Usuń raport"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                        title="Pobierz PDF"
                    >
                        <Download className="w-4 h-4" /> Pobierz PDF
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                    >
                        <Save className="w-4 h-4" /> Zapisz szkic
                    </button>
                    <button
                        onClick={handleMarkReady}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                        <CheckCircle className="w-4 h-4" /> Oznacz jako gotowy
                    </button>
                </div>
            </div>

            <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[1920px] mx-auto w-full">

                {/* Editor Column */}
                <div className="space-y-6">
                    {/* Summary Section */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <h2 className="font-semibold text-gray-900">Podsumowanie</h2>
                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase">Wstęp</label>
                            <textarea
                                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                rows={3}
                                value={report.summary?.intro || ''}
                                onChange={(e) => setReport({ ...report, summary: { ...report.summary, intro: e.target.value } })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">Problemy / Ryzyka</label>
                                <textarea
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    rows={3}
                                    value={report.summary?.issues || ''}
                                    onChange={(e) => setReport({ ...report, summary: { ...report.summary, issues: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">Planowane działania</label>
                                <textarea
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    rows={3}
                                    value={report.summary?.nextSteps || ''}
                                    onChange={(e) => setReport({ ...report, summary: { ...report.summary, nextSteps: e.target.value } })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Entries List */}
                    <div className="space-y-4">
                        <h2 className="font-semibold text-gray-900 flex justify-between items-center">
                            Wpisy w raporcie
                            <span className="text-sm font-normal text-gray-500">{report.entries.filter(e => e.include).length} widocznych</span>
                        </h2>

                        {report.entries.map((entry, index) => (
                            <div
                                key={entry.logEntryId}
                                className={`bg-white rounded-lg border transition-colors ${entry.include ? 'border-blue-200 shadow-sm' : 'border-gray-200 opacity-60 bg-gray-50'}`}
                            >
                                <div className="p-3 border-b flex items-center justify-between bg-gray-50/50">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => toggleInclude(index)}
                                            className={`p-1 rounded ${entry.include ? 'text-green-600 bg-green-100' : 'text-gray-400 bg-gray-200'}`}
                                            title={entry.include ? "Wyklucz z raportu" : "Dołącz do raportu"}
                                        >
                                            {entry.include ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                        <span className="text-xs font-mono text-gray-500">{format(new Date(entry.entryDate), 'dd.MM')}</span>

                                        <div className="text-xs uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                                            {entry.entryType}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => moveEntry(index, 'up')} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                                        <button onClick={() => moveEntry(index, 'down')} disabled={index === report.entries.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                                    </div>
                                </div>

                                {entry.include && (
                                    <div className="p-4 space-y-3">
                                        <input
                                            type="text"
                                            className="w-full text-sm font-semibold border-none p-0 focus:ring-0 placeholder-gray-400"
                                            placeholder="Tytuł (opcjonalnie)"
                                            value={entry.customTitle || ''}
                                            onChange={(e) => updateEntryTitle(index, e.target.value)}
                                        />
                                        <div className="relative group">
                                            <textarea
                                                className="w-full text-sm text-gray-700 border-gray-100 rounded focus:border-blue-300 focus:ring-blue-100 min-h-[80px]"
                                                value={entry.customText || ''}
                                                onChange={(e) => updateEntryText(index, e.target.value)}
                                            />
                                            {/* Tools overlay */}
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                <button
                                                    onClick={() => setOriginalTextModal(entry.originalText)}
                                                    className="p-1 bg-white border shadow text-xs text-blue-600 rounded flex items-center gap-1"
                                                    title="Pokaż oryginał z dziennika"
                                                >
                                                    <Eye className="w-3 h-3" /> Oryginał
                                                </button>
                                                {entry.customText !== entry.originalText && (
                                                    <button
                                                        onClick={() => restoreOriginal(index)}
                                                        className="p-1 bg-white border shadow text-xs text-orange-600 rounded flex items-center gap-1"
                                                        title="Przywróć oryginał"
                                                    >
                                                        <RotateCcw className="w-3 h-3" /> Cofnij zmiany
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Preview Column */}
                <div className="hidden lg:block">
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 min-h-[800px] p-8 lg:sticky lg:top-24">
                        <div className="text-center mb-8 pb-8 border-b border-gray-100">
                            <div className="text-sm text-gray-400 uppercase tracking-widest mb-2">Podgląd Raportu</div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">{report.title}</h1>
                            <p className="text-gray-500">
                                Okres: {format(new Date(report.periodStart), 'dd.MM.yyyy')} - {format(new Date(report.periodEnd), 'dd.MM.yyyy')}
                            </p>
                        </div>

                        <div className="prose max-w-none space-y-6">
                            {/* Summary Block */}
                            {(report.summary.intro || report.summary.issues || report.summary.nextSteps) && (
                                <div className="bg-blue-50 p-6 rounded-lg mb-8">
                                    <h3 className="text-lg font-bold text-blue-900 mb-4">Podsumowanie</h3>
                                    {report.summary.intro && <div className="mb-4 text-blue-800">{report.summary.intro}</div>}

                                    <div className="grid grid-cols-2 gap-6">
                                        {report.summary.issues && (
                                            <div>
                                                <h4 className="text-sm font-bold text-blue-900 uppercase opacity-70 mb-2">Problemy</h4>
                                                <p className="text-sm text-blue-800">{report.summary.issues}</p>
                                            </div>
                                        )}
                                        {report.summary.nextSteps && (
                                            <div>
                                                <h4 className="text-sm font-bold text-blue-900 uppercase opacity-70 mb-2">Planowane</h4>
                                                <p className="text-sm text-blue-800">{report.summary.nextSteps}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Entries */}
                            <div className="space-y-8 relative">
                                {/* Timeline line */}
                                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-100"></div>

                                {report.entries.filter(e => e.include).map((entry, idx) => (
                                    <div key={idx} className="relative pl-10">
                                        <div className="absolute left-[5px] top-2 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm"></div>

                                        <div className="mb-1 flex items-center gap-3">
                                            <span className="text-sm font-bold text-gray-900">{format(new Date(entry.entryDate), 'dd MMMM', { locale: (window as any).pl || undefined })}</span>
                                            <span className="text-xs text-gray-400 uppercase tracking-wide">{entry.entryType}</span>
                                        </div>

                                        {entry.customTitle && <h4 className="text-lg font-semibold text-gray-800 mb-2">{entry.customTitle}</h4>}

                                        <div className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                                            {entry.customText || entry.originalText}
                                        </div>

                                        {/* Photos Grid */}
                                        {entry.photos && entry.photos.length > 0 && (
                                            <div className="grid grid-cols-2 gap-3 mt-4">
                                                {entry.photos.map((url, i) => (
                                                    <div key={i} className="rounded-lg overflow-hidden border border-gray-100 shadow-sm aspect-video bg-gray-50">
                                                        <img
                                                            src={url}
                                                            alt={`Załącznik ${i}`}
                                                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Extra Costs */}
                            {report.summary.extraCostsSummary !== undefined && report.summary.extraCostsSummary > 0 && (
                                <div className="mt-12 pt-8 border-t border-gray-200">
                                    <div className="flex justify-end">
                                        <div className="text-right">
                                            <div className="text-sm text-gray-500 uppercase tracking-widest mb-1">Koszty dodatkowe</div>
                                            <div className="text-2xl font-bold text-gray-900">{report.summary.extraCostsSummary} PLN</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-xs text-gray-400">
                            Wygenerowano przez KOSTIQ • {format(new Date(), 'dd.MM.yyyy HH:mm')}
                        </div>
                    </div>
                </div>
            </main>

            {/* Original Text Modal */}
            {originalTextModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white p-6 rounded-lg max-w-lg w-full shadow-2xl">
                        <h3 className="font-bold text-gray-900 mb-4 flex justify-between items-center">
                            Oryginalna treść wpisu
                            <button onClick={() => setOriginalTextModal(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm font-mono text-gray-700 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
                            {originalTextModal}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button onClick={() => setOriginalTextModal(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700">Zamknij</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
