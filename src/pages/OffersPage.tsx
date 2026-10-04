import { useState, useEffect } from 'react';
import { FileEdit, Plus, Download, Printer, Briefcase, Copy, Search } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useOffers } from '../context/OffersContext';
import { useClients } from '../context/ClientsContext';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { offerStorage } from '../services/storage/offerStorage';
import { useConstructionStorage } from '../hooks/useConstructionStorage';
import type { Offer, Construction, OfferStatus } from '../models/types';
import OfferForm from '../components/offers/OfferForm';
import InitialOfferForm from '../components/offers/InitialOfferForm';
import OfferDetailsEditor from '../components/offers/OfferDetailsEditor';
import OfferPreviewModal from '../components/offers/OfferPreviewModal';
import { Button } from '../components/ui/Button';
import { ActionButtons } from '../components/ui/ActionButtons';
import { toast } from 'sonner';

import { CreateJobWizard } from '../components/jobs/wizard/CreateJobWizard';
import type { OfferItem } from '../models/types';

export default function OffersPage() {
    const { offers, refreshOffers, isLoading: isOffersLoading } = useOffers();
    const { clients } = useClients();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { id: routeOfferId } = useParams<{ id: string }>();

    const [autoPrint, setAutoPrint] = useState(false);

    // ... (getClientName function remains same)
    const getClientName = (id: string) => {
        const client = clients.find(c => c.id === id);
        if (!client) return id; // Fallback to ID if not found (e.g. legacy string)
        return client.type === 'company' && client.company
            ? client.company
            : `${client.name || ''} ${client.lastName || ''}`.trim();
    };

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isInitialFormOpen, setIsInitialFormOpen] = useState(false);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
    const [editingDetails, setEditingDetails] = useState<Offer | null>(null);
    const [previewOffer, setPreviewOffer] = useState<Offer | null>(null);
    const [currentOfferData, setCurrentOfferData] = useState<{
        number: string;
        client: string;
        location: string;
        idempotencyKey?: string;
    } | null>(null);
    const [formIdempotencyKey, setFormIdempotencyKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Wizard State
    const [wizardOffer, setWizardOffer] = useState<Offer | null>(null);
    const [wizardItems, setWizardItems] = useState<OfferItem[]>([]);

    const { clearConstructions, initializeConstructions } = useConstructionStorage();

    // Deep linking effect
    useEffect(() => {
        if (routeOfferId && offers.length > 0 && !isOffersLoading) {
            const offer = offers.find(o => o.id === routeOfferId);
            if (offer && editingOffer?.id !== offer.id) {
                const timer = setTimeout(() => handleEditOffer(offer), 0);
                return () => clearTimeout(timer);
            }
        }
    }, [routeOfferId, offers, isOffersLoading, editingOffer?.id]);

    useEffect(() => {
        if (searchParams.get('action') === 'new') {
            const timer = setTimeout(async () => {
                await clearConstructions();
                setEditingOffer(null);
                setCurrentOfferData(null);
                setFormIdempotencyKey(uuidv4());
                setIsInitialFormOpen(true);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [searchParams, clearConstructions]);

    // Refresh offers list when page mounts or the edit form is closed (exit editor/back navigation)
    useEffect(() => {
        if (!isFormOpen) {
            refreshOffers();
        }
    }, [isFormOpen]);

    // ... (handlers)

    const handleCloseSuccess = () => {
        setIsFormOpen(false);
        setEditingOffer(null);
        setCurrentOfferData(null);
        setAutoPrint(false);
        // Clear URL if we were on specific offer route
        if (routeOfferId) {
            navigate('/offers');
        }
    };

    // Note: Updated handleCancel to also clear route
    const handleCancel = async () => {
        if (confirm('Czy na pewno chcesz anulować? Wprowadzone zmiany zostaną utracone.')) {
            try {
                setError(null);
                setAutoPrint(false);
                await clearConstructions();
                setIsFormOpen(false);
                setIsInitialFormOpen(false);
                setEditingOffer(null);
                setCurrentOfferData(null);
                if (routeOfferId) {
                    navigate('/offers');
                }
            } catch (error) {
                console.error('Błąd podczas anulowania:', error);
                setError('Wystąpił błąd podczas anulowania. Spróbuj ponownie.');
            }
        }
    };

    // ... (rest)

    const handleAddOffer = async () => {
        try {
            setError(null);
            setAutoPrint(false);
            await clearConstructions();
            setEditingOffer(null);
            setCurrentOfferData(null);
            setFormIdempotencyKey(uuidv4());
            setIsInitialFormOpen(true);
        } catch (error) {
            console.error('Błąd podczas przygotowania nowej oferty:', error);
            setError('Nie udało się przygotować nowej oferty. Spróbuj ponownie.');
        }
    };

    const handleInitialFormSubmit = (data: { number: string; client: string; location: string }) => {
        const key = formIdempotencyKey || uuidv4();
        if (!formIdempotencyKey) {
            setFormIdempotencyKey(key);
        }
        setCurrentOfferData({
            ...data,
            idempotencyKey: key
        });
        setIsInitialFormOpen(false);
        setIsFormOpen(true);
    };

    const handleEditOffer = async (offer: Offer, shouldAutoPrint: boolean = false) => {
        try {
            setError(null);
            setAutoPrint(shouldAutoPrint);
            await clearConstructions();
            const constructions = await offerStorage.getConstructionsForOffer(offer.id);
            await initializeConstructions(constructions);

            setEditingOffer(offer);
            setCurrentOfferData({
                number: offer.number,
                client: offer.clientId,
                location: offer.location
            });
            setIsFormOpen(true);
        } catch (error) {
            console.error('Błąd podczas edycji oferty:', error);
            setError('Nie udało się załadować oferty do edycji. Spróbuj ponownie.');
        }
    };

    const handlePrintOffer = (offer: Offer) => handleEditOffer(offer, true);

    const [showTemplates, setShowTemplates] = useState(false);

    // Filter out templates from the main offers list unless showTemplates is true
    const displayedOffers = offers.filter(offer => showTemplates ? true : (offer.recordKind ? offer.recordKind !== 'template' : !offer.offerTemplateType));

    const handleDeleteOffer = async (id: string) => {
        if (window.confirm('Czy na pewno chcesz usunąć tę ofertę?')) {
            try {
                setError(null);
                const targetOffer = offers.find(o => o.id === id);
                await offerStorage.deleteOffer(id, targetOffer?.editVersion !== undefined ? { expectedVersion: targetOffer.editVersion } : undefined);
                await refreshOffers();
                toast.success('Oferta została usunięta');
            } catch (error) {
                console.error('Błąd podczas usuwania oferty:', error);
                setError('Nie udało się usunąć oferty. Spróbuj ponownie.');
            }
        }
    };

    const handleStatusChange = async (offer: Offer, newStatus: OfferStatus) => {
        try {
            setError(null);
            const updatedOffer = {
                ...offer,
                status: newStatus
                // NOTE: do NOT set updatedAt — backend stamps it on PATCH to avoid 409
            };
            await offerStorage.saveOffer(updatedOffer);
            await refreshOffers();
        } catch (error) {
            console.error('Błąd podczas zmiany statusu oferty:', error);
            setError('Nie udało się zmienić statusu oferty. Spróbuj ponownie.');
        }
    };

    const handleConvertToJob = async (offer: Offer) => {
        try {
            // 1. Fetch constructions → each becomes a position
            const constructions = await offerStorage.getConstructionsForOffer(offer.id);

            const constructionItems: OfferItem[] = constructions.map(c => ({
                id: c.id,
                offerId: c.offerId || offer.id,
                name: c.name,
                description: c.type,
                quantity: c.quantity,
                unit: 'szt.',
                unitPriceNet: c.quantity > 0 ? c.totalCost / c.quantity : c.totalCost,
                valueNet: c.totalCost,
                vatRate: offer.vatRate ?? 23,
                valueGross: c.totalCost * (1 + (offer.vatRate ?? 23) / 100),
                sourceConstructionId: c.id
            }));

            // 2. Add synthetic cost items for services not split per construction
            const costItems: OfferItem[] = [];
            const vatRate = offer.vatRate ?? 23;

            // Usługi montażowe (robocizna własna — czas pracy zespołu)
            const workTimeCost = offer.workTimeCost ?? 0;
            if (workTimeCost > 0.01) {
                costItems.push({
                    id: `${offer.id}_labor`,
                    offerId: offer.id,
                    name: 'Usługi montażowe',
                    description: 'Robocizna — czas pracy zespołu montażowego',
                    quantity: 1,
                    unit: 'usługa',
                    unitPriceNet: workTimeCost,
                    valueNet: workTimeCost,
                    vatRate,
                    valueGross: workTimeCost * (1 + vatRate / 100),
                });
            }

            // Transport konstrukcji
            const constructionTransport = offer.constructionTransportCost ?? 0;
            if (constructionTransport > 0.01) {
                costItems.push({
                    id: `${offer.id}_transport_constr`,
                    offerId: offer.id,
                    name: 'Transport konstrukcji',
                    description: 'Koszty dowozu elementów na miejsce montażu',
                    quantity: 1,
                    unit: 'usługa',
                    unitPriceNet: constructionTransport,
                    valueNet: constructionTransport,
                    vatRate,
                    valueGross: constructionTransport * (1 + vatRate / 100),
                });
            }

            // Transport pracowników
            const workerTransport = offer.workerTransportCost ?? 0;
            if (workerTransport > 0.01) {
                costItems.push({
                    id: `${offer.id}_transport_workers`,
                    offerId: offer.id,
                    name: 'Transport pracowników',
                    description: 'Koszty dojazdu ekipy montażowej',
                    quantity: 1,
                    unit: 'usługa',
                    unitPriceNet: workerTransport,
                    valueNet: workerTransport,
                    vatRate,
                    valueGross: workerTransport * (1 + vatRate / 100),
                });
            }

            // Wynajem sprzętu
            const equipmentRental = offer.equipmentRentalCost ?? 0;
            if (equipmentRental > 0.01) {
                costItems.push({
                    id: `${offer.id}_equipment`,
                    offerId: offer.id,
                    name: 'Wynajem sprzętu',
                    description: 'Wynajem sprzętu specjalistycznego (rusztowania, podnośniki itp.)',
                    quantity: 1,
                    unit: 'usługa',
                    unitPriceNet: equipmentRental,
                    valueNet: equipmentRental,
                    vatRate,
                    valueGross: equipmentRental * (1 + vatRate / 100),
                });
            }

            setWizardItems([...constructionItems, ...costItems]);
            setWizardOffer(offer);

        } catch (error) {
            console.error('Failed to prepare job wizard:', error);
            setError('Wystąpił błąd podczas przygotowania kreatora zlecenia.');
        }
    };

    const handleDetailsUpdate = async (offer: Offer, details: { number: string; client: string; location: string }) => {
        try {
            setError(null);
            const updatedOffer = {
                ...offer,
                number: details.number,
                clientId: details.client,
                location: details.location
                // NOTE: do NOT set updatedAt — backend stamps it on PATCH to avoid 409
            };
            await offerStorage.saveOffer(updatedOffer);
            await refreshOffers();
            setEditingDetails(null);
        } catch (error) {
            console.error('Błąd podczas aktualizacji danych oferty:', error);
            setError('Nie udało się zaktualizować danych oferty. Spróbuj ponownie.');
        }
    };

    const handleDuplicateOffer = async (offer: Offer) => {
        try {
            setError(null);
            // 1. Get full offer data including constructions
            const constructions = await offerStorage.getConstructionsForOffer(offer.id);

            // 2. Prepare new offer data
            const newOfferId = uuidv4();
            const newOffer: Offer = {
                ...offer,
                id: newOfferId,
                number: `${offer.number} (kopia)`,
                title: `Duplikat ${offer.title || ''}`,
                status: 'draft',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // 3. Save new offer
            await offerStorage.saveOffer(newOffer);

            // 4. Duplicate constructions
            for (const construction of constructions) {
                const newConstruction: Construction = {
                    ...construction,
                    id: uuidv4(),
                    offerId: newOfferId,
                    updatedAt: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };
                await offerStorage.saveConstruction(newConstruction);
            }

            // 5. Refresh list
            await refreshOffers();
        } catch (error) {
            console.error('Błąd podczas duplikowania oferty:', error);
            setError('Nie udało się zduplikować oferty. Spróbuj ponownie.');
        }
    };

    const handleSubmit = async (data: Partial<Offer>, constructions: Construction[]) => {
        try {
            setError(null);
            if (!currentOfferData) {
                throw new Error('Brak danych oferty');
            }

            if (editingOffer) {
                const offerToSave: Offer = {
                    ...editingOffer,
                    ...data
                    // NOTE: do NOT set updatedAt — backend stamps it on PATCH to avoid 409
                } as Offer;

                // Save offer
                const offerId = await offerStorage.saveOffer(offerToSave);

                // Sync Offer ID to constructions & Save to DB
                const constructionsToSave = constructions.map(c => ({ ...c, offerId }));
                for (const c of constructionsToSave) {
                    await offerStorage.saveConstruction(c);
                }

                await initializeConstructions(constructionsToSave);
                await refreshOffers();

                const freshOffer = await offerStorage.getOffer(offerId);
                if (freshOffer) {
                    setEditingOffer(freshOffer);
                    setCurrentOfferData({
                        number: freshOffer.number,
                        client: freshOffer.clientId,
                        location: freshOffer.location
                    });
                }
            } else {
                // ACID Atomic creation with stable form idempotency key across retries
                const key = formIdempotencyKey || currentOfferData?.idempotencyKey || uuidv4();
                const offerPayload: Partial<Offer> = {
                    ...offerStorage.createEmptyOffer(),
                    clientId: currentOfferData.client,
                    location: currentOfferData.location,
                    status: 'draft',
                    ...data
                };
                if (currentOfferData.number && currentOfferData.number.trim()) {
                    offerPayload.number = currentOfferData.number.trim();
                }

                const result = await offerStorage.createOfferAtomic({
                    offer: offerPayload,
                    constructions: constructions,
                    idempotencyKey: key
                });

                const createdOffer = result.offer;
                const createdConstructions = result.constructions || [];

                await initializeConstructions(createdConstructions);
                await refreshOffers();

                setEditingOffer(createdOffer);
                setCurrentOfferData({
                    number: createdOffer.number,
                    client: createdOffer.clientId,
                    location: createdOffer.location
                });
                setFormIdempotencyKey(null);
            }

            setIsInitialFormOpen(false);
            // We keep the form open to allow further editing

        } catch (error) {
            console.error('Błąd podczas zapisywania oferty:', error);
            setError('Nie udało się zapisać oferty. Spróbuj ponownie.');
        }
    };

    if (wizardOffer) {
        return (
            <CreateJobWizard
                offer={wizardOffer}
                offerItems={wizardItems}
                onSuccess={async () => {
                    if (wizardOffer) {
                        await handleStatusChange(wizardOffer, 'converted');
                    }
                }}
                onClose={() => {
                    setWizardOffer(null);
                    setWizardItems([]);
                    navigate('/jobs');
                }}
            />
        );
    }

    if (isFormOpen) {
        return (
            <OfferForm
                key={editingOffer ? editingOffer.id : 'new'}
                initialData={editingOffer}
                headerData={currentOfferData || undefined}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                onClose={handleCloseSuccess}
                onStatusChange={async (status) => {
                    if (editingOffer) await handleStatusChange(editingOffer, status);
                }}
                autoPrint={autoPrint}
            />
        );
    }

    if (isInitialFormOpen) {
        return (
            <InitialOfferForm
                onSubmit={handleInitialFormSubmit}
                onCancel={handleCancel}
            />
        );
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                    {error}
                </div>
            )}

            <div className="bg-white p-6 rounded-2xl border border-black/10">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                        <FileEdit className="h-6 w-6 text-gray-400" />
                        <h2 className="text-xl font-semibold text-gray-900">Oferty</h2>
                    </div>
                    <div className="flex space-x-4">
                        <Button variant="secondary">
                            <Download className="h-4 w-4 mr-2" />
                            Eksportuj
                        </Button>
                        <Button onClick={handleAddOffer}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nowa oferta
                        </Button>
                    </div>
                </div>

                {/* Filters / Toggles */}
                <div className="px-6 pb-2 flex justify-end">
                    <button
                        onClick={() => setShowTemplates(!showTemplates)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${showTemplates ? 'bg-teal-50 border-teal-150/40 text-[#21808D] font-medium' : 'bg-zinc-50 border-black/10 text-zinc-500 hover:text-zinc-800 font-medium'}`}
                    >
                        {showTemplates ? 'Ukryj wzory ofert' : 'Pokaż wzory ofert'}
                    </button>
                </div>

                {displayedOffers.length === 0 && !isOffersLoading ? (
                    <div className="text-center py-8 text-gray-500">
                        <FileEdit className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            {showTemplates ? 'Brak ofert i wzorów' : 'Brak aktywnych ofert'}
                        </h3>
                        <p className="mb-4">
                            Dodaj swoją pierwszą ofertę, aby rozpocząć zarządzanie procesem ofertowania
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-black/10 rounded-2xl">
                        <table className="min-w-full divide-y divide-black/5">
                            <thead className="bg-zinc-50/50 border-b border-black/10">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Numer
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Klient
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Lokalizacja
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Wartość
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Akcje
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-black/5">
                                {displayedOffers.map((offer) => (
                                    <tr key={offer.id} className="hover:bg-zinc-50/40 transition-colors">
                                        {editingDetails?.id === offer.id ? (
                                            <td colSpan={3} className="px-6 py-4">
                                                <OfferDetailsEditor
                                                    number={offer.number}
                                                    client={offer.clientId}
                                                    location={offer.location}
                                                    onSave={(details) => handleDetailsUpdate(offer, details)}
                                                    onCancel={() => setEditingDetails(null)}
                                                />
                                            </td>
                                        ) : (
                                            <>
                                                <td
                                                    className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-zinc-900 cursor-pointer hover:text-[#21808D] hover:underline"
                                                    onClick={() => setEditingDetails(offer)}
                                                >
                                                    {offer.number}
                                                </td>
                                                <td
                                                    className="px-6 py-4 whitespace-nowrap text-sm text-zinc-650 cursor-pointer hover:text-[#21808D] hover:underline"
                                                    onClick={() => setEditingDetails(offer)}
                                                >
                                                    {getClientName(offer.clientId)}
                                                </td>
                                                <td
                                                    className="px-6 py-4 whitespace-nowrap text-sm text-zinc-550 cursor-pointer hover:text-[#21808D] hover:underline"
                                                    onClick={() => setEditingDetails(offer)}
                                                >
                                                    {offer.location}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <select
                                                value={offer.status}
                                                onChange={(e) => handleStatusChange(offer, e.target.value as OfferStatus)}
                                                className={`px-2 py-0.5 text-xs leading-5 font-semibold rounded-full border outline-none cursor-pointer ${offer.status === 'draft'
                                                    ? 'bg-zinc-100 text-zinc-800 border-zinc-200'
                                                    : offer.status === 'sent'
                                                        ? 'bg-teal-50 text-teal-800 border-teal-100/50'
                                                        : offer.status === 'accepted'
                                                            ? 'bg-green-50 text-green-800 border-green-150/30'
                                                            : offer.status === 'rejected'
                                                                ? 'bg-red-50 text-red-850 border-red-150/30'
                                                                : 'bg-zinc-100 text-zinc-800 border-zinc-200'
                                                    }`}
                                            >
                                                <option value="draft">Szkic</option>
                                                <option value="sent">Wysłana</option>
                                                <option value="accepted">Zaakceptowana</option>
                                                <option value="rejected">Odrzucona</option>
                                                <option value="converted">Zlecenie</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {offer.totalCost?.toFixed(2) || '0.00'} PLN
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <ActionButtons
                                                onEdit={() => handleEditOffer(offer)}
                                                onDelete={() => handleDeleteOffer(offer.id)}
                                                customActions={
                                                    <>
                                                        <button
                                                            onClick={() => setPreviewOffer(offer)}
                                                            className="p-1.5 text-zinc-400 hover:text-[#21808D] hover:bg-teal-50/50 rounded-xl transition-colors"
                                                            title="Szybki podgląd"
                                                        >
                                                            <Search className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDuplicateOffer(offer)}
                                                            className="p-1.5 text-zinc-400 hover:text-[#21808D] hover:bg-teal-50/50 rounded-xl transition-colors"
                                                            title="Duplikuj ofertę"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </button>
                                                        {(offer.status === 'accepted' || offer.status === 'sent') && (
                                                            <button
                                                                onClick={() => handleConvertToJob(offer)}
                                                                className="p-1.5 text-green-600 hover:text-green-950 hover:bg-green-50/50 rounded-xl transition-colors"
                                                                title="Utwórz zlecenie z oferty"
                                                            >
                                                                <Briefcase className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handlePrintOffer(offer)}
                                                            className="p-1.5 text-zinc-400 hover:text-[#21808D] hover:bg-teal-50/50 rounded-xl transition-colors"
                                                            title="Drukuj / Podgląd"
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {previewOffer && (
                <OfferPreviewModal
                    offer={previewOffer}
                    clientName={getClientName(previewOffer.clientId)}
                    onClose={() => setPreviewOffer(null)}
                />
            )}
        </div>
    );
}
