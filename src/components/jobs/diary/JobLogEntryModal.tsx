import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { JobLogEntry, JobLogEntryType, Job, JobLogExtraCost } from '../../../models/types';
import { useJobLog } from '../../../context/JobLogContext';
import { v4 as uuidv4 } from 'uuid';

interface JobLogEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobId: string;
    entryToEdit?: JobLogEntry;
    initialData?: Partial<JobLogEntry>;
    job: Job;
}

export const JobLogEntryModal = ({ isOpen, onClose, jobId, entryToEdit, initialData, job }: JobLogEntryModalProps) => {
    const { addEntry, updateEntry, deleteEntry } = useJobLog();

    // Form State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [type, setType] = useState<JobLogEntryType>('work_day');
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [visibleToClient, setVisibleToClient] = useState(false);
    const [jobStageId, setJobStageId] = useState<string>('');
    const [extraCosts, setExtraCosts] = useState<JobLogExtraCost[]>([]);
    const [source, setSource] = useState<'internal' | 'pwa'>('internal');

    useEffect(() => {
        if (entryToEdit) {
            setDate(entryToEdit.date);
            setType(entryToEdit.type);
            setTitle(entryToEdit.title || '');
            setText(entryToEdit.text);
            setVisibleToClient(entryToEdit.visibleToClient);
            setJobStageId(entryToEdit.jobStageId || '');
            setExtraCosts(entryToEdit.extraCosts || []);
            setSource(entryToEdit.source || 'internal');
        } else if (initialData) {
            // Pre-fill for new entry
            setDate(initialData.date || new Date().toISOString().split('T')[0]);
            setType(initialData.type || 'work_day');
            setTitle(initialData.title || '');
            setText(initialData.text || '');
            setVisibleToClient(initialData.visibleToClient ?? true); // Default to true!
            setJobStageId(initialData.jobStageId || '');
            setExtraCosts(initialData.extraCosts || []);
            setSource(initialData.source || 'internal');
        } else {
            // Reset for new entry
            setDate(new Date().toISOString().split('T')[0]);
            setType('work_day');
            setTitle('');
            setText('');
            setVisibleToClient(true); // Default to true for new entries
            setJobStageId('');
            setExtraCosts([]);
            setSource('internal');
        }
    }, [entryToEdit, initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const entryData = {
            jobId,
            date,
            type,
            title,
            text,
            visibleToClient,
            jobStageId: jobStageId || undefined,
            extraCosts: extraCosts.length > 0 ? extraCosts : undefined,
            photos: entryToEdit?.photos || initialData?.photos || [], // Keep existing photos or empty for now (upload stub)
            authorId: 'Admin', // Stub
            source,
        };

        if (entryToEdit) {
            await updateEntry(entryToEdit.id, entryData);
        } else {
            await addEntry(entryData);
        }
        onClose();
    };

    const handleDelete = async () => {
        if (entryToEdit && confirm('Czy na pewno chcesz usunąć ten wpis?')) {
            await deleteEntry(entryToEdit.id);
            onClose();
        }
    };

    // Extra Costs Handlers
    const addExtraCost = () => {
        setExtraCosts([...extraCosts, { id: uuidv4(), description: '', amount: 0, currency: 'PLN' }]);
    };

    const updateExtraCost = (id: string, field: keyof JobLogExtraCost, value: any) => {
        setExtraCosts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const removeExtraCost = (id: string) => {
        setExtraCosts(prev => prev.filter(c => c.id !== id));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[28px] shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="flex items-center justify-between p-6 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900">
                            {entryToEdit ? 'Edytuj wpis' : 'Nowy wpis do dziennika'}
                        </h2>
                        <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Top Row: Date & Type */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-700">Data</label>
                                <input
                                    type="date"
                                    required
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-700">Typ wpisu</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                    value={type}
                                    onChange={(e) => setType(e.target.value as JobLogEntryType)}
                                >
                                    <option value="work_day">Dzień pracy</option>
                                    <option value="note">Notatka</option>
                                    <option value="issue">Problem / Usterka</option>
                                    <option value="milestone">Kamień milowy</option>
                                    <option value="extra_work">Prace dodatkowe</option>
                                </select>
                            </div>
                        </div>

                        {/* Source Selection */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Źródło wpisu</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                value={source}
                                onChange={(e) => setSource(e.target.value as 'internal' | 'pwa')}
                            >
                                <option value="internal">🖥️ Biurowy</option>
                                <option value="pwa">📱 Z terenu (Pracownik)</option>
                            </select>
                        </div>

                        {/* Stage Selection */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Powiązany etap (opcjonalnie)</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                value={jobStageId}
                                onChange={(e) => setJobStageId(e.target.value)}
                            >
                                <option value="">-- Brak / Ogólne --</option>
                                {job.stages?.map(stage => (
                                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Title & Text */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Tytuł (opcjonalnie)</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                placeholder="Np. Montaż stolarki parter"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Treść wpisu</label>
                            <textarea
                                required
                                rows={5}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                placeholder="Opisz przebieg prac, problemy, ustalenia..."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                        </div>

                        {/* Visibility Toggle */}
                        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <input
                                type="checkbox"
                                id="visibleToClient"
                                className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500"
                                checked={visibleToClient}
                                onChange={(e) => setVisibleToClient(e.target.checked)}
                            />
                            <div>
                                <label htmlFor="visibleToClient" className="text-sm font-medium text-gray-900 cursor-pointer">
                                    Kandydat do raportu dla klienta
                                </label>
                                <p className="text-xs text-gray-500">
                                    Zaznacz, jeśli ten wpis potencjalnie ma trafić do raportu. Nie zostanie wysłany automatycznie.
                                </p>
                            </div>
                        </div>

                        {/* Extra Costs Section */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">Koszty dodatkowe (zakupy, etc.)</label>
                                <button type="button" onClick={addExtraCost} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Dodaj koszt
                                </button>
                            </div>

                            {extraCosts.length > 0 ? (
                                <div className="space-y-2">
                                    {extraCosts.map((cost) => (
                                        <div key={cost.id} className="flex gap-2 items-start">
                                            <input
                                                type="text"
                                                placeholder="Opis (np. pianka montażowa)"
                                                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                                                value={cost.description}
                                                onChange={(e) => updateExtraCost(cost.id, 'description', e.target.value)}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Kwota"
                                                className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                                                value={cost.amount}
                                                onChange={(e) => updateExtraCost(cost.id, 'amount', parseFloat(e.target.value))}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeExtraCost(cost.id)}
                                                className="p-2 text-gray-400 hover:text-red-500"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 italic">Brak dodanych kosztów.</p>
                            )}
                        </div>

                    </div>

                    <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-[28px]">
                        {entryToEdit ? (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex items-center gap-2 text-red-650 hover:text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm font-semibold"
                            >
                                <Trash2 className="w-4 h-4" />
                                Usuń
                            </button>
                        ) : <div></div>}

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-xl transition-colors text-sm font-semibold"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-zinc-950 text-white rounded-xl hover:bg-zinc-800 shadow-sm transition-all font-semibold text-sm"
                            >
                                Zapisz wpis
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
