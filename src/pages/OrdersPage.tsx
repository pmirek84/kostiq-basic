import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import type { InvoiceDocument } from '../../shared/contracts/invoice.generated';
import { invoiceService, isInvoiceOverdue } from '../services/data/invoiceService';
import {
    Plus, X, ChevronDown, TrendingDown, TrendingUp,
    Clock, ArrowRight, RefreshCw, Trash2, Edit2
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

/* ─── Constants ─────────────────────────────────────────────────────────── */
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
const getH = (): Record<string, string> => {
    const t = localStorage.getItem('kostiq_token');
    return t
        ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
};

const COST_CAT: Record<string, string> = {
    material: 'Materiały', labor: 'Robocizna', transport: 'Transport',
    equipment: 'Sprzęt', other: 'Inne',
};
const COST_CAT_COLOR: Record<string, string> = {
    material: 'bg-blue-100 text-blue-800', labor: 'bg-purple-100 text-purple-800',
    transport: 'bg-orange-100 text-orange-800', equipment: 'bg-pink-100 text-pink-800',
    other: 'bg-gray-100 text-gray-700',
};
const VAT_OPTIONS = [0, 5, 8, 23];
const fmt = (v: number) =>
    new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v || 0);

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface CostInvoice {
    id: string; jobId: string; invoiceNumber: string; vendorName: string;
    description?: string; category: string; amountNet: number; amountGross: number;
    vatRate: number; status: 'pending' | 'paid'; issueDate: string; dueDate?: string;
    createdAt: string;
}
// Replaced by contract InvoiceDocument

