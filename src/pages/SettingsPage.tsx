import { useEffect, useState, useRef } from 'react';
import {
    Save, Building, CheckCircle, MapPin, Image, Upload, X,
    Loader2, Globe, Users, Database, Smartphone, Mail
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
    return (
        <div className="bg-white rounded-2xl p-8 border border-black/10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-550 mb-8 border-b border-black/5 pb-4">
                Migracja i Narzędzia
            </h3>
            <div className="space-y-5">
                {/* MongoDB Migration */}
                <div className="group bg-zinc-50 border border-black/10 rounded-2xl p-6 transition-all duration-300">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-teal-50 text-[#21808D] border border-teal-100/50 flex items-center justify-center flex-shrink-0">
                            <Database className="h-5 w-5" />
                        </div>
                        <h4 className="font-bold text-sm text-zinc-900">Transfer danych do MongoDB</h4>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed mb-5 ml-14">
                        Przenieś dane lokalne z przeglądarki (localStorage) do centralnej bazy danych.
                    </p>
                    <button
                        onClick={async () => {
                            if (confirm('Czy chcesz rozpocząć migrację danych do MongoDB?')) {
                                const { migrationService } = await import('../services/data/migrationService');
                                const count = await migrationService.migrateAll();
                                alert(`Sukces! Przeniesiono ${count} elementów.`);
                                window.location.reload();
                            }
                        }}
                        className="ml-14 px-5 py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-all">
                        Rozpocznij transfer
                    </button>
                </div>

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
            </div>

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

// ─────────────────────────────────────────────────────
//  MAIN SETTINGS PAGE
// ─────────────────────────────────────────────────────
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
