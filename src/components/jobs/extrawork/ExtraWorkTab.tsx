
import { useState, useEffect, useCallback } from 'react';
import type { ExtraWork, ExtraWorkStatus } from '../../../models/types';
import { Plus, FileText, CheckCircle, XCircle, RefreshCw, User, Calendar, Clock, ExternalLink, Eye, Edit3 } from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ExtraWorkTabProps {
    jobId: string;
}

export const ExtraWorkTab = ({ jobId }: ExtraWorkTabProps) => {

    const [extraWorks, setExtraWorks] = useState<ExtraWork[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingWork, setEditingWork] = useState<ExtraWork | null>(null);
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
    const [submittingStatusId, setSubmittingStatusId] = useState<string | null>(null); // Shield #4: Race condition guard

    const loadExtraWorks = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await fetch(`${API_BASE}/extra-works?jobId=${jobId}`, {
                headers: { ...getAuthHeaders() }
            });
            if (res.ok) {
                const data = await res.json();
                // Guard against paginated {data, pagination} response
                setExtraWorks(Array.isArray(data) ? data : (data.data ?? []));
            }
        } catch (err) {
            console.error('Failed to load extra works:', err);
        } finally {
            setIsLoading(false);
        }
    }, [jobId]);

    useEffect(() => {
        loadExtraWorks();
    }, [loadExtraWorks]);

    const handleAddOrUpdate = async (data: any) => {
        try {
            if (editingWork) {
                await fetch(`${API_BASE}/extra-works/${editingWork.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({ ...data, updatedAt: new Date().toISOString() })
                });
            } else {
                const newWork = {
                    ...data,
                    id: `ew-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    jobId,
                    status: 'draft',
                    createdAt: new Date().toISOString()
                };
                await fetch(`${API_BASE}/extra-works`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify(newWork)
                });
            }
            setIsFormOpen(false);
            setEditingWork(null);
            await loadExtraWorks();
        } catch (err) {
            console.error('Failed to save extra work:', err);
        }
    };

    const handleUpdateStatus = async (workId: string, status: ExtraWorkStatus) => {
        // Shield #4: Prevent double-click race condition on Accept/Reject
        if (submittingStatusId) return;

        const work = extraWorks.find(w => w.id === workId);

        // Logic for 'zaakceptowana' -> Mandatory pricing check
        if (status === 'zaakceptowana' && work) {
            if (!work.plannedRevenueNet || work.plannedRevenueNet <= 0) {
                if (confirm('Praca dodatkowa nie ma przypisanej ceny. Czy chcesz ją wycenić przed akceptacją?')) {
                    setEditingWork(work);
                    setIsFormOpen(true);
                    return; // Stop acceptance flow
                }
            }
        }

        try {
            setSubmittingStatusId(workId); // Shield #4: lock UI
            await fetch(`${API_BASE}/extra-works/${workId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ status, updatedAt: new Date().toISOString() })
            });

            await loadExtraWorks();
        } catch (err) {
            console.error('Failed to update extra work status:', err);
            alert('Wystąpił błąd podczas aktualizacji statusu.');
        } finally {
            setSubmittingStatusId(null); // Shield #4: unlock UI
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Prace dodatkowe</h3>
                <button
                    onClick={() => {
                        setEditingWork(null);
                        setIsFormOpen(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Nowa praca dodatkowa
                </button>
            </div>

            {extraWorks.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Brak prac dodatkowych</p>
                    <p className="text-sm text-gray-400 mt-1">Zarejestruj zmiany zakresu lub dodatkowe roboty</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {extraWorks.map(work => (
                        <div key={work.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h4 className="font-semibold text-gray-900 text-lg">{work.title}</h4>
                                            <StatusBadge status={work.status} />
                                        </div>
                                        <p className="text-gray-600 leading-relaxed">{work.reason}</p>
                                    </div>

                                    {/* Requester Info */}
                                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                        <div className="flex items-center gap-1.5">
                                            <User size={14} className="text-gray-400" />
                                            <span>Zgłosił: <span className="font-medium text-gray-700">{work.requestedBy || (work.employeeId ? `Pracownik ID: ${work.employeeId}` : 'System')}</span></span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={14} className="text-gray-400" />
                                            <span>Data: <span className="font-medium text-gray-700">{work.requestedDate || (work.createdAt ? work.createdAt.split('T')[0] : new Date().toISOString().split('T')[0])}</span></span>
                                        </div>
                                        {work.estimatedHours && (
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={14} className="text-gray-400" />
                                                <span>Estymacja: <span className="font-medium text-gray-700">{work.estimatedHours}h</span></span>
                                            </div>
                                        )}
                                        {work.sourceSiteLogEntryId && (
                                            <div className="flex items-center gap-1.5 text-blue-600">
                                                <ExternalLink size={14} />
                                                <span>Z dziennika budowy</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-3 min-w-[140px]">
                                    {/* Photo Preview if exists */}
                                    {(work.photo || (work as any).photoBase64) && (
                                        <div
                                            className="relative group cursor-pointer w-32 h-20 rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-100"
                                            onClick={() => setPreviewPhoto(work.photo || (work as any).photoBase64 || null)}
                                        >
                                            <img
                                                src={(() => {
                                                    const photo = work.photo || (work as any).photoBase64;
                                                    if (!photo) return '';
                                                    if (photo.startsWith('data:image') || photo.startsWith('http')) return photo;
                                                    // Ensure valid path if it's a relative storage path (e.g. /uploads/...)
                                                    const cleanPath = photo.startsWith('/') ? photo : `/${photo}`;
                                                    return `${API_BASE.split('/api')[0]}${cleanPath}`;
                                                })()}
                                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                                alt="Podgląd"
                                            />
                                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Eye className="text-white w-6 h-6" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="text-right">
                                        <div className="text-lg font-bold text-gray-900">
                                            {(work.plannedRevenueNet || 0).toLocaleString('pl-PL')} PLN
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            (Koszt: {(work.plannedCostNet || 0).toLocaleString('pl-PL')} PLN)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-3">
                                {work.status === 'draft' && (
                                    <button
                                        onClick={() => handleUpdateStatus(work.id, 'wysłana_do_akceptacji')}
                                        className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded font-medium"
                                    >
                                        Wyślij do akceptacji
                                    </button>
                                )}

                                {work.status === 'wysłana_do_akceptacji' && (
                                    <>
                                        <button
                                            onClick={() => {
                                                setEditingWork(work);
                                                setIsFormOpen(true);
                                            }}
                                            className="text-sm px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded font-medium flex items-center gap-1.5"
                                        >
                                            <Edit3 size={14} /> Edytuj / Wycen
                                        </button>
                                        <button
                                            onClick={() => handleUpdateStatus(work.id, 'odrzucona')}
                                            disabled={submittingStatusId === work.id} // Shield #4
                                            className="text-sm px-3 py-1.5 text-red-600 hover:bg-red-50 rounded font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <XCircle className="w-4 h-4" /> Odrzuć
                                        </button>
                                        <button
                                            onClick={() => handleUpdateStatus(work.id, 'zaakceptowana')}
                                            disabled={submittingStatusId === work.id} // Shield #4
                                            className="text-sm px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <CheckCircle className="w-4 h-4" /> {submittingStatusId === work.id ? 'Przetwarzanie...' : 'Zaakceptuj'}
                                        </button>
                                    </>
                                )}

                                {work.status === 'zaakceptowana' && (
                                    <div className="text-sm text-green-700 font-medium flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        Utworzono etap dodatkowy
                                    </div>
                                )}

                                {work.status === 'odrzucona' && (
                                    <div className="text-sm text-red-600 font-medium flex items-center gap-2">
                                        <XCircle className="w-4 h-4" />
                                        Zgłoszenie odrzucone
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isFormOpen && (
                <ExtraWorkForm
                    onClose={() => {
                        setIsFormOpen(false);
                        setEditingWork(null);
                    }}
                    onSubmit={handleAddOrUpdate}
                    initialData={editingWork}
                />
            )}

            {/* Photo Lightbox */}
            {previewPhoto && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setPreviewPhoto(null)}
                >
                    <img
                        src={previewPhoto.startsWith('data:image') || previewPhoto.startsWith('http') ? previewPhoto : `${API_BASE.split('/api')[0]}${previewPhoto}`}
                        className="max-w-full max-h-full rounded shadow-2xl object-contain"
                        alt="Photo detail"
                    />
                    <button
                        className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setPreviewPhoto(null); }}
                    >
                        <XCircle size={32} />
                    </button>
                </div>
            )}
        </div>
    );
};

function StatusBadge({ status }: { status: ExtraWorkStatus }) {
    switch (status) {
        case 'draft': return <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-semibold uppercase">Szkic</span>;
        case 'wysłana_do_akceptacji': return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold uppercase">Oczekuje</span>;
        case 'zaakceptowana': return <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-semibold uppercase">Zaakceptowana</span>;
        case 'odrzucona': return <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-semibold uppercase">Odrzucona</span>;
        default: return null;
    }
}

function ExtraWorkForm({ onClose, onSubmit, initialData }: any) {
    const [formData, setFormData] = useState(initialData || {
        title: '',
        reason: '',
        plannedRevenueNet: 0,
        plannedCostNet: 0,
        notesInternal: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-blue-600 px-6 py-4 text-white">
                    <h3 className="text-lg font-bold">{initialData ? 'Edytuj / Wycen pracę dodatkową' : 'Nowa praca dodatkowa'}</h3>
                    <p className="text-blue-100 text-xs mt-1">Podaj szczegóły i wycenę dla klienta</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tytuł</label>
                        <input
                            type="text"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            placeholder="np. Dodatkowy montaż rolet"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Powód / Opis</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-24 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                            placeholder="Dlaczego jest to praca dodatkowa?"
                            value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Przychód Netto (PLN)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0" // Shield #4
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-blue-700 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                value={formData.plannedRevenueNet}
                                onChange={e => setFormData({ ...formData, plannedRevenueNet: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Koszt Netto (PLN)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0" // Shield #4
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-700"
                                value={formData.plannedCostNet}
                                onChange={e => setFormData({ ...formData, plannedCostNet: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md shadow-blue-200 transition-all hover:-translate-y-0.5"
                        >
                            {initialData ? 'Zapisz zmiany' : 'Utwórz'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
