import { useState, useEffect } from 'react';
import { Archive, Download, FileDown, Calendar, User, Hash, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { Job } from '../../models/types';

interface ArchivedReport {
    id: string;
    jobId: string;
    jobCode: string;
    title: string;
    url: string;
    size: number;
    dateFrom?: string;
    dateTo?: string;
    onlyApproved: boolean;
    entryCount: number;
    generatedBy: string;
    createdAt: string;
}

interface JobReportsArchiveTabProps {
    job: Job;
}

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function JobReportsArchiveTab({ job }: JobReportsArchiveTabProps) {
    const [reports, setReports] = useState<ArchivedReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchReports = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('kostiq_token');
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch(`${API_BASE}/archived-reports?jobId=${job.id}`, { headers });
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const data = await res.json();
                const arr: ArchivedReport[] = Array.isArray(data) ? data : (data.data ?? []);
                setReports(arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, [job.id]);

    const baseUrl = API_BASE.replace(/\/api$/, '');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Archive className="w-5 h-5 text-rose-500" />
                        Archiwum Raportów PDF
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Zamrożone raporty wygenerowane z Globalnego Dziennika Budowy.
                    </p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 text-sm text-rose-700 font-medium">
                    {reports.length} raportów
                </div>
            </div>

            {/* Info callout */}
            <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-sm text-teal-800 flex items-start gap-2">
                <FileDown className="w-4 h-4 flex-shrink-0 mt-0.5 text-teal-600" />
                <span>
                    Raporty są generowane z <strong>Globalnego Dziennika Budowy</strong> (ikona 📖 w bocznym pasku).
                    Każdy wygenerowany i zaarchiwizowany PDF pojawia się tutaj automatycznie.
                </span>
            </div>

            {/* Loading / Error */}
            {loading && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                </div>
            )}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
                    Błąd ładowania: {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && reports.length === 0 && (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <Archive className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-base font-semibold text-gray-600 mb-2">Brak zarchiwizowanych raportów</h3>
                    <p className="text-sm text-gray-400 max-w-xs mx-auto">
                        Przejdź do <strong>Globalnego Dziennika Budowy</strong>, wybierz to zlecenie i wygeneruj raport PDF.
                        Zostanie tu automatycznie zapisany.
                    </p>
                </div>
            )}

            {/* Reports table */}
            {!loading && reports.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                                    <div className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Nazwa raportu</div>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Okres</div>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                                    <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Autor</div>
                                </th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data</th>
                                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Pobierz</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {reports.map(report => (
                                <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                                    {/* Title + badges */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-start gap-2">
                                            <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <FileDown className="w-4 h-4 text-rose-500" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 leading-tight">{report.title}</p>
                                                <div className="flex gap-1.5 mt-1">
                                                    {report.onlyApproved && (
                                                        <span className="text-[10px] font-bold uppercase bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                                                            ✓ Tylko zatwierdzone
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                        {report.entryCount} wpisów
                                                    </span>
                                                    {report.size > 0 && (
                                                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            {formatBytes(report.size)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Period */}
                                    <td className="px-4 py-3 text-gray-500 text-xs">
                                        {report.dateFrom && report.dateTo
                                            ? `${format(new Date(report.dateFrom), 'dd.MM.yyyy')} — ${format(new Date(report.dateTo), 'dd.MM.yyyy')}`
                                            : '—'}
                                    </td>

                                    {/* Author */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                                                <span className="text-[10px] font-bold text-teal-700">
                                                    {(report.generatedBy || 'A').charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <span className="text-sm text-gray-700">{report.generatedBy}</span>
                                        </div>
                                    </td>

                                    {/* Created at */}
                                    <td className="px-4 py-3 text-gray-500 text-xs">
                                        {format(new Date(report.createdAt), 'dd MMM yyyy, HH:mm', { locale: pl })}
                                    </td>

                                    {/* Download */}
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <a
                                                href={`${baseUrl}${report.url}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 bg-teal-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-teal-700 transition-colors"
                                                title="Pobierz PDF">
                                                <Download className="w-3.5 h-3.5" />
                                                Pobierz
                                            </a>
                                            <a
                                                href={`${baseUrl}${report.url}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 text-gray-400 hover:text-teal-600 rounded-lg hover:bg-gray-100"
                                                title="Otwórz w nowej karcie">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
