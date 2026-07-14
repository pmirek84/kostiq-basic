import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { FileText, Save, Package, ChevronDown, ChevronRight, Printer, Plus, Edit2, Trash2, Copy, Truck } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useConstructionStorage } from '../../hooks/useConstructionStorage';
import { useLogisticsRates } from '../../hooks/useLogisticsRates';
import { useInstallationRates } from '../../hooks/useInstallationRates';
import type { Construction, Offer, VatRate, DiscountType, OfferStatus, RentalItem } from '../../models/types';
import { ConstructionModal } from './ConstructionModal';
import { ImportConstructionModal } from './ImportConstructionModal';
import { RentalEquipmentSection } from './RentalEquipmentSection';
import TransportSettings from '../TransportSettings';
import InstallationRatesEditor from './InstallationRatesEditor';
import OfferDetailsHeader from './OfferDetailsHeader';
import OfferTemplateEditor from './OfferTemplateEditor';
import OfferPrintView from './OfferPrintView';
import { offerStorage } from '../../services/storage/offerStorage';
import { useOffers } from '../../context/OffersContext';
import { useClients } from '../../context/ClientsContext';
import { calculateOfferSummary } from '../../utils/offerCalculator';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { useStandards } from '../../hooks/useStandards';
import { materialsStorage } from '../../services/storage/materialsStorage';
import { applyInstallationStandardToConstruction } from '../../utils/installationStandardCalculator';


interface OfferFormProps {
    initialData?: Offer | null;
    headerData?: {
        number: string;
        client: string;
        location: string;
    };
    onSubmit: (data: Partial<Offer>, constructions: Construction[]) => Promise<void>;
    onCancel: () => void;
    onClose?: () => void; // Optional close handler
    onStatusChange: (status: OfferStatus) => Promise<void>;
    isTemplateMode?: boolean;
    autoPrint?: boolean;
}

// Default installation rates
const defaultInstallationRates: Record<string, { rate: number; unit: 'm²' | 'mb' | 'szt.' }> = {
    'Okno PVC': { rate: 120, unit: 'm²' },
    'Okno Alu': { rate: 150, unit: 'm²' },
    'Okno Drewno': { rate: 140, unit: 'm²' },
    'Drzwi PVC': { rate: 200, unit: 'szt.' },
    'Drzwi Alu': { rate: 250, unit: 'szt.' },
    'Drzwi Drewno': { rate: 220, unit: 'szt.' },
    'HS PVC': { rate: 300, unit: 'm²' },
    'HS Alu': { rate: 350, unit: 'm²' },
    'HS Drewno': { rate: 330, unit: 'm²' },
    'Fasada': { rate: 400, unit: 'm²' },
    'Witryna': { rate: 300, unit: 'm²' },
    'Fix': { rate: 150, unit: 'm²' },
    'Pergola': { rate: 180, unit: 'm²' },
    'Roleta Zew.': { rate: 100, unit: 'szt.' },
    'Żaluzja Fasad.': { rate: 120, unit: 'm²' },
    'Zip Screen': { rate: 90, unit: 'm²' }
};

// ============================================================
// SHIELD #2: Autosave / Draft Recovery
// ============================================================
const DRAFT_KEY = 'draft_offer';

type DraftPayload = {
    offerId: string;
    headerDetails: any;
    vatRate: any;
    margin: number;
    discountType: any;
    discountValue: number;
    transportSettings: any;
    title: string;
    scopeOfWork: string[];
    notes: string[];
    customMaterials: any;
    rentalItems: any[];
    printLayout: any;
    printMode: any;
    savedAt: string;
};