/* ─── Default form ───────────────────────────────────────────────────────── */
const defaultCostForm = () => ({
    jobId: '', invoiceNumber: '', vendorName: '', description: '',
    category: 'material', amountNet: 0, vatRate: 23,
    issueDate: new Date().toISOString().split('T')[0], dueDate: '',
});

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function OrdersPage() {
    const { jobs } = useJobs();
    type Tab = 'cost' | 'income' | 'pending';
    const [activeTab, setActiveTab] = useState<Tab>('cost');

    /* ── Cost invoices ── */
    const [costInvoices, setCostInvoices] = useState<CostInvoice[]>([]);
    const [costLoading, setCostLoading] = useState(false);
    const [showCostForm, setShowCostForm] = useState(false);
    const [costForm, setCostForm] = useState(defaultCostForm());
    const [costSaving, setCostSaving] = useState(false);
    const [costError, setCostError] = useState('');
    const [costSuccess, setCostSuccess] = useState('');
    const [editingCostId, setEditingCostId] = useState<string | null>(null);
    const [editCostForm, setEditCostForm] = useState(defaultCostForm());

    const fetchCost = useCallback(async () => {
        setCostLoading(true);
        try {
            const res = await fetch(`${API_BASE}/cost-invoices`, { headers: getH() });
            if (res.ok) {
                const data = await res.json();
                setCostInvoices(Array.isArray(data) ? data : data?.data ?? data?.invoices ?? []);
            }
        } catch { /* silent */ } finally { setCostLoading(false); }
    }, []);
    useEffect(() => { fetchCost(); }, [fetchCost]);

    const handleAddCost = async () => {
        if (!costForm.jobId) { setCostError('Wybierz zlecenie.'); return; }
        if (!costForm.invoiceNumber) { setCostError('Nr faktury wymagany.'); return; }
        if (!costForm.vendorName) { setCostError('Dostawca wymagany.'); return; }
        if (costForm.amountNet <= 0) { setCostError('Kwota netto musi być > 0.'); return; }
        setCostError(''); setCostSaving(true);
        try {
            const gross = parseFloat((costForm.amountNet * (1 + costForm.vatRate / 100)).toFixed(2));
            await fetch(`${API_BASE}/cost-invoices`, {
                method: 'POST', headers: getH(),
                body: JSON.stringify({
                    id: uuidv4(), ...costForm, amountGross: gross, status: 'pending',
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                }),
            });
            await fetchCost();
            setCostSuccess(`Faktura ${costForm.invoiceNumber} zapisana.`);
            setCostForm(defaultCostForm()); setShowCostForm(false);
            setTimeout(() => setCostSuccess(''), 4000);
        } catch (e: any) { setCostError(`Błąd: ${e.message}`); } finally { setCostSaving(false); }
    };

    const handleDeleteCost = async (id: string) => {
        if (!window.confirm('Usunąć fakturę kosztową?')) return;
        await fetch(`${API_BASE}/cost-invoices/${id}`, { method: 'DELETE', headers: getH() });
        await fetchCost();
    };

    const handleMarkCostPaid = async (id: string) => {
        await fetch(`${API_BASE}/cost-invoices/${id}`, {
            method: 'PATCH', headers: getH(),
            body: JSON.stringify({ status: 'paid', paidDate: new Date().toISOString(), updatedAt: new Date().toISOString() }),
        });
        await fetchCost();
    };

    const startEditCost = (inv: CostInvoice) => {
        setEditingCostId(inv.id);
        setEditCostForm({ jobId: inv.jobId, invoiceNumber: inv.invoiceNumber, vendorName: inv.vendorName, description: inv.description || '', category: inv.category, amountNet: inv.amountNet, vatRate: inv.vatRate, issueDate: inv.issueDate, dueDate: inv.dueDate || '' });
    };
    const handleSaveEditCost = async (id: string) => {
        const gross = parseFloat((editCostForm.amountNet * (1 + editCostForm.vatRate / 100)).toFixed(2));
        await fetch(`${API_BASE}/cost-invoices/${id}`, {
            method: 'PATCH', headers: getH(),
            body: JSON.stringify({ ...editCostForm, amountGross: gross, updatedAt: new Date().toISOString() }),
        });
        await fetchCost(); setEditingCostId(null);
    };

    /* ── Income invoices (contract InvoiceDocument & invoiceService) ── */
    const [incomeInvoices, setIncomeInvoices] = useState<InvoiceDocument[]>([]);
    const [incomeLoading, setIncomeLoading] = useState(false);

    const fetchIncome = useCallback(async () => {
        setIncomeLoading(true);
        try {
            const data = await invoiceService.getAllInvoices();
            setIncomeInvoices(data);
        } catch (err) {
            console.error('Failed to fetch income invoices:', err);
        } finally {
            setIncomeLoading(false);
        }
    }, []);
    useEffect(() => { if (activeTab === 'income' || activeTab === 'pending') fetchIncome(); }, [activeTab, fetchIncome]);

    /* ── Legacy job.expenses (from all jobs) ── */
    const allLegacyExpenses = jobs.flatMap(j =>
        (j.expenses || []).map(e => ({ ...e, jobId: j.id }))
    );

    /* ── Derived ── */
    const pendingIncome = incomeInvoices.filter(i =>
        i.documentStatus === 'draft' ||
        (i.documentStatus === 'issued' && (i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial'))
    );
    const jobName = (jobId: string) => {
        const j = jobs.find(x => x.id === jobId);
        return j ? `${j.jobCode} — ${j.name}` : jobId;
    };

    /* ── Stats (cost = API invoices + legacy expenses) ── */
    const costTotal = costInvoices.reduce((s, i) => s + i.amountNet, 0)
        + allLegacyExpenses.reduce((s, e) => s + e.amountNet, 0);
    const costPaid = costInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountNet, 0);

    /* ── Income Stats (calculated strictly from issued invoices minor units) ── */
    const issuedIncome = incomeInvoices.filter(i => i.documentStatus === 'issued');
    const incomeTotalNet = issuedIncome.reduce((s, i) => s + (i.amountNetMinor || 0) / 100, 0);
    const incomeTotalGross = issuedIncome.reduce((s, i) => s + (i.amountGrossMinor || 0) / 100, 0);
    const incomePaidGross = issuedIncome.reduce((s, i) => s + (i.paidAmountMinor || 0) / 100, 0);
    const incomeRemainingGross = issuedIncome.reduce((s, i) => s + (i.remainingAmountMinor || 0) / 100, 0);

    /* ─── Tab header helper ─────────────────────────────────────────────── */
    const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number; color: string }[] = [
        { key: 'cost', label: 'Kosztowe', icon: <TrendingDown className="w-4 h-4" />, count: costInvoices.length, color: 'text-red-700' },
        { key: 'income', label: 'Przychodowe', icon: <TrendingUp className="w-4 h-4" />, count: incomeInvoices.length, color: 'text-green-700' },
        { key: 'pending', label: 'Do wystawienia', icon: <Clock className="w-4 h-4" />, count: pendingIncome.length, color: 'text-amber-700' },
    ];

    /* ══════════════════════════════════════════════════════════════════════
       RENDER
    ════════════════════════════════════════════════════════════════════ */
    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">

            {/* ─ Page header ─ */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Faktury</h1>
                {activeTab === 'cost' && (
                    <button
                        onClick={() => { setShowCostForm(!showCostForm); setCostError(''); }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold shadow hover:bg-red-700 transition-colors"
                    >
                        {showCostForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {showCostForm ? 'Anuluj' : 'Dodaj fakturę kosztową'}
                    </button>
                )}
            </div>

            {/* ─ Tabs ─ */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.key ? 'bg-white shadow ' + t.color : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {t.icon}
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ══════════════ TAB: KOSZTOWE ════════════════════════════════ */}
            {activeTab === 'cost' && (
                <div className="space-y-5">

                    {/* Success */}
                    {costSuccess && (
                        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm">✅ {costSuccess}</div>
                    )}

                    {/* Add form */}
                    {showCostForm && (
                        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
                            <h2 className="text-base font-semibold text-gray-900 mb-4">Nowa faktura kosztowa</h2>
                            {costError && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{costError}</div>}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                                <div className="lg:col-span-2">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Zlecenie *</label>
                                    <div className="relative">
                                        <select value={costForm.jobId} onChange={e => setCostForm({ ...costForm, jobId: e.target.value })} className={`w-full p-2.5 pr-8 border rounded-lg text-sm appearance-none ${!costForm.jobId ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                                            <option value="">— wybierz zlecenie —</option>
                                            {jobs.map(j => <option key={j.id} value={j.id}>{j.jobCode} — {j.name}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nr faktury *</label>
                                    <input type="text" value={costForm.invoiceNumber} onChange={e => setCostForm({ ...costForm, invoiceNumber: e.target.value })} placeholder="FV/01/2026" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Dostawca *</label>
                                    <input type="text" value={costForm.vendorName} onChange={e => setCostForm({ ...costForm, vendorName: e.target.value })} placeholder="Nazwa firmy" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Kategoria</label>
                                    <select value={costForm.category} onChange={e => setCostForm({ ...costForm, category: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                                        {Object.entries(COST_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Opis</label>
                                    <input type="text" value={costForm.description} onChange={e => setCostForm({ ...costForm, description: e.target.value })} placeholder="Opcjonalnie" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Kwota netto (PLN) *</label>
                                    <input type="number" min="0" step="0.01" value={costForm.amountNet} onChange={e => setCostForm({ ...costForm, amountNet: Number(e.target.value) })} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">VAT %</label>
                                    <select value={costForm.vatRate} onChange={e => setCostForm({ ...costForm, vatRate: Number(e.target.value) })} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                                        {VAT_OPTIONS.map(v => <option key={v} value={v}>{v === 0 ? '0% (zw.)' : `${v}%`}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Data wystawienia</label>
                                    <input type="date" value={costForm.issueDate} onChange={e => setCostForm({ ...costForm, issueDate: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Termin płatności</label>
                                    <input type="date" value={costForm.dueDate} onChange={e => setCostForm({ ...costForm, dueDate: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                            </div>
                            {costForm.amountNet > 0 && (
                                <p className="text-sm text-gray-500 mb-3">Brutto: <strong>{fmt(costForm.amountNet * (1 + costForm.vatRate / 100))}</strong></p>
                            )}
                            <div className="flex gap-3 justify-end border-t pt-4">
                                <button onClick={() => { setShowCostForm(false); setCostForm(defaultCostForm()); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                <button onClick={handleAddCost} disabled={costSaving} className="px-6 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                                    {costSaving ? 'Zapisywanie...' : 'Zapisz fakturę'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center"><p className="text-xs text-gray-500 mb-1">Łączna liczba</p><p className="text-2xl font-bold text-gray-800">{costInvoices.length + allLegacyExpenses.length}</p></div>
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm text-center"><p className="text-xs text-red-700 mb-1">Łączny koszt netto</p><p className="text-base font-bold text-red-800">{fmt(costTotal)}</p></div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm text-center"><p className="text-xs text-green-700 mb-1">Opłacone</p><p className="text-base font-bold text-green-700">{fmt(costPaid)}</p></div>
                        <div className={`p-4 rounded-xl border shadow-sm text-center ${costTotal - costPaid > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}><p className="text-xs text-gray-500 mb-1">Do zapłaty</p><p className={`text-base font-bold ${costTotal - costPaid > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(costTotal - costPaid)}</p></div>
                    </div>

                    {/* Table */}
                    {costLoading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin" /> Ładowanie...</div>
                    ) : costInvoices.length === 0 && allLegacyExpenses.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-500 italic">Brak faktur kosztowych. Kliknij „Dodaj fakturę kosztową".</div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                                        <th className="py-3 px-4">Nr faktury</th>
                                        <th className="py-3 px-4">Zlecenie</th>
                                        <th className="py-3 px-4">Dostawca</th>
                                        <th className="py-3 px-4">Kategoria</th>
                                        <th className="py-3 px-4">Data</th>
                                        <th className="py-3 px-4 text-right">Netto</th>
                                        <th className="py-3 px-4 text-right">Brutto</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                        <th className="py-3 px-4 text-right">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {costInvoices.map(inv => (
                                        <React.Fragment key={inv.id}>
                                            <tr className="hover:bg-gray-50">
                                                <td className="py-2.5 px-4 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                                                <td className="py-2.5 px-4 text-xs text-gray-600 max-w-[160px] truncate">
                                                    <Link to={`/orders/${inv.jobId}`} className="text-blue-600 hover:underline">{jobName(inv.jobId)}</Link>
                                                </td>
                                                <td className="py-2.5 px-4 font-medium">{inv.vendorName}</td>
                                                <td className="py-2.5 px-4">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COST_CAT_COLOR[inv.category] ?? 'bg-gray-100 text-gray-700'}`}>{COST_CAT[inv.category] ?? inv.category}</span>
                                                </td>
                                                <td className="py-2.5 px-4 text-gray-500 text-xs">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
                                                <td className="py-2.5 px-4 text-right font-semibold text-red-700">{fmt(inv.amountNet)}</td>
                                                <td className="py-2.5 px-4 text-right text-gray-600">{fmt(inv.amountGross)}</td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {inv.status === 'paid'
                                                        ? <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Opłacona</span>
                                                        : <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Oczekująca</span>}
                                                </td>
                                                <td className="py-2.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => startEditCost(inv)} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edytuj"><Edit2 className="w-4 h-4" /></button>
                                                        {inv.status === 'pending' && (
                                                            <button onClick={() => handleMarkCostPaid(inv.id)} className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded" title="Oznacz opłaconą">✓</button>
                                                        )}
                                                        <button onClick={() => handleDeleteCost(inv.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {editingCostId === inv.id && (
                                                <tr className="bg-blue-50 border-b border-blue-200">
                                                    <td colSpan={9} className="p-4">
                                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
                                                            <div className="lg:col-span-2">
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">Zlecenie</label>
                                                                <select value={editCostForm.jobId} onChange={e => setEditCostForm({ ...editCostForm, jobId: e.target.value })} className="w-full p-2 border border-gray-300 rounded text-sm">
                                                                    {jobs.map(j => <option key={j.id} value={j.id}>{j.jobCode} — {j.name}</option>)}
                                                                </select>
                                                            </div>
                                                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Nr faktury</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editCostForm.invoiceNumber} onChange={e => setEditCostForm({ ...editCostForm, invoiceNumber: e.target.value })} /></div>
                                                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Dostawca</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editCostForm.vendorName} onChange={e => setEditCostForm({ ...editCostForm, vendorName: e.target.value })} /></div>
                                                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Kategoria</label><select className="w-full p-2 border border-gray-300 rounded text-sm" value={editCostForm.category} onChange={e => setEditCostForm({ ...editCostForm, category: e.target.value })}>{Object.entries(COST_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                                                            <div><label className="block text-xs font-medium text-gray-600 mb-1">Kwota netto</label><input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={editCostForm.amountNet} onChange={e => setEditCostForm({ ...editCostForm, amountNet: Number(e.target.value) })} /></div>
                                                            <div><label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label><select className="w-full p-2 border border-gray-300 rounded text-sm" value={editCostForm.vatRate} onChange={e => setEditCostForm({ ...editCostForm, vatRate: Number(e.target.value) })}>{VAT_OPTIONS.map(v => <option key={v} value={v}>{v === 0 ? '0% (zw.)' : `${v}%`}</option>)}</select></div>
                                                        </div>
                                                        <div className="flex gap-2 justify-end">
                                                            <button onClick={() => setEditingCostId(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                                            <button onClick={() => handleSaveEditCost(inv.id)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Zapisz</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {/* Legacy job.expenses from all jobs */}
                                    {allLegacyExpenses.map(exp => (
                                        <tr key={exp.id} className="hover:bg-amber-50/50 bg-amber-50/20">
                                            <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{exp.invoiceNumber || '-'}</td>
                                            <td className="py-2.5 px-4 text-xs">
                                                <Link to={`/orders/${exp.jobId}`} className="text-blue-600 hover:underline">{jobName(exp.jobId)}</Link>
                                            </td>
                                            <td className="py-2.5 px-4 font-medium text-gray-700">{exp.vendorName || '-'}</td>
                                            <td className="py-2.5 px-4">
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                                    {({ material: 'Materiały', transport: 'Transport', equipment: 'Sprzęt', other: 'Inne', labor: 'Robocizna' } as Record<string, string>)[exp.category] ?? exp.category}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4 text-gray-500 text-xs">{new Date(exp.date).toLocaleDateString('pl-PL')}</td>
                                            <td className="py-2.5 px-4 text-right font-semibold text-red-700">{fmt(exp.amountNet)}</td>
                                            <td className="py-2.5 px-4 text-right text-gray-400">-</td>
                                            <td className="py-2.5 px-4 text-center">
                                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Starszy wpis</span>
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <Link to={`/orders/${exp.jobId}`} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded inline-flex" title="Edytuj w zleceniu">
                                                    <ArrowRight className="w-4 h-4" />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-red-50 border-t-2 border-gray-200 font-bold">
                                        <td colSpan={5} className="py-2.5 px-4">SUMA</td>
                                        <td className="py-2.5 px-4 text-right text-red-700">{fmt(costTotal)}</td>
                                        <td className="py-2.5 px-4 text-right text-gray-600">{fmt(costInvoices.reduce((s, i) => s + i.amountGross, 0))}</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ TAB: PRZYCHODOWE ═════════════════════════════ */}
            {activeTab === 'income' && (
                <div className="space-y-5">
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-500 mb-1">Łączna liczba</p>
                            <p className="text-2xl font-bold text-gray-800">{incomeInvoices.length}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm text-center">
                            <p className="text-xs text-green-700 mb-1">Zafakturowany przychód netto</p>
                            <p className="text-base font-bold text-green-800">{fmt(incomeTotalNet)}</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm text-center">
                            <p className="text-xs text-blue-700 mb-1">Opłacone (brutto)</p>
                            <p className="text-base font-bold text-blue-700">{fmt(incomePaidGross)}</p>
                        </div>
                        <div className={`p-4 rounded-xl border shadow-sm text-center ${incomeRemainingGross > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                            <p className="text-xs text-gray-500 mb-1">Do zapłaty (brutto)</p>
                            <p className={`text-base font-bold ${incomeRemainingGross > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(incomeRemainingGross)}</p>
                        </div>
                    </div>

                    {incomeLoading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin" /> Ładowanie...</div>
                    ) : incomeInvoices.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-500 italic">Brak faktur przychodowych. Dodaj je z poziomu zlecenia → Faktury → Przychodowe.</div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                                        <th className="py-3 px-4">Nr faktury</th>
                                        <th className="py-3 px-4">Zlecenie</th>
                                        <th className="py-3 px-4">Klient</th>
                                        <th className="py-3 px-4">Opis</th>
                                        <th className="py-3 px-4">Data</th>
                                        <th className="py-3 px-4 text-right">Netto</th>
                                        <th className="py-3 px-4 text-right">Brutto</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                        <th className="py-3 px-4 text-right">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {incomeInvoices.map(inv => {
                                        const overdue = isInvoiceOverdue(inv);
                                        const net = (inv.amountNetMinor || 0) / 100;
                                        const gross = (inv.amountGrossMinor || 0) / 100;
                                        const client = jobs.find(x => x.id === inv.jobId)?.clientName || inv.clientId || '-';
                                        const displayDate = inv.issueDate
                                            ? new Date(inv.issueDate).toLocaleDateString('pl-PL')
                                            : (inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('pl-PL') : '-');

                                        return (
                                            <tr key={inv.id} className="hover:bg-gray-50">
                                                <td className="py-2.5 px-4 font-mono text-xs font-medium">{inv.invoiceNumber || '(Szkic)'}</td>
                                                <td className="py-2.5 px-4 text-xs">
                                                    <Link to={`/orders/${inv.jobId}`} className="text-blue-600 hover:underline">{jobName(inv.jobId)}</Link>
                                                </td>
                                                <td className="py-2.5 px-4 text-gray-600">{client}</td>
                                                <td className="py-2.5 px-4 text-gray-600 max-w-[140px] truncate">{inv.description || '-'}</td>
                                                <td className="py-2.5 px-4 text-gray-500 text-xs">{displayDate}</td>
                                                <td className="py-2.5 px-4 text-right font-semibold text-green-700">{fmt(net)}</td>
                                                <td className="py-2.5 px-4 text-right text-gray-600">{fmt(gross)}</td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {inv.documentStatus === 'cancelled' ? (
                                                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">Anulowana</span>
                                                    ) : inv.documentStatus === 'draft' ? (
                                                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">Szkic</span>
                                                    ) : overdue ? (
                                                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">Przeterminowana</span>
                                                    ) : inv.paymentStatus === 'paid' ? (
                                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Opłacona</span>
                                                    ) : inv.paymentStatus === 'partial' ? (
                                                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Częściowa ({fmt((inv.paidAmountMinor || 0) / 100)})</span>
                                                    ) : (
                                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">Wystawiona</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-right">
                                                    <Link to={`/orders/${inv.jobId}`} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded inline-flex" title="Otwórz zlecenie">
                                                        <ArrowRight className="w-4 h-4" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-green-50 border-t-2 border-gray-200 font-bold">
                                        <td colSpan={5} className="py-2.5 px-4">SUMA WYSTAWIONYCH</td>
                                        <td className="py-2.5 px-4 text-right text-green-700">{fmt(incomeTotalNet)}</td>
                                        <td className="py-2.5 px-4 text-right text-gray-600">{fmt(incomeTotalGross)}</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ TAB: DO WYSTAWIENIA / OCZEKUJĄCE ══════════════════ */}
            {activeTab === 'pending' && (
                <div className="space-y-5">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        Faktury przychodowe wymagające działania: <strong>Szkice</strong> (do wystawienia) oraz <strong>Wystawione</strong> (do opłacenia / częściowo opłacone).
                    </div>

                    {incomeLoading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin" /> Ładowanie...</div>
                    ) : pendingIncome.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-500 italic">
                            Brak oczekujących faktur. Wszystkie wystawione faktury zostały opłacone i brak otwartych szkiców. ✅
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b border-gray-200 bg-amber-50 text-gray-500 text-xs uppercase tracking-wider">
                                        <th className="py-3 px-4">Nr faktury</th>
                                        <th className="py-3 px-4">Zlecenie</th>
                                        <th className="py-3 px-4">Klient</th>
                                        <th className="py-3 px-4">Data wyst.</th>
                                        <th className="py-3 px-4">Termin płatności</th>
                                        <th className="py-3 px-4 text-right">Do zapłaty (brutto)</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                        <th className="py-3 px-4 text-right">Działania</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {pendingIncome.map(inv => {
                                        const overdue = isInvoiceOverdue(inv);
                                        const isDraft = inv.documentStatus === 'draft';
                                        const client = jobs.find(x => x.id === inv.jobId)?.clientName || inv.clientId || '-';
                                        const dueAmount = isDraft
                                            ? (inv.amountGrossMinor || 0) / 100
                                            : (inv.remainingAmountMinor || 0) / 100;

                                        return (
                                            <tr key={inv.id} className={overdue ? 'bg-red-50 hover:bg-red-100/50' : 'hover:bg-amber-50/30'}>
                                                <td className="py-2.5 px-4 font-mono text-xs font-medium">{inv.invoiceNumber || '(Szkic)'}</td>
                                                <td className="py-2.5 px-4 text-xs">
                                                    <Link to={`/orders/${inv.jobId}`} className="text-blue-600 hover:underline">{jobName(inv.jobId)}</Link>
                                                </td>
                                                <td className="py-2.5 px-4 text-gray-600">{client}</td>
                                                <td className="py-2.5 px-4 text-gray-500 text-xs">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('pl-PL') : '-'}</td>
                                                <td className="py-2.5 px-4 text-xs">
                                                    {inv.dueDate
                                                        ? <span className={overdue ? 'text-red-600 font-bold' : 'text-gray-600'}>{new Date(inv.dueDate).toLocaleDateString('pl-PL')}{overdue && ' ⚠️'}</span>
                                                        : '-'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right font-semibold text-amber-700">{fmt(dueAmount)}</td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {isDraft ? (
                                                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">Szkic (do wystawienia)</span>
                                                    ) : overdue ? (
                                                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">Przeterminowana ⚠️</span>
                                                    ) : inv.paymentStatus === 'partial' ? (
                                                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Częściowa (pozostało {fmt(dueAmount)})</span>
                                                    ) : (
                                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">Do zapłaty</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-right">
                                                    <Link to={`/orders/${inv.jobId}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                                                        Otwórz <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-amber-50 border-t-2 border-amber-200 font-bold">
                                        <td colSpan={5} className="py-2.5 px-4">SUMA OCZEKUJĄCYCH (BRUTTO)</td>
                                        <td className="py-2.5 px-4 text-right text-amber-700">
                                            {fmt(pendingIncome.reduce((s, i) => s + (i.documentStatus === 'draft' ? (i.amountGrossMinor || 0) / 100 : (i.remainingAmountMinor || 0) / 100), 0))}
                                        </td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
