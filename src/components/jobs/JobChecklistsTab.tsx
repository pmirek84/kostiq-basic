import { useState, useEffect, useCallback } from 'react';
import type { Job } from '../../models/types';
import { Plus, Check, Clock, ClipboardList, RefreshCw, Save, FolderOpen, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ChecklistItem {
    id: string;
    jobId: string;
    name: string;
    status: 'pending' | 'completed' | 'not_applicable';
    completedAt?: string;
    date?: string | null;
}

interface ChecklistTemplate {
    id: string;
    name: string;
    tasks: string[];
}

interface JobChecklistsTabProps {
    job: Job;
}

export const JobChecklistsTab = ({ job }: JobChecklistsTabProps) => {
    const [tasks, setTasks] = useState<ChecklistItem[]>([]);
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newTaskName, setNewTaskName] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [showTemplateInput, setShowTemplateInput] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [notes, setNotes] = useState(job.notesInternal || '');

    const loadChecklists = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const res = await fetch(`${API_BASE}/checklists?jobId=${job.id}`, {
                headers: { ...getAuthHeaders() }
            });
            if (res.ok) {
                const raw = await res.json();
                const arr = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? raw?.checklists ?? []);
                setTasks(arr);
            } else if (res.status === 404) {
                setTasks([]);
            } else {
                setError(`Błąd serwera: ${res.status} ${res.statusText}`);
            }
        } catch (err) {
            console.error('Failed to load checklists:', err);
            setError('Nie można połączyć się z serwerem. Sprawdź czy backend jest uruchomiony.');
        } finally {
            setIsLoading(false);
        }
    }, [job.id]);

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/checklist-templates`, {
                headers: { ...getAuthHeaders() }
            });
            if (res.ok) {
                const raw = await res.json();
                const arr = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
                setTemplates(arr);
            }
        } catch (err) {
            console.error('Failed to load templates:', err);
        }
    }, []);

    useEffect(() => {
        loadChecklists();
        loadTemplates();
    }, [loadChecklists, loadTemplates]);

    const toggleStatus = async (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        const newStatus = task.status === 'completed' ? 'pending' as const : 'completed' as const;
        const updates = {
            status: newStatus,
            completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined
        };

        // Optimistic update
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

        try {
            await fetch(`${API_BASE}/checklists/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(updates)
            });
        } catch (err) {
            console.error('Failed to update checklist item:', err);
            await loadChecklists(); // Rollback on error
        }
    };

    const handleAddTask = async () => {
        if (!newTaskName.trim()) return;

        const newTask: ChecklistItem = {
            id: `chk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            jobId: job.id,
            name: newTaskName.trim(),
            status: 'pending',
            date: null
        };

        setTasks(prev => [...prev, newTask]);
        setNewTaskName('');

        try {
            await fetch(`${API_BASE}/checklists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(newTask)
            });
        } catch (err) {
            console.error('Failed to add checklist item:', err);
            await loadChecklists(); // Rollback
        }
    };

    // Checklist Template Operations
    const handleSaveAsTemplate = async () => {
        if (!templateName.trim()) {
            toast.error('Wpisz nazwę szablonu.');
            return;
        }
        if (tasks.length === 0) {
            toast.error('Checklista jest pusta. Dodaj najpierw zadania.');
            return;
        }

        const newTemplate = {
            id: `tpl-${Date.now()}`,
            name: templateName.trim(),
            tasks: tasks.map(t => t.name)
        };

        try {
            const res = await fetch(`${API_BASE}/checklist-templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(newTemplate)
            });
            if (res.ok) {
                toast.success(`Zapisano szablon "${newTemplate.name}"`);
                setTemplateName('');
                setShowTemplateInput(false);
                loadTemplates();
            } else {
                toast.error('Błąd podczas zapisywania szablonu.');
            }
        } catch (err) {
            console.error('Save template failed:', err);
            toast.error('Błąd połączenia z serwerem.');
        }
    };

    const handleApplyTemplate = async (tplId: string) => {
        const tpl = templates.find(t => t.id === tplId);
        if (!tpl) return;

        const loadingToast = toast.loading(`Nakładanie szablonu "${tpl.name}"...`);
        try {
            // Add all tasks from template to current checklist
            for (const taskName of tpl.tasks) {
                // Avoid duplicating tasks with exact same name
                if (tasks.some(t => t.name.toLowerCase() === taskName.toLowerCase())) {
                    continue;
                }

                const newTask: ChecklistItem = {
                    id: `chk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    jobId: job.id,
                    name: taskName,
                    status: 'pending',
                    date: null
                };

                await fetch(`${API_BASE}/checklists`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify(newTask)
                });
            }

            toast.success(`Szablon "${tpl.name}" został zastosowany.`, { id: loadingToast });
            loadChecklists();
        } catch (err) {
            console.error('Apply template failed:', err);
            toast.error('Wystąpił błąd podczas nakładania szablonu.', { id: loadingToast });
        }
    };

    // Save Internal Notes
    const handleSaveNotes = async () => {
        setIsSavingNotes(true);
        try {
            const res = await fetch(`${API_BASE}/jobs/${job.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ notesInternal: notes })
            });
            if (res.ok) {
                toast.success('Notatki zostały zapisane.');
            } else {
                toast.error('Nie udało się zapisać notatek.');
            }
        } catch (err) {
            console.error('Save notes error:', err);
            toast.error('Błąd połączenia z serwerem.');
        } finally {
            setIsSavingNotes(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <ClipboardList className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-800 mb-1">Nie można załadować checklisty</h3>
                <p className="text-sm text-gray-500 max-w-sm mb-4">{error}</p>
                <button
                    onClick={loadChecklists}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Spróbuj ponownie
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Template Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-gray-250/50">
                <div className="flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-indigo-600" />
                    <div>
                        <h4 className="text-sm font-bold text-gray-900">Szablony Checklist</h4>
                        <p className="text-xs text-gray-500">Zarządzaj powtarzalnymi krokami na montażach.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    {/* Load Template */}
                    {templates.length > 0 && (
                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                            <ArrowDown className="w-3.5 h-3.5 text-gray-400" />
                            <select
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleApplyTemplate(e.target.value);
                                        e.target.value = ''; // Reset select
                                    }
                                }}
                                className="text-xs font-semibold text-gray-700 bg-transparent border-none focus:ring-0 outline-none cursor-pointer"
                                defaultValue=""
                            >
                                <option value="" disabled>Zastosuj szablon...</option>
                                {templates.map(tpl => (
                                    <option key={tpl.id} value={tpl.id}>{tpl.name} ({tpl.tasks.length} zadań)</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Save Template Trigger */}
                    {!showTemplateInput ? (
                        <button
                            onClick={() => setShowTemplateInput(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                            <Save className="w-3.5 h-3.5" />
                            Zapisz jako szablon
                        </button>
                    ) : (
                        <div className="flex items-center gap-1.5 animate-in slide-in-from-right duration-200">
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="Nazwa nowego szablonu..."
                                className="px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                            />
                            <button
                                onClick={handleSaveAsTemplate}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                            >
                                Zapisz
                            </button>
                            <button
                                onClick={() => {
                                    setShowTemplateInput(false);
                                    setTemplateName('');
                                }}
                                className="px-2.5 py-1.5 text-gray-400 hover:text-gray-600 text-xs font-semibold"
                            >
                                Anuluj
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Checklist items list */}
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200/60 shadow-sm">
                    <h3 className="text-base font-bold text-gray-900">Checklista realizacji zlecenia</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newTaskName}
                            onChange={(e) => setNewTaskName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                            placeholder="Nowe zadanie..."
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-56 font-medium"
                        />
                        <button 
                            onClick={handleAddTask} 
                            className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-200/50 shadow-sm"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Dodaj
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
                    {tasks.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                            <p className="font-medium">Brak zadań na checkliście</p>
                            <p className="text-xs mt-1">Wpisz nazwę zadania powyżej i kliknij "Dodaj" lub nałóż szablon.</p>
                        </div>
                    ) : tasks.map((task) => (
                        <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                            <button
                                onClick={() => toggleStatus(task.id)}
                                className={`flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors ${task.status === 'completed'
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : task.status === 'not_applicable'
                                        ? 'bg-gray-100 border-gray-200 text-gray-400'
                                        : 'bg-white border-gray-300 text-transparent hover:border-blue-500'
                                    }`}
                            >
                                <Check className="w-4 h-4" />
                            </button>

                            <div className={`flex-1 ${task.status === 'completed' ? 'opacity-50 line-through' : ''}`}>
                                <span className="font-semibold text-gray-800">{task.name}</span>
                            </div>

                            {task.status === 'completed' && (
                                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                    Zrobione: {task.completedAt ? new Date(task.completedAt).toLocaleDateString('pl-PL') : ''}
                                </span>
                            )}
                            {task.status === 'not_applicable' && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                    Nie dotyczy
                                </span>
                            )}
                            {task.status === 'pending' && (
                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center font-medium">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Do realizacji
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Internal Notes Section */}
            <div className="mt-8 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-base font-bold text-gray-900 mb-3">Notatki Wewnętrzne</h3>
                <textarea
                    className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-gray-700 h-32 resize-none"
                    placeholder="Wpisz notatki dotyczące realizacji..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex justify-end mt-3">
                    <button 
                        onClick={handleSaveNotes}
                        disabled={isSavingNotes}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
                    >
                        {isSavingNotes ? 'Zapisywanie...' : 'Zapisz notatki'}
                    </button>
                </div>
            </div>
        </div>
    );
};