export default function OfferForm({
    initialData,
    onSubmit,
    onCancel,
    onClose, // Destructure onClose
    onStatusChange,
    isTemplateMode = false,
    headerData,
    autoPrint = false
}: OfferFormProps) {
    useEffect(() => {
        if (autoPrint) {
            const timer = setTimeout(() => {
                window.print();
            }, 800); // Allow time for transitions/rendering
            return () => clearTimeout(timer);
        }
    }, [autoPrint]);

    const { constructions: allConstructions, loadConstructions, saveConstruction, deleteConstruction, loading: storageLoading } = useConstructionStorage();
    const { logisticsRates } = useLogisticsRates();
    const { rates: dbInstallationRates, loading: dbInstallationRatesLoading } = useInstallationRates();
    const { offers: allOffers } = useOffers();
    const { clients } = useClients();
    const { settings: companySettings } = useCompanySettings();
    const { standards } = useStandards();
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [rentalItems, setRentalItems] = useState<RentalItem[]>(initialData?.rentalItems || []);
    const [expandedSections, setExpandedSections] = useState({
        constructions: true,
        installationRates: true,
        materials: true,
        transport: true,
        template: true,
        summary: true
    });
    // Shield #2: track if draft was restored so we don't override it immediately
    const draftRestoredRef = useRef(false);
    // Pending draft — shown as a persistent banner (more reliable than toast action)
    const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);

    // Construction Modal State
    const [isConstructionModalOpen, setIsConstructionModalOpen] = useState(false);
    const [constructionBeingEdited, setConstructionBeingEdited] = useState<Construction | null>(null);

    // Header Details State
    const [headerDetails, setHeaderDetails] = useState({
        number: initialData?.number || headerData?.number || '',
        clientId: initialData?.clientId || headerData?.client || '',
        location: initialData?.location || headerData?.location || '',
        status: initialData?.status || 'draft'
    });

    const [printMode, setPrintMode] = useState<'detailed' | 'summary'>(
        initialData?.printMode || 'detailed'
    );

    const handleHeaderUpdate = (field: string, value: any) => {
        setHeaderDetails(prev => ({ ...prev, [field]: value }));
        // If status changes, trigger the prop callback immediately if needed, or wait for save?
        // User asked for "changes to be remembered" which usually means on SAVE.
        // But for status, visual feedback often implies immediate action.
        // However, OfferDetailsHeader calls 'onStatusChange' prop (which bubbles to parent) for status select.
        // But here we want to capture it in local state too?
        // OfferDetailsHeader accepts `offer` object.
        // If we update local state, re-render passes new state to Header.

        // Note: OfferDetailsHeader has separate onStatusChange prop.
        // We might want to sync them.
    };

    // Initialize installation rates from initial data or defaults
    // ... rest of init code ...

    // We start with defaults/initial and update via effect when DB rates load
    const [installationRates, setInstallationRates] = useState(
        initialData?.settings?.installationRates || defaultInstallationRates
    );

    // Sync installation rates with DB when loaded, but preserve initialData overrides
    useEffect(() => {
        if (dbInstallationRates.length > 0) {
            setInstallationRates((prev: Record<string, { rate: number; unit: 'm²' | 'mb' | 'szt.' }>) => {

                // If this is a new offer (no initialData) or strict update mode:
                // We want DB rates to serve as the base for any keys not explicitly set by the user?
                // Actually, simplest logic:
                // 1. Start with hardcoded defaults.
                // 2. Merge DB rates (overwriting defaults).
                const dbRatesMap: Record<string, { rate: number; unit: 'm²' | 'mb' | 'szt.' }> = {};
                dbInstallationRates.forEach(r => {
                    dbRatesMap[r.type] = {
                        rate: r.rate,
                        unit: (r.unit as 'm²' | 'mb' | 'szt.')
                    };
                });

                if (!initialData) {
                    // New Offer: Defaults < DB Rates < Session Edits
                    return {
                        ...defaultInstallationRates,
                        ...dbRatesMap,
                        ...prev
                    };
                } else {
                    // Existing Offer: Saved Rates < DB Rates (for missing keys only)
                    // Wait, if user wants catalog to be source of truth for NEW items, but keep SAVED items.
                    // If we merge prev at the end, saved items win.
                    return {
                        ...defaultInstallationRates,
                        ...dbRatesMap, // Fill new types from DB
                        ...prev // Keep already saved/edited rates for this specific offer
                    };
                }
            });
        }
    }, [dbInstallationRates, dbInstallationRatesLoading, initialData]);

    // Filtered constructions for THIS offer
    const offerId = initialData?.id || 'new';
    const constructions = allConstructions.filter(c => c.offerId === offerId);

    // Settings state (internal, for future use if needed, but we rely on transportSettings now)
    const [settings] = useState({
        workTime: {
            workTime: 0,
            workerCount: 0,
            hourlyRate: 0
        },
        discount: initialData?.settings?.discount || 0
    });

    // VAT, Margin and Discount State
    const [vatRate, setVatRate] = useState<VatRate>(initialData?.vatRate || 23);
    const [margin, setMargin] = useState<number>(initialData?.settings?.margin || 0);
    const [discountType, setDiscountType] = useState<DiscountType>(initialData?.discountType || 'none');
    const [discountValue, setDiscountValue] = useState<number>(initialData?.discountValue || 0);

    const [transportSettings, setTransportSettings] = useState({
        constructionTransport: (initialData?.settings as any)?.constructionTransport || {
            vehicleType: 'truck',
            roundTrips: 1,
            distance: 0,
            ratePerKm: 0
        },
        workerTransport: (initialData?.settings as any)?.workerTransport || {
            vehicleType: 'van',
            roundTrips: 1,
            distance: 0,
            ratePerKm: 0
        },
        workTime: initialData?.settings?.workTime || {
            workTime: 0,
            workerCount: 0,
            hourlyRate: 0
        }
    });

    const [printLayout, setPrintLayout] = useState<'standard' | 'simple'>(
        initialData?.printLayout || 'standard'
    );

    // Template fields state
    const [title, setTitle] = useState(initialData?.title || 'Oferta');
    const sanitizeStrings = (arr?: any[]): string[] => (arr || []).filter((x): x is string => typeof x === 'string');
    const [scopeOfWork, setScopeOfWork] = useState<string[]>(sanitizeStrings(initialData?.scopeOfWork));
    const defaultNotes = [
        "Uwzględniona wartość montażu może ulec zmianie w drodze ewentualnych, przyszłych ustaleń.",
        "Oferta stanowi integralną całość a jej elementy nie mogą być sprzedawane/realizowane osobno.",
        "Prosimy o potwierdzenie, że powyższa oferta jest zgodna z zapytaniem i odeślij podpisany dokument.",
        "Warunki płatności: 50% zadatku płatne jest przed rozpoczęciem realizacji zamówienia, pozostała kwota płatna jest przed odbiorem.",
        "Realizacja zamówienia jest ustalana po ostatniej zaakceptowanej zmianie oferty i/lub wpłacie zadatku.",
        "Wszelkie spory, które wynikną w związku z realizacją niniejszej umowy, będą rozstrzygane w pierwszej kolejności w drodze negocjacji. W przypadku braku porozumienia, Sprzedający i Kupujący zgodnie oświadczają, że sądem właściwym do rozstrzygania sporów jest Sąd Polski właściwy dla siedziby Sprzedającego.",
        "W przypadku pytań do oferty należy odpowiedzieć autorowi, podając numer oferty."
    ];
    const [notes, setNotes] = useState<string[]>(
        initialData?.notes && sanitizeStrings(initialData.notes).length > 0
            ? sanitizeStrings(initialData.notes)
            : defaultNotes
    );
    const [customMaterials, setCustomMaterials] = useState<{ providedByUs: string[]; providedByClient: string[] }>({
        providedByUs: sanitizeStrings(initialData?.customMaterials?.providedByUs),
        providedByClient: sanitizeStrings(initialData?.customMaterials?.providedByClient)
    });

    // Filter templates from context
    const templates = allOffers.filter(o => o.offerTemplateType === 'detailed');
    // Sync default company settings to form states (for new offers or unset fields)
    useEffect(() => {
        if (!companySettings) return;

        // Populate default VAT Rate
        if (initialData === undefined || initialData?.vatRate === undefined) {
            if (companySettings.defaultVatRate) {
                setVatRate(companySettings.defaultVatRate as VatRate);
            }
        }

        // Populate default Margin (Narzut)
        if (initialData === undefined || initialData?.settings?.margin === undefined || initialData?.settings?.margin === 0) {
            if (companySettings.defaultMarginPercent !== undefined) {
                setMargin(companySettings.defaultMarginPercent);
            }
        }

        // Populate default hourly rate
        if (initialData === undefined || initialData?.settings?.workTime?.hourlyRate === undefined || initialData?.settings?.workTime?.hourlyRate === 0) {
            if (companySettings.defaultHourlyRate) {
                setTransportSettings(prev => {
                    if (prev.workTime.hourlyRate === companySettings.defaultHourlyRate) return prev;
                    return {
                        ...prev,
                        workTime: {
                            ...prev.workTime,
                            hourlyRate: companySettings.defaultHourlyRate as number
                        }
                    };
                });
            }
        }
    }, [companySettings, initialData]);
    // Auto-resolve transport vehicle types when logisticsRates are loaded
    useEffect(() => {
        if (!logisticsRates || logisticsRates.length === 0) return;

        setTransportSettings(prev => {
            let updated = false;
            const next = { ...prev };

            // 1. Resolve constructionTransport
            const constType = next.constructionTransport.vehicleType;
            const hasConst = logisticsRates.find(r => r.id === constType);
            if (!hasConst) {
                // Find a matching delivery rate
                let match = logisticsRates.find(r => 
                    r.vehicleType.toLowerCase().includes('dostawcz') || 
                    r.vehicleType.toLowerCase().includes('ciężar') || 
                    r.vehicleType.toLowerCase().includes('truck') || 
                    r.vehicleType.toLowerCase().includes('bus')
                );
                if (!match) match = logisticsRates[1] || logisticsRates[0];
                if (match) {
                    next.constructionTransport = {
                        ...next.constructionTransport,
                        vehicleType: match.id,
                        ratePerKm: match.ratePerKm
                    };
                    updated = true;
                }
            } else {
                // Update the rate if it changed in DB
                if (next.constructionTransport.ratePerKm !== hasConst.ratePerKm) {
                    next.constructionTransport = {
                        ...next.constructionTransport,
                        ratePerKm: hasConst.ratePerKm
                    };
                    updated = true;
                }
            }

            // 2. Resolve workerTransport
            const workerType = next.workerTransport.vehicleType;
            const hasWorker = logisticsRates.find(r => r.id === workerType);
            if (!hasWorker) {
                // Find a matching passenger/worker rate
                let match = logisticsRates.find(r => 
                    r.vehicleType.toLowerCase().includes('osobow') || 
                    r.vehicleType.toLowerCase().includes('worker') || 
                    r.vehicleType.toLowerCase().includes('van') || 
                    r.vehicleType.toLowerCase().includes('bus')
                );
                if (!match) match = logisticsRates[0];
                if (match) {
                    next.workerTransport = {
                        ...next.workerTransport,
                        vehicleType: match.id,
                        ratePerKm: match.ratePerKm
                    };
                    updated = true;
                }
            } else {
                // Update the rate if it changed in DB
                if (next.workerTransport.ratePerKm !== hasWorker.ratePerKm) {
                    next.workerTransport = {
                        ...next.workerTransport,
                        ratePerKm: hasWorker.ratePerKm
                    };
                    updated = true;
                }
            }

            return updated ? next : prev;
        });
    }, [logisticsRates]);

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const applyTemplate = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setTitle(template.title || title);
            setScopeOfWork(template.scopeOfWork ? [...template.scopeOfWork] : []);
            setNotes(template.notes ? [...template.notes] : []);
            setCustomMaterials(template.customMaterials ? {
                providedByUs: [...(template.customMaterials.providedByUs || [])],
                providedByClient: [...(template.customMaterials.providedByClient || [])]
            } : { providedByUs: [], providedByClient: [] });
        }
    };

    // Shield #2: Draft Recovery — check localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft: DraftPayload = JSON.parse(raw);
            if (draft.offerId !== offerId) return;
            const ageMs = Date.now() - new Date(draft.savedAt).getTime();
            if (ageMs > 24 * 60 * 60 * 1000) { localStorage.removeItem(DRAFT_KEY); return; }
            // Show as persistent banner (not toast) — toast action fires on unmounted component
            setPendingDraft(draft);
        } catch (e) {
            console.warn('[Draft] Could not parse draft:', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRestoreDraft = () => {
        if (!pendingDraft) return;
        try {
            const safe = (arr: any): string[] =>
                Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : [];

            if (pendingDraft.headerDetails) setHeaderDetails(pendingDraft.headerDetails);
            if (pendingDraft.vatRate !== undefined) setVatRate(pendingDraft.vatRate);
            if (pendingDraft.margin !== undefined) setMargin(pendingDraft.margin);
            if (pendingDraft.discountType) setDiscountType(pendingDraft.discountType);
            if (pendingDraft.discountValue !== undefined) setDiscountValue(pendingDraft.discountValue);
            if (pendingDraft.transportSettings) setTransportSettings(pendingDraft.transportSettings);
            if (pendingDraft.title) setTitle(pendingDraft.title);
            setScopeOfWork(safe(pendingDraft.scopeOfWork));
            setNotes(safe(pendingDraft.notes));
            setCustomMaterials({
                providedByUs: safe(pendingDraft.customMaterials?.providedByUs),
                providedByClient: safe(pendingDraft.customMaterials?.providedByClient)
            });
            if (Array.isArray(pendingDraft.rentalItems)) setRentalItems(pendingDraft.rentalItems);
            if (pendingDraft.printLayout) setPrintLayout(pendingDraft.printLayout);
            if (pendingDraft.printMode) setPrintMode(pendingDraft.printMode);
            draftRestoredRef.current = true;
            localStorage.removeItem(DRAFT_KEY);
            setPendingDraft(null);
            toast.success('Wersja robocza przywrócona pomyślnie.');
        } catch (restoreErr) {
            console.error('[Draft] Restore failed:', restoreErr);
            toast.error('Nie udało się przywrócić wersji roboczej.');
        }
    };

    const handleDiscardDraft = () => {
        localStorage.removeItem(DRAFT_KEY);
        setPendingDraft(null);
    };

    // Shield #2: Autosave — persist form state to localStorage every 45s
    const saveDraftToStorage = useCallback(() => {
        try {
            const draft: DraftPayload = {
                offerId,
                headerDetails,
                vatRate,
                margin,
                discountType,
                discountValue,
                transportSettings,
                title,
                scopeOfWork,
                notes,
                customMaterials,
                rentalItems,
                printLayout,
                printMode,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (e) {
            console.warn('[Draft] Could not save draft:', e);
        }
    }, [offerId, headerDetails, vatRate, margin, discountType, discountValue, transportSettings, title, scopeOfWork, notes, customMaterials, rentalItems, printLayout, printMode]);

    useEffect(() => {
        const timer = setInterval(saveDraftToStorage, 45000); // every 45s
        return () => clearInterval(timer);
    }, [saveDraftToStorage]);

    useEffect(() => {
        const init = async () => {
            try {
                await loadConstructions();
            } catch (error) {
                console.error('Error loading constructions:', error);
                setError('Failed to load constructions');
            }
        };
        init();
    }, [loadConstructions]);


    // Get unique construction types from current constructions
    const usedConstructionTypes = Array.from(new Set(constructions.map(c => c.type)));

    // Filter installation rates to only show used types
    const usedRates = usedConstructionTypes.map(type => ({
        type,
        rate: installationRates[type]?.rate || 0,
        unit: installationRates[type]?.unit || 'm²'
    }));

    const recalculateInstallationCosts = (type: string, newRate: number, newUnit: 'm²' | 'mb' | 'szt.') => {
        return constructions.map(construction => {
            if (construction.type === type) {
                // Calculate new installation cost based on unit type
                let quantity = 1;
                switch (newUnit) {
                    case 'm²':
                        quantity = construction.totalArea;
                        break;
                    case 'mb':
                        quantity = construction.totalPerimeter;
                        break;
                    case 'szt.':
                        quantity = construction.quantity;
                        break;
                }

                const newInstallationCost = newRate * quantity;

                return {
                    ...construction,
                    installationCosts: {
                        rate: newRate,
                        total: newInstallationCost
                    },
                    totalCost: construction.materialCosts.total + newInstallationCost
                };
            }
            return construction;
        });
    };

    const handleRateChange = async (type: string, rate: number) => {
        const currentUnit = installationRates[type]?.unit || 'm²';

        // Update rates
        setInstallationRates(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                rate
            }
        }));

        // Recalculate costs for affected constructions
        const updatedConstructions = recalculateInstallationCosts(type, rate, currentUnit);

        // Save each updated construction
        for (const construction of updatedConstructions) {
            if (construction.type === type) {
                await saveConstruction(construction);
            }
        }

        await loadConstructions();
    };

    const handleConstructionStandardChange = async (constructionId: string, standardId: string) => {
        const construction = constructions.find(c => c.id === constructionId);
        if (!construction) return;

        let newMaterialBreakdown = [...(construction.materialBreakdown || [])];
        let materialsCost = construction.materialCosts.total;
        
        if (standardId) {
            const standard = standards.find(s => s.id === standardId);
            if (standard) {
                const allMaterialsMap = await materialsStorage.getMaterialMapById();
                const baseConstruction = {
                    id: construction.id,
                    width: construction.width,
                    height: construction.height,
                    quantity: construction.quantity
                };
                const { lines } = applyInstallationStandardToConstruction(baseConstruction, standard, allMaterialsMap);
                
                // Keep manual items
                const manualLines = (construction.materialBreakdown || []).filter(l => l.source === 'manual');
                newMaterialBreakdown = [...lines, ...manualLines];
                materialsCost = newMaterialBreakdown.reduce((sum, l) => sum + l.totalCost, 0);
            }
        } else {
            // Keep only manual items
            newMaterialBreakdown = (construction.materialBreakdown || []).filter(l => l.source === 'manual');
            materialsCost = newMaterialBreakdown.reduce((sum, l) => sum + l.totalCost, 0);
        }

        let laborCost = construction.installationCosts?.total;
        if (laborCost === undefined) {
            const rate = installationRates[construction.type]?.rate || 0;
            const unit = installationRates[construction.type]?.unit || 'm²';
            let quantity = 1;
            switch (unit) {
                case 'm²':
                    quantity = construction.totalArea;
                    break;
                case 'mb':
                    quantity = construction.totalPerimeter;
                    break;
                case 'szt.':
                    quantity = construction.quantity;
                    break;
            }
            laborCost = rate * quantity;
        }

        const updatedConstruction: Construction = {
            ...construction,
            installationStandardId: standardId,
            materialBreakdown: newMaterialBreakdown,
            materialCosts: {
                total: materialsCost,
                items: []
            },
            totalCost: materialsCost + laborCost
        };

        await saveConstruction(updatedConstruction);
        await loadConstructions();
        toast.success(`Zaktualizowano standard montażu dla pozycji: ${construction.name}`);
    };

    const handleUnitChange = async (type: string, unit: 'm²' | 'mb' | 'szt.') => {
        const currentRate = installationRates[type]?.rate || 0;

        // Update rates
        setInstallationRates(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                unit
            }
        }));

        // Recalculate costs for affected constructions
        const updatedConstructions = recalculateInstallationCosts(type, currentRate, unit);

        // Save each updated construction
        for (const construction of updatedConstructions) {
            if (construction.type === type) {
                await saveConstruction(construction);
            }
        }

    };

    const handleRecalculateFromDbRates = async () => {
        if (dbInstallationRates.length === 0) {
            toast.error('Brak stawek w bazie cenowej lub nie zostały jeszcze załadowane.');
            return;
        }

        try {
            setError(null);
            
            // 1. Recalculate margins/hourly rates from company settings
            if (companySettings) {
                if (companySettings.defaultMarginPercent !== undefined) {
                    setMargin(companySettings.defaultMarginPercent);
                }
                if (companySettings.defaultHourlyRate) {
                    setTransportSettings(prev => ({
                        ...prev,
                        workTime: {
                            ...prev.workTime,
                            hourlyRate: companySettings.defaultHourlyRate as number
                        }
                    }));
                }
            }

            // 2. Recalculate transport rates from logistics rates
            if (logisticsRates && logisticsRates.length > 0) {
                setTransportSettings(prev => {
                    const next = { ...prev };
                    
                    const constRate = logisticsRates.find(r => r.id === next.constructionTransport.vehicleType);
                    if (constRate) {
                        next.constructionTransport.ratePerKm = constRate.ratePerKm;
                    }
                    
                    const workerRate = logisticsRates.find(r => r.id === next.workerTransport.vehicleType);
                    if (workerRate) {
                        next.workerTransport.ratePerKm = workerRate.ratePerKm;
                    }
                    
                    return next;
                });
            }

            // 3. Build map of database rates
            const dbRatesMap: Record<string, { rate: number; unit: 'm²' | 'mb' | 'szt.' }> = {};
            dbInstallationRates.forEach(r => {
                dbRatesMap[r.type] = {
                    rate: r.rate,
                    unit: (r.unit as 'm²' | 'mb' | 'szt.')
                };
            });

            // 4. Update local state
            setInstallationRates(prev => ({
                ...prev,
                ...dbRatesMap
            }));

            // 5. Recalculate each construction
            const updatedConstructions = constructions.map(construction => {
                const rateInfo = dbRatesMap[construction.type] || installationRates[construction.type];
                if (rateInfo) {
                    let quantity = 1;
                    switch (rateInfo.unit) {
                        case 'm²':
                            quantity = construction.totalArea;
                            break;
                        case 'mb':
                            quantity = construction.totalPerimeter;
                            break;
                        case 'szt.':
                            quantity = construction.quantity;
                            break;
                    }
                    const newCost = rateInfo.rate * quantity;
                    return {
                        ...construction,
                        installationCosts: {
                            rate: rateInfo.rate,
                            total: newCost
                        },
                        totalCost: construction.materialCosts.total + newCost
                    };
                }
                return construction;
            });

            // 6. Save to DB
            for (const construction of updatedConstructions) {
                await saveConstruction(construction);
            }

            await loadConstructions();
            toast.success('Oferta została przeliczona na podstawie stawek z bazy cenowej.');
        } catch (err) {
            console.error('Błąd przeliczania oferty:', err);
            setError('Nie udało się przeliczyć oferty na podstawie bazy cenowej.');
        }
    };

    const handleConstructionSaved = async (construction: Construction) => {
        try {
            setError(null);

            // Ensure offerId matches
            const constructionToSave = { ...construction, offerId };

            const rate = installationRates[constructionToSave.type]?.rate || 0;
            const unit = installationRates[constructionToSave.type]?.unit || 'm²';

            // Calculate installation cost based on unit type
            let quantity = 1;
            switch (unit) {
                case 'm²':
                    quantity = constructionToSave.totalArea;
                    break;
                case 'mb':
                    quantity = constructionToSave.totalPerimeter;
                    break;
                case 'szt.':
                    quantity = constructionToSave.quantity;
                    break;
            }

            const installationCost = rate * quantity;

            // Update construction with calculated installation cost
            const constructionWithCosts = {
                ...constructionToSave,
                installationCosts: {
                    rate,
                    total: installationCost
                },
                totalCost: constructionToSave.materialCosts.total + installationCost
            };

            await saveConstruction(constructionWithCosts);
            await loadConstructions(); // Refresh hook state
            setIsConstructionModalOpen(false);
        } catch (error) {
            console.error('Error saving construction:', error);
            setError('Failed to save construction');
        }
    };

    const handleEditConstruction = (construction: Construction) => {
        setConstructionBeingEdited(construction);
        setIsConstructionModalOpen(true);
    };

    const handleAddConstruction = () => {
        setConstructionBeingEdited(null);
        setIsConstructionModalOpen(true);
    };

    const handleDeleteConstruction = async (id: string) => {
        if (!confirm('Czy na pewno chcesz usunąć tę konstrukcję?')) return;
        try {
            setError(null);
            await deleteConstruction(id);
            await loadConstructions();
        } catch (error) {
            console.error('Error deleting construction:', error);
            setError('Failed to delete construction');
        }
    };

    const handleDuplicateConstruction = async (construction: Construction) => {
        try {
            setError(null);
            const newConstruction: Construction = {
                ...construction,
                id: uuidv4(),
                offerId: construction.offerId,
                name: `${construction.name} (kopia)`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await saveConstruction(newConstruction);
            await loadConstructions();
        } catch (error) {
            console.error('Error duplicating construction:', error);
            setError('Failed to duplicate construction');
        }
    };

    // Import Modal State
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const handleImportConstructions = async (newConstructions: Construction[]) => {
        try {
            setError(null);
            // Save all imported constructions
            for (const c of newConstructions) {
                // Ensure offerId matches the current one (even if new)
                // Note: logic in handleDuplicate used construction.offerId. 
                // Here newConstructions are created in the modal with the passed offerId.
                const cWithId = { ...c, offerId };
                await saveConstruction(cWithId);
            }
            await loadConstructions();
            setIsImportModalOpen(false);
        } catch (error) {
            console.error('Error importing constructions:', error);
            setError('Failed to import constructions');
        }
    };

    // Current totals for display (derived from summary)
    const currentMaterialsCost = constructions.reduce((sum, c) => sum + c.materialCosts.total, 0);
    const currentInstallationCost = constructions.reduce((sum, c) => sum + c.installationCosts.total, 0);
    const equipmentRentalCost = rentalItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalAreaConstructions = constructions.reduce((sum, c) => sum + (c.totalArea || 0), 0);
    const totalPerimeterConstructions = constructions.reduce((sum, c) => sum + (c.totalPerimeter || 0), 0);

    // Calculate dynamic costs for Summary and Print
    const calculatedTransportCosts = {
        constructionTransport: transportSettings.constructionTransport.distance *
            transportSettings.constructionTransport.ratePerKm *
            transportSettings.constructionTransport.roundTrips,
        workerTransport: transportSettings.workerTransport.distance *
            transportSettings.workerTransport.ratePerKm *
            transportSettings.workerTransport.roundTrips
    };

    const calculatedWorkTimeCost = transportSettings.workTime.workTime *
        transportSettings.workTime.workerCount *
        transportSettings.workTime.hourlyRate;

    const otherCostsNet = calculatedTransportCosts.constructionTransport +
        calculatedTransportCosts.workerTransport +
        calculatedWorkTimeCost +
        equipmentRentalCost;

    // Use new calculator
    const summary = calculateOfferSummary(
        constructions,
        vatRate,
        discountType,
        discountValue,
        otherCostsNet,
        margin
    );

    const totalCosts = currentMaterialsCost + currentInstallationCost + otherCostsNet;
    const profitAmount = summary.totalNet - totalCosts;
    const actualMarginPercent = summary.totalNet > 0 ? (profitAmount / summary.totalNet) * 100 : 0;
    const isLowMargin = actualMarginPercent < 15;

    const handleSubmit = async (closeOnSave: boolean = false) => {
        // Prevent accidental double submit if loading (Shield #4)
        if (isLoading) return;

        setIsLoading(true);
        setError(null);

        try {
            if (!isTemplateMode && constructions.length === 0) {
                throw new Error('Dodaj przynajmniej jedną konstrukcję przed zapisaniem oferty');
            }



            await onSubmit({
                // Base Cost Fields
                materialsCost: currentMaterialsCost,
                laborCost: currentInstallationCost + calculatedWorkTimeCost + calculatedTransportCosts.constructionTransport + calculatedTransportCosts.workerTransport,

                // Rental Equipment
                rentalItems,
                equipmentRentalCost,

                // Detailed Cost Breakdown (Explicitly saved for Job Conversion)
                constructionTransportCost: calculatedTransportCosts.constructionTransport,
                workerTransportCost: calculatedTransportCosts.workerTransport,
                workTimeCost: calculatedWorkTimeCost,

                // New VAT/Discount Fields
                vatRate,
                discountType,
                discountValue,
                subtotalNet: summary.subtotalNet,
                discountAmount: summary.discountAmount,
                totalNet: summary.totalNet,
                vatAmount: summary.vatAmount,
                totalGross: summary.totalGross,
                totalCost: summary.totalNet, // keep compat

                settings: {
                    ...settings, // internal legacy
                    ...transportSettings, // spread transport settings
                    installationRates,
                    margin, // Use state
                    discount: 0 // Deprecated in UI but keep structure
                },
                printLayout,
                printMode,
                title,
                scopeOfWork,
                notes,
                customMaterials,
                ...headerDetails // Include editable header fields
            }, constructions);

            // Shield #2: Clear draft after successful save
            localStorage.removeItem(DRAFT_KEY);

            if (closeOnSave) {
                if (onClose) {
                    onClose(); // Use dedicated close handler if available
                } else {
                    onCancel(); // Fallback
                }
            }

        } catch (error) {
            console.error('Błąd podczas zapisywania oferty:', error);
            setError(error instanceof Error ? error.message : 'Wystąpił błąd podczas zapisywania oferty');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            {/* Screen View */}
            <div className="space-y-6 print:hidden" onBlur={saveDraftToStorage}>
                {(error || storageLoading) && (
                    <div className={`${storageLoading ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'} border border-current px-4 py-3 rounded relative animate-pulse`}>
                        {storageLoading ? 'Ładowanie danych...' : error}
                    </div>
                )}

                {/* Draft recovery banner */}
                {pendingDraft && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg text-sm">
                        <span>
                            🗂️ <strong>Znaleziono niezapisaną wersję roboczą</strong>
                            {' '}— autosave: {new Date(pendingDraft.savedAt).toLocaleTimeString('pl-PL')}
                        </span>
                        <div className="flex gap-2 ml-4 flex-shrink-0">
                            <button
                                type="button"
                                onClick={handleRestoreDraft}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-semibold text-xs transition-colors"
                            >
                                Przywróć
                            </button>
                            <button
                                type="button"
                                onClick={handleDiscardDraft}
                                className="px-3 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 rounded text-xs transition-colors"
                            >
                                Odrzuć
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                {(initialData || headerData) && (
                    <OfferDetailsHeader
                        offer={{
                            ...offerStorage.createEmptyOffer(),
                            ...(initialData || {} as Offer),
                            title,
                            ...headerDetails
                        }}
                        onStatusChange={(status) => {
                            handleHeaderUpdate('status', status);
                            onStatusChange(status);
                        }}
                        isTemplateMode={isTemplateMode}
                        isEditable={true}
                        onUpdate={handleHeaderUpdate}
                        clients={clients}
                    />
                )}

                {/* Constructions Section */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                    <button
                        onClick={() => toggleSection('constructions')}
                        className="w-full p-6 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex items-center space-x-3">
                            <Package className="h-6 w-6 text-[#21808D]" />
                            <h2 className="text-xl font-semibold text-[#21808D]">Konstrukcje</h2>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500 mr-2">{constructions.length} poz.</span>
                            {expandedSections.constructions ? (
                                <ChevronDown className="h-5 w-5 text-gray-400" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-gray-400" />
                            )}
                        </div>
                    </button>

                    <div className={`transition-all duration-300 ease-in-out ${expandedSections.constructions ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                        <div className="p-6 border-t border-gray-100">
                            <div className="flex justify-end mb-6 space-x-3">
                                <button
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline flex items-center"
                                >
                                    Importuj z Excela (CSV)
                                </button>
                                <button
                                    onClick={handleAddConstruction}
                                    className="btn-primary flex items-center space-x-2 py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all"
                                >
                                    <Plus className="h-4 w-4" />
                                    <span>Dodaj konstrukcję</span>
                                </button>
                            </div>

                            {constructions.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nr</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwa</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Typ</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Standard montażu</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wymiary</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Materiały</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montaż</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {constructions.map((construction) => (
                                                <tr key={construction.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{construction.number}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{construction.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{construction.type}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        <select
                                                            value={construction.installationStandardId || ''}
                                                            onChange={(e) => handleConstructionStandardChange(construction.id, e.target.value)}
                                                            className={`text-xs font-medium rounded-full border py-1 px-3.5 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none relative ${
                                                                construction.installationStandardId
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                                            }`}
                                                            style={{
                                                                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${
                                                                    construction.installationStandardId ? '%231d4ed8' : '%236b7280'
                                                                }'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'/></svg>")`,
                                                                backgroundPosition: 'right 0.5rem center',
                                                                backgroundSize: '0.75rem',
                                                                backgroundRepeat: 'no-repeat'
                                                            }}
                                                        >
                                                            <option value="" className="bg-white text-gray-700">Ręczny (brak)</option>
                                                            {standards.map(std => (
                                                                <option key={std.id} value={std.id} className="bg-white text-gray-700">{std.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{construction.width * 1000} x {construction.height * 1000} mm</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{construction.materialCosts.total.toFixed(2)} PLN</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{construction.installationCosts.total.toFixed(2)} PLN</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right space-x-2">
                                                        <button
                                                            onClick={() => handleDuplicateConstruction(construction)}
                                                            className="text-gray-600 hover:text-blue-600"
                                                            title="Duplikuj"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditConstruction(construction)}
                                                            className="text-blue-600 hover:text-blue-900"
                                                            title="Edytuj"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteConstruction(construction.id)}
                                                            className="text-red-600 hover:text-red-900"
                                                            title="Usuń"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-gray-50 rounded-lg">
                                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">Brak konstrukcji</h3>
                                    <p className="mt-1 text-sm text-gray-500">Dodaj pierwszą konstrukcję do oferty.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Installation Rates - keep logic */}
                {usedRates.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                        <button
                            onClick={() => toggleSection('installationRates')}
                            className="w-full p-6 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Edit2 className="h-6 w-6 text-[#21808D]" />
                                <h2 className="text-xl font-semibold text-[#21808D]">Stawki montażowe</h2>
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500 mr-2">{usedRates.length} typy</span>
                                {expandedSections.installationRates ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                ) : (
                                    <ChevronRight className="h-5 w-5 text-gray-400" />
                                )}
                            </div>
                        </button>
                        <div className={`transition-all duration-300 ease-in-out ${expandedSections.installationRates ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                            <div className="p-6 border-t border-gray-100 space-y-4">
                                <div className="flex justify-between items-center bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                                    <div className="pr-4">
                                        <p className="text-xs text-zinc-500 font-medium">
                                            Stawki w ofercie mogą różnić się od globalnych stawek w katalogu. Możesz je zsynchronizować i przeliczyć ofertę.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRecalculateFromDbRates}
                                        className="btn-secondary text-xs flex items-center space-x-2 py-1.5 px-3 border border-zinc-200 shadow-sm bg-white hover:bg-zinc-50 transition-all font-medium rounded-lg whitespace-nowrap"
                                    >
                                        <span>Zsynchronizuj i przelicz</span>
                                    </button>
                                </div>
                                <InstallationRatesEditor rates={usedRates} onRateChange={handleRateChange} onUnitChange={handleUnitChange} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Transport Section */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                    <button
                        onClick={() => toggleSection('transport')}
                        className="w-full p-6 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex items-center space-x-3">
                            <Truck className="h-6 w-6 text-[#21808D]" />
                            <h2 className="text-xl font-semibold text-[#21808D]">Opłaty transportowe</h2>
                        </div>
                        <div className="flex items-center space-x-2">
                            {expandedSections.transport ? (
                                <ChevronDown className="h-5 w-5 text-gray-400" />
                            ) : (
                                <ChevronRight className="h-5 w-5 text-gray-400" />
                            )}
                        </div>
                    </button>
                    <div className={`transition-all duration-300 ease-in-out ${expandedSections.transport ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                        <div className="p-6 border-t border-gray-100">
                            <TransportSettings
                                settings={transportSettings}
                                onSettingsChange={setTransportSettings}
                                logisticsRates={logisticsRates}
                                companyAddress={companySettings?.address}
                                installationLocation={headerDetails.location}
                            />
                        </div>
                    </div>
                </div>

                {/* Rental Equipment Section */}
                <RentalEquipmentSection
                    items={rentalItems}
                    onChange={setRentalItems}
                />

                {/* Template / Content Section */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                    <button onClick={() => toggleSection('template')} className="w-full p-6 flex items-center justify-between hover:bg-gray-50">
                        <h2 className="text-xl font-semibold text-[#21808D]">Szablon i treść oferty</h2>
                        {expandedSections.template ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </button>
                    {expandedSections.template && (
                        <div className="p-6 border-t border-gray-200">
                            {templates.length > 0 && (
                                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Załaduj szablon</label>
                                    <div className="flex gap-2">
                                        <select
                                            className="block w-full rounded-md border-gray-300 shadow-sm"
                                            onChange={(e) => applyTemplate(e.target.value)}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Wybierz szablon...</option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>{t.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <OfferTemplateEditor
                                title={title}
                                setTitle={setTitle}
                                scopeOfWork={scopeOfWork}
                                setScopeOfWork={setScopeOfWork}
                                notes={notes}
                                setNotes={setNotes}
                                customMaterials={customMaterials}
                                setCustomMaterials={setCustomMaterials}
                            />
                        </div>
                    )}
                </div>

                {/* Summary Section with VAT logic */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 mb-24 px-8 py-10">
                    <div className="flex items-center space-x-3 mb-8 border-b border-gray-100 pb-4">
                        <FileText className="h-7 w-7 text-[#21808D]" />
                        <h2 className="text-2xl font-bold text-[#21808D]">Podsumowanie oferty</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Summary Controls */}
                        <div className="space-y-8 bg-gray-50 p-8 rounded-2xl border border-gray-100">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-gray-700">Podatek VAT</label>
                                    <div className="flex space-x-2">
                                        {[8, 23].map((rate) => (
                                            <button
                                                key={rate}
                                                type="button"
                                                onClick={() => setVatRate(rate as VatRate)}
                                                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${vatRate === rate
                                                    ? 'bg-[#21808D] text-white shadow-lg scale-105'
                                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                                                    }`}
                                            >
                                                {rate}%
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-gray-700">Rabat [%]</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={discountValue}
                                        onChange={(e) => {
                                            const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                            setDiscountValue(val);
                                            setDiscountType(val > 0 ? 'percent' : 'none');
                                        }}
                                        className="w-full py-3 px-4 bg-white border border-gray-200 rounded-xl font-bold text-lg text-red-600 focus:ring-2 focus:ring-red-500 outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            {isLowMargin ? (
                                <div className="space-y-2 p-5 bg-rose-50 rounded-2xl border border-rose-200 transition-all duration-300 animate-in fade-in zoom-in-95 duration-200">
                                    <label className="block text-sm font-bold text-rose-700 uppercase tracking-wider mb-2 text-center">Narzut całkowity [%]</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={margin}
                                        onChange={(e) => setMargin(parseFloat(e.target.value) || 0)}
                                        className="w-full py-4 px-6 bg-white border-2 border-rose-400 rounded-xl font-black text-3xl text-rose-700 focus:ring-4 focus:ring-rose-100 outline-none transition-all shadow-inner text-center"
                                    />
                                    <p className="text-xs text-rose-600 mt-2 font-bold text-center">
                                        Niska rentowność! Realna marża netto: {actualMarginPercent.toFixed(1)}% (próg 15%)
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 p-5 bg-[#21808D]/5 rounded-2xl border border-[#21808D]/20 transition-all duration-300">
                                    <label className="block text-sm font-bold text-[#21808D] uppercase tracking-wider mb-2 text-center">Narzut całkowity [%]</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={margin}
                                        onChange={(e) => setMargin(parseFloat(e.target.value) || 0)}
                                        className="w-full py-4 px-6 bg-white border-2 border-[#21808D] rounded-xl font-black text-3xl text-[#21808D] focus:ring-4 focus:ring-[#21808D]/20 outline-none transition-all shadow-inner text-center"
                                    />
                                    <p className="text-xs text-[#21808D] mt-2 font-medium text-center">Marża doliczana do wszystkich kosztów netto</p>
                                </div>
                            )}
                        </div>

                        {/* Summary Totals */}
                        <div className="flex flex-col justify-between py-2">
                            <div className="flex justify-end mb-4">
                                <button
                                    type="button"
                                    onClick={handleRecalculateFromDbRates}
                                    className="btn-secondary text-xs font-semibold py-2 px-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-all flex items-center gap-1.5 shadow-sm"
                                >
                                    <span>Przelicz stawki według bazy cenowej</span>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-gray-650">
                                    <span className="text-lg">Materiały i konstrukcje:</span>
                                    <span className="font-semibold">{currentMaterialsCost.toFixed(2)} PLN</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-650">
                                    <span className="text-lg">Montaż i transport:</span>
                                    <span className="font-semibold">{(currentInstallationCost + otherCostsNet - (equipmentRentalCost || 0)).toFixed(2)} PLN</span>
                                </div>
                                {equipmentRentalCost > 0 && (
                                    <div className="flex justify-between items-center text-gray-650">
                                        <span className="text-lg">Sprzęt wynajmowany:</span>
                                        <span className="font-semibold">{equipmentRentalCost.toFixed(2)} PLN</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center text-xs text-gray-500 border-t border-dashed border-zinc-200 pt-2">
                                    <span>Łączna powierzchnia konstrukcji:</span>
                                    <span className="font-bold">{totalAreaConstructions.toFixed(2)} m²</span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500 border-b border-dashed border-zinc-200 pb-2">
                                    <span>Łączny obwód konstrukcji:</span>
                                    <span className="font-bold">{totalPerimeterConstructions.toFixed(2)} mb</span>
                                </div>

                                {/* Cost Structure Doughnut Chart */}
                                {(() => {
                                    const totalCosts = currentMaterialsCost + currentInstallationCost + otherCostsNet;
                                    if (totalCosts === 0) return null;

                                    const matPercent = (currentMaterialsCost / totalCosts) * 100;
                                    const labPercent = ((currentInstallationCost + otherCostsNet - equipmentRentalCost) / totalCosts) * 100;
                                    const eqPercent = (equipmentRentalCost / totalCosts) * 100;

                                    // Circumference = 2 * Math.PI * R. R=36, Circumference = 226.2
                                    const circ = 226.2;
                                    const matStroke = (matPercent / 100) * circ;
                                    const labStroke = (labPercent / 100) * circ;
                                    const eqStroke = (eqPercent / 100) * circ;

                                    const matOffset = 0;
                                    const labOffset = -matStroke;
                                    const eqOffset = -(matStroke + labStroke);

                                    return (
                                        <div className="py-4 border-t border-b border-zinc-100 my-4 flex items-center justify-between gap-6">
                                            <div className="flex-1 space-y-3">
                                                <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Struktura Kosztów Netto</p>
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="flex items-center gap-1.5 text-zinc-600 font-medium">
                                                            <span className="w-2.5 h-2.5 rounded-md bg-[#2563EB]"></span>
                                                            Materiały
                                                        </span>
                                                        <span className="font-bold text-zinc-900">{matPercent.toFixed(0)}%</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="flex items-center gap-1.5 text-zinc-600 font-medium">
                                                            <span className="w-2.5 h-2.5 rounded-md bg-[#0D9488]"></span>
                                                            Montaż i logistyka
                                                        </span>
                                                        <span className="font-bold text-zinc-900">{labPercent.toFixed(0)}%</span>
                                                    </div>
                                                    {eqPercent > 0 && (
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="flex items-center gap-1.5 text-zinc-600 font-medium">
                                                                <span className="w-2.5 h-2.5 rounded-md bg-[#D97706]"></span>
                                                                Sprzęt i najem
                                                            </span>
                                                            <span className="font-bold text-zinc-900">{eqPercent.toFixed(0)}%</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                                    {/* Background Circle */}
                                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#F4F4F5" strokeWidth="12" />
                                                    
                                                    {/* Materials Segment */}
                                                    {matStroke > 0 && (
                                                        <circle
                                                            cx="50"
                                                            cy="50"
                                                            r="36"
                                                            fill="transparent"
                                                            stroke="#2563EB"
                                                            strokeWidth="12"
                                                            strokeDasharray={`${matStroke} ${circ}`}
                                                            strokeDashoffset={matOffset}
                                                            className="transition-all duration-700 ease-out"
                                                        />
                                                    )}
                                                    
                                                    {/* Labor Segment */}
                                                    {labStroke > 0 && (
                                                        <circle
                                                            cx="50"
                                                            cy="50"
                                                            r="36"
                                                            fill="transparent"
                                                            stroke="#0D9488"
                                                            strokeWidth="12"
                                                            strokeDasharray={`${labStroke} ${circ}`}
                                                            strokeDashoffset={labOffset}
                                                            className="transition-all duration-700 ease-out"
                                                        />
                                                    )}
                                                    
                                                    {/* Equipment Segment */}
                                                    {eqStroke > 0 && (
                                                        <circle
                                                            cx="50"
                                                            cy="50"
                                                            r="36"
                                                            fill="transparent"
                                                            stroke="#D97706"
                                                            strokeWidth="12"
                                                            strokeDasharray={`${eqStroke} ${circ}`}
                                                            strokeDashoffset={eqOffset}
                                                            className="transition-all duration-700 ease-out"
                                                        />
                                                    )}
                                                </svg>
                                                <div className="absolute text-center">
                                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Koszty</p>
                                                    <p className="text-xs font-black text-zinc-950 mt-0.5">
                                                        {Math.round(totalCosts).toLocaleString('pl-PL')}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-zinc-400">PLN</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div className=" bg-gray-100/50 p-5 rounded-2xl border-2 border-dashed border-gray-200 mt-4">
                                    <div className="flex justify-between items-center font-bold text-xl text-gray-900">
                                        <span>Wartość Netto (suma):</span>
                                        <span>{summary.totalNet.toFixed(2)} PLN</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-medium text-gray-500 mt-2">
                                        <span>Podatek VAT ({vatRate}%):</span>
                                        <span>{summary.vatAmount.toFixed(2)} PLN</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-gray-100">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold text-gray-900 uppercase tracking-tight">RAZEM DO ZAPŁATY:</span>
                                    <div className="text-right">
                                        <div className={`text-3xl font-black tracking-tight leading-none mb-1 transition-colors duration-300 ${isLowMargin ? 'text-rose-600' : 'text-[#21808D]'}`}>
                                            {summary.totalGross.toFixed(2)} <span className="text-base font-bold ml-1">PLN</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Wartość Brutto</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Footer Actions */}
                <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 p-4 z-50 flex justify-between items-center shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
                    <div className="flex items-center space-x-6">
                        <div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                            <span className="text-[10px] font-black text-gray-400 uppercase px-2 tracking-widest">Widok wydruku</span>
                            <select
                                value={printLayout + '-' + printMode}
                                onChange={(e) => {
                                    const [layout, mode] = e.target.value.split('-') as [any, any];
                                    setPrintLayout(layout);
                                    setPrintMode(mode);
                                }}
                                className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer py-1 px-2 pr-8"
                            >
                                <option value="standard-detailed">Szczegółowy (Pełna specyfikacja)</option>
                                <option value="standard-summary">Podsumowanie (Układ standardowy)</option>
                                <option value="simple-summary">Uproszczony (Zestawienie grup)</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="flex items-center space-x-2 bg-white border-2 border-[#21808D] text-[#21808D] hover:bg-[#21808D] hover:text-white px-5 py-2.5 rounded-xl font-black transition-all shadow-sm hover:shadow-md active:scale-95 text-sm"
                        >
                            <Printer className="h-4 w-4" />
                            <span>DRUKUJ OFERTĘ</span>
                        </button>
                    </div>

                    <div className="flex items-center space-x-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-6 py-2.5 text-sm font-black text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider"
                        >
                            Anuluj
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSubmit(false)}
                            disabled={isLoading}
                            className="flex items-center space-x-2 bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-6 py-2.5 rounded-xl font-black transition-all shadow-sm active:scale-95 text-sm disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" />
                            <span>ZAPISZ ZMIANY</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSubmit(true)}
                            disabled={isLoading}
                            className="flex items-center space-x-2 bg-blue-600 text-white hover:bg-blue-700 px-8 py-2.5 rounded-xl font-black transition-all shadow-xl hover:shadow-blue-500/20 active:scale-95 text-sm disabled:opacity-50"
                        >
                            <Save className="h-4 w-4" />
                            <span>ZAPISZ I ZAMKNIJ</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Print View Component */}
            <OfferPrintView
                offer={{
                    ...initialData,
                    number: headerDetails.number,
                    createdAt: initialData?.createdAt || new Date().toISOString(),
                    clientId: headerDetails.clientId,
                    location: headerDetails.location,
                    status: headerDetails.status,
                    vatRate,
                    discountType,
                    discountValue,
                    subtotalNet: summary.subtotalNet,
                    discountAmount: summary.discountAmount,
                    totalNet: summary.totalNet,
                    vatAmount: summary.vatAmount,
                    totalGross: summary.totalGross,
                    totalCost: summary.totalNet,
                    settings: {
                        ...initialData?.settings,
                        constructionTransport: transportSettings.constructionTransport,
                        workerTransport: transportSettings.workerTransport,
                        workTime: transportSettings.workTime,
                        installationRates,
                        margin,
                        discount: 0
                    },
                    printLayout,
                    title,
                    scopeOfWork,
                    notes,
                    customMaterials,
                    equipmentRentalCost,
                    rentalItems
                } as Offer}
                constructions={constructions}
                clients={clients}
                printMode={printMode}
            />

            {/* Modals */}
            <ConstructionModal
                isOpen={isConstructionModalOpen}
                onClose={() => setIsConstructionModalOpen(false)}
                onSave={handleConstructionSaved}
                initialData={constructionBeingEdited}
                offerId={offerId}
                nextNumber={constructions.length + 1}
            />

            <ImportConstructionModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSave={handleImportConstructions}
                offerId={offerId}
                nextNumber={constructions.length + 1}
            />
        </>
    );
}
