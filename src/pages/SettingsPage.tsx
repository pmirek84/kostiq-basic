import type { MigrationPreviewReport, MigrationExecutionReport } from '../services/data/migrationService';
import { useEffect, useState, useRef } from 'react';
import {
    Save, Building, CheckCircle, MapPin, Image, Upload, X,
    Loader2, Globe, Users, Database, Smartphone, Mail, AlertTriangle, Check, Eye, ArrowRight, ShieldCheck
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { UserManagementSection } from '../components/settings/UserManagementSection';
import { toast } from 'sonner';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─────────────────────────────────────────────────────
//  TABS DEFINITION
// ─────────────────────────────────────────────────────
type Tab = 'profile' | 'users' | 'system';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profil Firmy', icon: Building },
    { id: 'users', label: 'Pracownicy i Dostęp', icon: Users },
    { id: 'system', label: 'System i Baza Danych', icon: Database },
];

// ─────────────────────────────────────────────────────
//  LOGO UPLOADER
// ─────────────────────────────────────────────────────
function LogoSection() {
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch(`${API_BASE}/company-settings`, { headers: getAuthHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.logoUrl) setLogoUrl(d.logoUrl); })
            .catch(() => { });
    }, []);

    const handleFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Dozwolone są tylko pliki graficzne (PNG, JPG, SVG, WEBP).');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Plik jest za duży — maks. 5 MB.');
            return;
        }
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const uploadRes = await fetch(`${API_BASE}/documents/upload`, {
                method: 'POST', headers: getAuthHeaders(), body: form
            });
            if (!uploadRes.ok) {
                const err = await uploadRes.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${uploadRes.status}`);
            }
            const { url } = await uploadRes.json();
            await fetch(`${API_BASE}/company-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ logoUrl: url })
            });
            setLogoUrl(url);
            toast.success('Logo zapisane!');
        } catch (e: any) {
            toast.error(`Błąd uploadu: ${e.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async () => {
        await fetch(`${API_BASE}/company-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ logoUrl: null })
        });
        setLogoUrl(null);
        toast.success('Logo usunięte.');
    };

    const baseUrl = API_BASE.replace(/\/api$/, '');

    return (
        <div className="bg-white rounded-[28px] p-8 border border-slate-100 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <Image className="h-3.5 w-3.5" /> Logo Firmy
            </h3>
            <div className="flex flex-col sm:flex-row items-start gap-6">
                {/* Preview */}
                <div className="w-36 h-24 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden relative group">
                    {logoUrl ? (
                        <>
                            <img
                                src={logoUrl.startsWith('http') ? logoUrl : `${baseUrl}${logoUrl}`}
                                alt="Logo firmy"
                                className="max-w-full max-h-full object-contain p-2" />
                            <button onClick={handleRemove}
                                className="absolute top-1 right-1 bg-white/80 rounded-full p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </>
                    ) : (
                        <div className="text-center text-slate-400">
                            <Image className="w-8 h-8 mx-auto mb-1 opacity-30" />
                            <span className="text-[10px]">Brak logo</span>
                        </div>
                    )}
                </div>
                {/* Controls */}
                <div className="flex-1 space-y-3">
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Logo pojawi się na generowanych raportach PDF i dokumentach dla klientów.
                        Zalecany format: <strong>PNG z przezroczystym tłem</strong> lub SVG. Min. 200×80 px.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                        <input ref={fileRef} type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:opacity-90 text-sm font-semibold disabled:opacity-50 transition-all shadow-sm">
                            {uploading
                                ? <><Loader2 className="w-4 h-4 animate-spin" />Przesyłanie...</>
                                : <><Upload className="w-4 h-4" />{logoUrl ? 'Zmień logo' : 'Wgraj logo'}</>}
                        </button>
                        {logoUrl && (
                            <button onClick={handleRemove}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 text-sm transition-all">
                                <X className="w-3.5 h-3.5" /> Usuń
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400">Plik przejdzie weryfikację Magic Bytes. Maks. 5 MB.</p>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────
//  TAB 1: Profil Firmy
// ─────────────────────────────────────────────────────
interface ProfileTabProps {
    localState: any;
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}
function ProfileTab({ localState, handleChange }: ProfileTabProps) {
    return (
        <div className="space-y-6">
            <LogoSection />

            {/* Dane podmiotu */}
            <div className="bg-white rounded-[28px] p-8 border border-slate-100 shadow-sm overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-700">
                    <Building className="h-40 w-40" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-7 flex items-center gap-2 relative">
                    <Building className="h-3.5 w-3.5" /> Dane Podmiotu
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-tight ml-1">Pełna Nazwa Firmy</label>
                        <div className="relative">
                            <Building className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                            <input type="text" name="companyName" value={localState.companyName} onChange={handleChange}
                                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-[15px] font-medium" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-tight ml-1">Numer NIP</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">PL</span>
                            <input type="text" name="taxId" value={localState.taxId} onChange={handleChange}
                                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-[15px] font-medium" />
                        </div>
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-tight ml-1">Siedziba (Adres)</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                            <input type="text" name="address" value={localState.address} onChange={handleChange}
                                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-[15px] font-medium" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Globalne narzuty */}
            <div className="bg-white rounded-[28px] p-8 border border-slate-100 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-7 flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" /> Globalne Narzuty i Podatki
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {[
                        { name: 'defaultVatRate', label: 'VAT Domyślny', suffix: '%' },
                        { name: 'defaultHourlyRate', label: 'Stawka Robocza', suffix: 'PLN/h' },
                        { name: 'defaultMarginPercent', label: 'Narzut (Marża)', suffix: '%' },
                    ].map(f => (
                        <div key={f.name}
                            className="p-6 rounded-2xl bg-slate-50 border border-slate-100 focus-within:ring-4 focus-within:ring-primary/5 focus-within:border-primary transition-all">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{f.label}</label>
                            <div className="flex items-baseline gap-1">
                                <input type="number" name={f.name} value={(localState as any)[f.name]} onChange={handleChange}
                                    className="bg-transparent border-none p-0 w-full text-2xl font-black text-slate-900 outline-none focus:ring-0" />
                                <span className="text-slate-400 font-bold text-xs">{f.suffix}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────
//  TAB 3: System i Baza Danych
// ─────────────────────────────────────────────────────
function SystemTab() {
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const [preview, setPreview] = useState<MigrationPreviewReport | null>(null);
    const [report, setReport] = useState<MigrationExecutionReport | null>(null);
    const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite'>('skip');
    const [filterTab, setFilterTab] = useState<'all' | 'conflict' | 'to_create' | 'identical'>('all');
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number; entity: string; id: string } | null>(null);

    const handleRunPreview = async () => {
        setIsLoadingPreview(true);
        setReport(null);
        try {
            const { migrationService } = await import('../services/data/migrationService');
            const data = await migrationService.previewMigration();
            setPreview(data);
            toast.success(`Przeanalizowano ${data.totalLocal} rekordów w IndexedDB.`);
        } catch (e: any) {
            console.error('Błąd analizy migracji:', e);
            toast.error('Nie udało się przygotować podglądu migracji: ' + (e.message || 'Błąd bazy danych'));
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const handleRunMigration = async () => {
        if (!preview) {
            toast.error('Najpierw wykonaj analizę spójności danych.');
            return;
        }

        if (!confirm(`Czy na pewno chcesz wykonać migrację powiązaną z zatwierdzonym snapshotem (${preview.snapshotHash})? Wybrana strategia: ${conflictStrategy === 'skip' ? 'Bezpieczne pominięcie (MongoDB jako prawda)' : 'Nadpisanie danymi z IndexedDB'}.`)) {
            return;
        }

        setIsMigrating(true);
        setProgress(null);
        try {
            const { migrationService } = await import('../services/data/migrationService');
            const execReport = await migrationService.migrateAll(preview, {
                conflictStrategy,
                onProgress: (p) => setProgress(p)
            });
            setReport(execReport);
            toast.success(`Migracja zakończona: ${execReport.created} utworzono, ${execReport.updated} zaktualizowano, ${execReport.skipped} pominięto.`);
            // Refresh preview
            const updatedPreview = await migrationService.previewMigration();
            setPreview(updatedPreview);
        } catch (e: any) {
            console.error('Błąd wykonania migracji:', e);
            if (e.message && e.message.includes('Snapshot migracji unieważniony')) {
                toast.error(e.message);
                await handleRunPreview();
            } else {
                toast.error('Błąd migracji: ' + (e.message || 'Nieznany błąd'));
            }
        } finally {
            setIsMigrating(false);
            setProgress(null);
        }
    };

    const filteredItems = (preview?.items || []).filter(item => {
        if (filterTab === 'all') return true;
        return item.status === filterTab;
    });

    return (
        <div className="bg-white rounded-2xl p-8 border border-black/10 space-y-8">
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2 border-b border-black/5 pb-4">
                    Migracja z IndexedDB do MongoDB (Jedno Źródło Prawdy)
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                    MongoDB jest jedynym aktywnym źródłem zapisu w systemie KOSTIQ. Dane w przeglądarce (IndexedDB) służą wyłącznie jako źródło do bezpiecznej migracji z pełną analizą różnic i konfliktów przed zapisem.
                </p>
            </div>

            {/* Action Card */}
            <div className="bg-zinc-50 border border-black/10 rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-teal-50 text-[#21808D] border border-teal-100/50 flex items-center justify-center flex-shrink-0">
                            <Database className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="font-bold text-sm text-zinc-900">Podgląd spójności i kontrola konfliktów</h4>
                            <p className="text-xs text-zinc-500">Porównaj lokalny stan IndexedDB z bazą centralną MongoDB.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRunPreview}
                            disabled={isLoadingPreview || isMigrating}
                            className="px-4 py-2.5 bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50">
                            {isLoadingPreview ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : <Eye className="h-4 w-4 text-zinc-600" />}
                            Sprawdź spójność (Podgląd)
                        </button>

                        <button
                            onClick={handleRunMigration}
                            disabled={isMigrating || isLoadingPreview || !preview}
                            className="px-5 py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50">
                            {isMigrating ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <ArrowRight className="h-4 w-4 text-white" />}
                            Rozpocznij migrację
                        </button>
                    </div>
                </div>

                {/* Conflict Strategy Selector */}
                <div className="pt-4 border-t border-zinc-200/60 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-2 text-zinc-700">
                        <ShieldCheck className="h-4 w-4 text-teal-600" />
                        <span className="font-medium">Strategia obsługi konfliktów:</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="conflictStrategy"
                                value="skip"
                                checked={conflictStrategy === 'skip'}
                                onChange={() => setConflictStrategy('skip')}
                                className="text-black focus:ring-black"
                            />
                            <span className="font-medium text-zinc-800">Zachowaj wersję MongoDB (bezpieczna)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="conflictStrategy"
                                value="overwrite"
                                checked={conflictStrategy === 'overwrite'}
                                onChange={() => setConflictStrategy('overwrite')}
                                className="text-black focus:ring-black"
                            />
                            <span className="font-medium text-amber-700">Nadpisz wersją z IndexedDB</span>
                        </label>
                    </div>
                </div>

                {/* Progress bar */}
                {isMigrating && progress && (
                    <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-[11px] text-zinc-600">
                            <span>Przenoszenie rekordu: <b>{progress.entity}</b> ({progress.id})</span>
                            <span>{progress.current} / {progress.total}</span>
                        </div>
                        <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-black h-2 transition-all duration-150"
                                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Preview Statistics Tiles */}
            {preview && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80">
                            <div className="text-[10px] uppercase font-bold text-zinc-400">Łącznie w IndexedDB</div>
                            <div className="text-2xl font-black text-zinc-900 mt-1">{preview.totalLocal}</div>
                        </div>
                        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                            <div className="text-[10px] uppercase font-bold text-emerald-700">Nowe do dodania</div>
                            <div className="text-2xl font-black text-emerald-800 mt-1">{preview.toCreateCount}</div>
                        </div>
                        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80">
                            <div className="text-[10px] uppercase font-bold text-zinc-500">Identyczne (w synchronizacji)</div>
                            <div className="text-2xl font-black text-zinc-700 mt-1">{preview.identicalCount}</div>
                        </div>
                        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200">
                            <div className="text-[10px] uppercase font-bold text-amber-700">Konflikty danych</div>
                            <div className="text-2xl font-black text-amber-800 mt-1">{preview.conflictCount}</div>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 border-b border-zinc-200 text-xs font-semibold">
                        {[
                            { id: 'all', label: `Wszystkie (${preview.totalLocal})` },
                            { id: 'conflict', label: `Konflikty (${preview.conflictCount})` },
                            { id: 'to_create', label: `Do dodania (${preview.toCreateCount})` },
                            { id: 'identical', label: `Identyczne (${preview.identicalCount})` },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setFilterTab(t.id as any)}
                                className={`pb-2.5 px-3 border-b-2 transition-all ${
                                    filterTab === t.id
                                        ? 'border-black text-black'
                                        : 'border-transparent text-zinc-400 hover:text-zinc-700'
                                }`}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Records Table */}
                    <div className="border border-zinc-200 rounded-xl overflow-hidden text-xs">
                        <div className="bg-zinc-100/75 px-4 py-2.5 font-bold text-zinc-600 grid grid-cols-12 gap-2 border-b border-zinc-200">
                            <span className="col-span-3">Kolekcja / Tytuł</span>
                            <span className="col-span-4">ID Rekordu</span>
                            <span className="col-span-3">Status spójności</span>
                            <span className="col-span-2 text-right">Szczegóły</span>
                        </div>
                        <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
                            {filteredItems.length === 0 ? (
                                <div className="p-6 text-center text-zinc-400">Brak rekordów dla wybranego filtra.</div>
                            ) : (
                                filteredItems.map(item => {
                                    const isExpanded = expandedItem === item.id;
                                    return (
                                        <div key={item.id} className="hover:bg-zinc-50/50">
                                            <div className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center">
                                                <div className="col-span-3 font-semibold text-zinc-800 truncate" title={item.summary}>
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">{item.entity}</span>
                                                    {item.summary || item.id}
                                                </div>
                                                <div className="col-span-4 font-mono text-[11px] text-zinc-500 truncate" title={item.id}>
                                                    {item.id}
                                                </div>
                                                <div className="col-span-3">
                                                    {item.status === 'to_create' && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                            <Check className="h-3 w-3" /> Do utworzenia
                                                        </span>
                                                    )}
                                                    {item.status === 'identical' && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700">
                                                            Identyczny
                                                        </span>
                                                    )}
                                                    {item.status === 'conflict' && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900" title={`Konflikt pól: ${item.conflictFields.join(', ')}`}>
                                                            <AlertTriangle className="h-3 w-3 text-amber-700" /> Konflikt: {item.conflictFields.length} pól
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="col-span-2 text-right">
                                                    {item.status === 'conflict' ? (
                                                        <button
                                                            onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                                                            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold underline">
                                                            {isExpanded ? 'Ukryj' : 'Pokaż diff'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-zinc-300">—</span>
                                                    )}
                                                </div>
                                            </div>

                                            {isExpanded && item.status === 'conflict' && (
                                                <div className="px-4 py-3 bg-zinc-100 border-t border-zinc-200 space-y-2">
                                                    <div className="text-[11px] font-bold text-amber-900">
                                                        Różniące się pola: {item.conflictFields.join(', ')}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                                        <div className="p-2 bg-white rounded border border-zinc-200">
                                                            <div className="font-bold text-zinc-500 mb-1">IndexedDB (Lokalnie):</div>
                                                            <pre className="overflow-x-auto max-h-32 text-zinc-700">
                                                                {JSON.stringify(item.conflictFields.reduce((acc: any, f) => ({ ...acc, [f]: item.localData?.[f] }), {}), null, 2)}
                                                            </pre>
                                                        </div>
                                                        <div className="p-2 bg-white rounded border border-zinc-200">
                                                            <div className="font-bold text-zinc-500 mb-1">MongoDB (Zdalnie):</div>
                                                            <pre className="overflow-x-auto max-h-32 text-zinc-700">
                                                                {JSON.stringify(item.conflictFields.reduce((acc: any, f) => ({ ...acc, [f]: item.remoteData?.[f] }), {}), null, 2)}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Execution Report */}
            {report && (
                <div className="p-6 rounded-2xl bg-zinc-900 text-white space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <div className="font-bold text-sm">Raport wykonania migracji ({new Date(report.timestamp).toLocaleTimeString()})</div>
                        <div className="flex gap-4 text-xs">
                            <span className="text-emerald-400">Utworzono: <b>{report.created}</b></span>
                            <span className="text-blue-400">Zaktualizowano: <b>{report.updated}</b></span>
                            <span className="text-zinc-400">Pominięto: <b>{report.skipped}</b></span>
                            <span className={report.failed > 0 ? 'text-rose-400 font-bold' : 'text-zinc-500'}>
                                Błędy: <b>{report.failed}</b>
                            </span>
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1 font-mono text-[11px] divide-y divide-zinc-800">
                        {report.results.map((r, idx) => (
                            <div key={idx} className="py-1 flex items-center justify-between gap-4">
                                <span className="text-zinc-400 truncate">[{r.entity}] {r.id}</span>
                                <span className={`font-semibold ${
                                    r.status === 'created' ? 'text-emerald-400' :
                                    r.status === 'updated' ? 'text-blue-400' :
                                    r.status === 'failed' ? 'text-rose-400' : 'text-zinc-400'
                                }`}>
                                    {r.status.toUpperCase()}: {r.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Dev seed — only in DEV */}
            {import.meta.env.DEV && (
                <div className="group bg-zinc-50 border border-black/10 rounded-2xl p-6 transition-all duration-300">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-teal-50 text-[#21808D] border border-teal-100/50 flex items-center justify-center flex-shrink-0">
                            <Database className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-zinc-900">Dane Demonstracyjne</h4>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 bg-amber-55/60 border border-amber-100/50 px-2 py-0.5 rounded-full">DEV ONLY</span>
                        </div>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed mb-5 ml-14">
                        Wypełnij pustą bazę przykładowymi danymi dla celów testowych.
                    </p>
                    <button
                        onClick={async () => {
                            if (confirm('Zasilić bazę danymi demo? UWAGA: To nadpisze istniejące dane!')) {
                                const { seedMongoDatabase } = await import('../services/data/mongoSeeder');
                                await seedMongoDatabase();
                                alert('Baza danych zasilona danymi demo.');
                            }
                        }}
                        className="ml-14 px-5 py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-all">
                        Załaduj dane demo
                    </button>
                </div>
            )}

            {/* Support footer */}
            <div className="mt-10 pt-8 border-t border-black/5 flex flex-col items-center gap-4">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Wsparcie Techniczne</p>
                <div className="flex gap-3">
                    {[Smartphone, Mail, Globe].map((Icon, i) => (
                        <button key={i}
                            className="h-9 w-9 rounded-xl bg-zinc-50 border border-black/10 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">
                            <Icon className="h-4 w-4" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const { settings, loading, updateSettings } = useCompanySettings();
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [localState, setLocalState] = useState(settings);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (!loading) setLocalState(settings);
    }, [loading, settings]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalState(prev => ({
            ...prev,
            [name]: ['defaultVatRate', 'defaultHourlyRate', 'defaultMarginPercent'].includes(name)
                ? Number(value) : value
        }));
        setIsSaved(false);
    };

    const handleSave = () => {
        updateSettings(localState);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3500);
    };

    if (loading) return (
        <div className="flex justify-center items-center py-24 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3" />
            Ładowanie ustawień...
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto p-6 pb-32">

            {/* ── PAGE HEADER ── */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Ustawienia</h1>
                    <p className="text-slate-500 mt-1 text-sm">Skonfiguruj dane firmy, uprawnienia i system</p>
                </div>

                {/* Save button — only visible on profile tab */}
                <div className={`flex items-center gap-4 transition-all duration-300 ${activeTab === 'profile' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    {isSaved && (
                        <span className="text-emerald-600 text-sm font-bold flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl">
                            <CheckCircle className="h-4 w-4" /> Zapisano
                        </span>
                    )}
                    <Button onClick={handleSave} size="lg" className="shadow-lg shadow-primary/20 px-8">
                        <Save className="h-4 w-4 mr-2" /> Zapisz zmiany
                    </Button>
                </div>
            </div>

            {/* ── TAB BAR ── */}
            <div className="flex items-center gap-0 border-b border-slate-200 mb-8 -mx-0">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                relative flex items-center gap-2.5 px-5 py-3.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap
                                ${isActive
                                    ? 'text-primary'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
                                }
                            `}>
                            <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                            {tab.label}
                            {/* Active underline */}
                            {isActive && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── TAB CONTENT ── */}
            <div>
                {activeTab === 'profile' && (
                    <ProfileTab localState={localState} handleChange={handleChange} />
                )}
                {activeTab === 'users' && (
                    <UserManagementSection />
                )}
                {activeTab === 'system' && (
                    <SystemTab />
                )}
            </div>
        </div>
    );
}
