import { useState } from 'react';
import { Copy, Plus, MoreVertical, Trash2, Edit2, Play, Search, Folder } from 'lucide-react';
import { useOffers } from '../context/OffersContext';
import { offerStorage } from '../services/storage/offerStorage';
import { v4 as uuidv4 } from 'uuid';

import type { Offer, Construction } from '../models/types';
import TemplateForm from '../components/offers/TemplateForm';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useNavigate } from 'react-router-dom';

export default function OfferTemplatesPage() {
    const { offers, refreshOffers, isLoading: isOffersLoading } = useOffers();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    // Filter offers to show only templates
    const templates = offers.filter(offer =>
        offer.offerTemplateType &&
        (offer.title?.toLowerCase().includes(searchQuery.toLowerCase()) || offer.number.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const handleAddTemplate = () => {
        setError(null);
        setEditingOffer(null);
        setIsFormOpen(true);
    };

    const handleUseTemplate = async (template: Offer) => {
        try {
            // Create a new draft offer based on the template
            const newOffer = offerStorage.createEmptyOffer();
            const defaultSettings = { margin: 0, discount: 0, workTime: { workTime: 0, workerCount: 0, hourlyRate: 0 }, installationRates: {} };
            newOffer.settings = template.settings ? { ...template.settings } : defaultSettings;
            newOffer.title = template.title;
            newOffer.scopeOfWork = template.scopeOfWork ? [...template.scopeOfWork] : [];
            newOffer.notes = template.notes ? [...template.notes] : [];
            newOffer.customMaterials = template.customMaterials ? { providedByUs: [...(template.customMaterials.providedByUs || [])], providedByClient: [...(template.customMaterials.providedByClient || [])] } : undefined;

            const offerId = await offerStorage.saveOffer(newOffer);
            const constructions = await offerStorage.getConstructionsForOffer(template.id);
            for (const c of constructions) {
                const newConstruction: Construction = { ...c, id: uuidv4(), offerId: offerId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                await offerStorage.saveConstruction(newConstruction);
            }

            await refreshOffers();
            navigate(`/offers/${offerId}`);
        } catch (error) {
            console.error('Error using template:', error);
            setError('Nie udało się utworzyć oferty na podstawie szablonu.');
        }
    };

    const handleDuplicateTemplate = async (template: Offer) => {
        try {
            const newTemplateId = uuidv4();
            const newTemplate: Offer = {
                ...template,
                id: newTemplateId,
                title: `${template.title} (Kopia)`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await offerStorage.saveOffer(newTemplate);
            const constructions = await offerStorage.getConstructionsForOffer(template.id);
            for (const c of constructions) {
                await offerStorage.saveConstruction({ ...c, id: uuidv4(), offerId: newTemplateId });
            }

            await refreshOffers();
        } catch (error) {
            console.error('Error duplicating template:', error);
            setError('Nie udało się zduplikować szablonu.');
        }
    };

    const handleSubmit = async (data: Partial<Offer>) => {
        try {
            const templateData: Offer = editingOffer ? {
                ...editingOffer,
                ...data,
                offerTemplateType: 'detailed',
                updatedAt: new Date().toISOString()
            } as Offer : {
                ...offerStorage.createEmptyOffer(),
                ...data,
                status: 'draft',
                offerTemplateType: 'detailed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            } as Offer;

            await offerStorage.saveOffer(templateData);
            await refreshOffers();
            setIsFormOpen(false);
            setEditingOffer(null);
        } catch (error) {
            console.error('Błąd podczas zapisywania wzoru:', error);
            setError('Nie udało się zapisać wzoru.');
        }
    };

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const confirmDelete = async () => {
        if (!deletingId) return;
        try {
            await offerStorage.deleteOffer(deletingId);
            await refreshOffers();
            setDeletingId(null);
        } catch {
            setError('Nie udało się usunąć wzoru.');
        }
    };

    if (isFormOpen) {
        return (
            <TemplateForm
                template={editingOffer}
                onSubmit={handleSubmit}
                onCancel={() => setIsFormOpen(false)}
            />
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="Usuń wzór oferty">
                <div className="space-y-4">
                    <p className="text-slate-600">Czy na pewno chcesz trwale usunąć ten wzór oferty? Tej operacji nie można cofnąć.</p>
                    <div className="flex justify-end space-x-3 mt-6">
                        <Button variant="secondary" onClick={() => setDeletingId(null)}>Anuluj</Button>
                        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDelete}>Usuń trwale</Button>
                    </div>
                </div>
            </Modal>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Biblioteka Szablonów</h1>
                    <p className="text-slate-500 mt-1">Zarządzaj wzorami ofert i przyspiesz tworzenie dokumentów</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" className="bg-white border-slate-200">
                        <Folder className="h-4 w-4 mr-2" /> Zarządzaj grupami
                    </Button>
                    <Button onClick={handleAddTemplate} className="shadow-lg shadow-primary/20">
                        <Plus className="h-5 w-5 mr-2" /> Nowy Szablon
                    </Button>
                </div>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Szukaj w szablonach..."
                    className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white border border-slate-200 focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    {error}
                </div>
            )}

            {templates.length === 0 && !isOffersLoading ? (
                <div className="py-24 flex flex-col items-center text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                    <Copy className="h-16 w-16 text-slate-200 mb-6" />
                    <h3 className="text-xl font-bold text-slate-900">Brak dostępnych szablonów</h3>
                    <p className="text-slate-500 max-w-sm mt-2">Nie znaleźliśmy żadnych szablonów pasujących do Twoich kryteriów.</p>
                    <Button onClick={handleAddTemplate} className="mt-8">Stwórz swój pierwszy wzór</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {templates.map((template) => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            onUse={handleUseTemplate}
                            onEdit={() => { setEditingOffer(template); setIsFormOpen(true); }}
                            onDuplicate={() => handleDuplicateTemplate(template)}
                            onDelete={() => setDeletingId(template.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface TemplateCardProps {
    template: Offer;
    onUse: (template: Offer) => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

function TemplateCard({ template, onUse, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <div className="group relative bg-white border border-slate-100 rounded-[32px] p-8 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 flex flex-col h-full">
            <div className="flex justify-between items-start mb-6">
                <div className="h-14 w-14 rounded-[22px] bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all duration-500">
                    <Copy className="h-7 w-7" />
                </div>
                <div className="relative">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                    >
                        <MoreVertical className="h-5 w-5" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-10 py-2 animate-in fade-in zoom-in-95 duration-150">
                            <button onClick={onEdit} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                                <Edit2 className="h-4 w-4" /> Edytuj wzór
                            </button>
                            <button onClick={onDuplicate} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                                <Copy className="h-4 w-4" /> Duplikuj
                            </button>
                            <div className="h-px bg-slate-100 my-1 mx-2" />
                            <button onClick={onDelete} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 className="h-4 w-4" /> Usuń
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1">
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mb-2 group-hover:text-primary transition-colors">{template.title || template.number}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-6">Szczegółowy szablon oferty zawierający zakres prac, uwagi oraz predefiniowane ustawienia narzutów.</p>

                <div className="flex flex-wrap gap-2 mb-8">
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-lg">Szczegółowy</span>
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-lg">Draft</span>
                </div>
            </div>

            <div className="pt-6 border-t border-slate-50">
                <Button onClick={() => onUse(template)} className="w-full py-6 rounded-2xl group/btn overflow-hidden relative">
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        Użyj tego szablonu <Play className="h-4 w-4 fill-current group-hover/btn:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-0 bg-primary-dark translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                </Button>
            </div>

            {isMenuOpen && <div className="fixed inset-0 z-0" onClick={() => setIsMenuOpen(false)} />}
        </div>
    );
}
