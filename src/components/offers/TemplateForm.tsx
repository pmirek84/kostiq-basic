import React, { useState } from 'react';
import { Copy, Plus, X, Save, FileText, Layout, Info } from 'lucide-react';
import type { Offer } from '../../models/types';
import { Button } from '../ui/Button';

interface TemplateFormProps {
    template?: Offer | null;
    onSubmit: (data: Partial<Offer>) => void;
    onCancel: () => void;
}

export default function TemplateForm({ template, onSubmit, onCancel }: TemplateFormProps) {
    const [formData, setFormData] = useState({
        title: template?.title || '',
        scopeOfWork: template?.scopeOfWork && template.scopeOfWork.length > 0 ? template.scopeOfWork : [''],
        notes: template?.notes && template.notes.length > 0 ? template.notes : [''],
        customMaterials: {
            providedByUs: template?.customMaterials?.providedByUs && template.customMaterials.providedByUs.length > 0 ? template.customMaterials.providedByUs : [''],
            providedByClient: template?.customMaterials?.providedByClient && template.customMaterials.providedByClient.length > 0 ? template.customMaterials.providedByClient : ['']
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const handleScopeChange = (index: number, value: string) => {
        const newScope = [...formData.scopeOfWork];
        newScope[index] = value;
        setFormData({ ...formData, scopeOfWork: newScope });
    };

    const handleNoteChange = (index: number, value: string) => {
        const newNotes = [...formData.notes];
        newNotes[index] = value;
        setFormData({ ...formData, notes: newNotes });
    };

    const handleMaterialChange = (type: 'providedByUs' | 'providedByClient', index: number, value: string) => {
        const newMaterials = { ...formData.customMaterials };
        newMaterials[type][index] = value;
        setFormData({
            ...formData,
            customMaterials: newMaterials
        });
    };

    const addScopeItem = () => setFormData({ ...formData, scopeOfWork: [...formData.scopeOfWork, ''] });
    const removeScopeItem = (index: number) => setFormData({ ...formData, scopeOfWork: formData.scopeOfWork.filter((_, i) => i !== index) });

    const addNoteItem = () => setFormData({ ...formData, notes: [...formData.notes, ''] });
    const removeNoteItem = (index: number) => setFormData({ ...formData, notes: formData.notes.filter((_, i) => i !== index) });

    const addMaterialItem = (type: 'providedByUs' | 'providedByClient') => {
        const newMaterials = { ...formData.customMaterials };
        newMaterials[type] = [...newMaterials[type], ''];
        setFormData({ ...formData, customMaterials: newMaterials });
    };

    const removeMaterialItem = (type: 'providedByUs' | 'providedByClient', index: number) => {
        const newMaterials = { ...formData.customMaterials };
        newMaterials[type] = newMaterials[type].filter((_, i) => i !== index);
        setFormData({ ...formData, customMaterials: newMaterials });
    };

    return (
        <div className="max-w-5xl mx-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-3xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20">
                            <Copy className="h-7 w-7" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {template ? 'Edytuj wzór' : 'Nowy wzór oferty'}
                            </h2>
                            <p className="text-slate-500 mt-0.5">Skonfiguruj stałe elementy oferty, które będą automatycznie powielane.</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* Basic Info */}
                        <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                                <Info className="h-4 w-4" /> Informacje o wzorze
                            </h3>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-slate-800 ml-1">Tytuł szablonu</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-lg font-medium"
                                    required
                                    placeholder="np. Oferta standardowa - Montaż okien"
                                />
                            </div>
                        </div>

                        {/* Scope of Work */}
                        <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm overflow-hidden relative">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                    <Layout className="h-4 w-4" /> Zakres prac
                                </h3>
                                <button
                                    type="button"
                                    onClick={addScopeItem}
                                    className="p-2 bg-slate-50 text-primary hover:bg-primary hover:text-white rounded-xl transition-all"
                                >
                                    <Plus className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                {formData.scopeOfWork.map((item, index) => (
                                    <div key={index} className="group relative flex items-center gap-4">
                                        <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center font-mono text-xs font-black text-slate-300 bg-slate-50 rounded-xl transition-all group-focus-within:bg-primary/10 group-focus-within:text-primary">
                                            {index + 1}
                                        </div>
                                        <input
                                            type="text"
                                            value={item}
                                            onChange={(e) => handleScopeChange(index, e.target.value)}
                                            className="flex-1 px-5 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-sm font-medium"
                                            placeholder="Opisz punkt zakresu prac..."
                                            required
                                        />
                                        {formData.scopeOfWork.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeScopeItem(index)}
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                    <FileText className="h-4 w-4" /> Dodatkowe uwagi
                                </h3>
                                <button
                                    type="button"
                                    onClick={addNoteItem}
                                    className="p-2 bg-slate-50 text-primary hover:bg-primary hover:text-white rounded-xl transition-all"
                                >
                                    <Plus className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                {formData.notes.map((item, index) => (
                                    <div key={index} className="group flex items-center gap-4">
                                        <input
                                            type="text"
                                            value={item}
                                            onChange={(e) => handleNoteChange(index, e.target.value)}
                                            className="flex-1 px-5 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-primary outline-none transition-all text-sm"
                                            placeholder="Dodaj uwagę do oferty..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeNoteItem(index)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <X className="h-5 w-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar: Materials */}
                    <div className="lg:col-span-4 space-y-8">
                        <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl shadow-slate-900/20">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 border-b border-slate-800 pb-4">
                                Materiały we wzorze
                            </h3>

                            {/* Materials we provide */}
                            <div className="mb-10">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-slate-300 tracking-tight">Dostarczane przez nas</span>
                                    <button
                                        type="button"
                                        onClick={() => addMaterialItem('providedByUs')}
                                        className="h-7 w-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-slate-400" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {formData.customMaterials.providedByUs.map((item, index) => (
                                        <div key={index} className="group flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={item}
                                                onChange={(e) => handleMaterialChange('providedByUs', index, e.target.value)}
                                                className="flex-1 bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-medium text-slate-200 placeholder:text-white/10 focus:ring-2 focus:ring-primary outline-none"
                                                placeholder="Materiał..."
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeMaterialItem('providedByUs', index)}
                                                className="p-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Materials provided by client */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold text-slate-300 tracking-tight">Przez Zleceniodawcę</span>
                                    <button
                                        type="button"
                                        onClick={() => addMaterialItem('providedByClient')}
                                        className="h-7 w-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-4 w-4 text-slate-400" />
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {formData.customMaterials.providedByClient.map((item, index) => (
                                        <div key={index} className="group flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={item}
                                                onChange={(e) => handleMaterialChange('providedByClient', index, e.target.value)}
                                                className="flex-1 bg-slate-800 border-none rounded-xl px-4 py-2 text-xs font-medium text-slate-200 placeholder:text-white/10 focus:ring-2 focus:ring-primary outline-none"
                                                placeholder="Materiał klienta..."
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeMaterialItem('providedByClient', index)}
                                                className="p-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-[32px] border border-slate-200/50 shadow-2xl p-4 flex items-center justify-between gap-4 z-50 animate-in slide-in-from-bottom-20 duration-500">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-8 py-4 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
                    >
                        Anuluj
                    </button>
                    <Button
                        type="submit"
                        size="lg"
                        className="px-12 py-4 rounded-[22px] shadow-xl shadow-primary/20"
                    >
                        <Save className="h-5 w-5 mr-3" />
                        {template ? 'Zapisz zmiany' : 'Zapisz wzór'}
                    </Button>
                </div>
                <div className="h-32" /> {/* Spacer for fixed footer */}
            </form>
        </div>
    );
}
