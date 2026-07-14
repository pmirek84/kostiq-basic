import React, { useState, useEffect, useCallback } from 'react';
import { Plus, FileText, CheckCircle, Clock, Trash2, CreditCard, RefreshCw, TrendingDown, TrendingUp, Edit2 } from 'lucide-react';
import type { Job, JobExpense } from '../../models/types';
import { useJobs } from '../../context/JobsContext';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

interface InvoiceIncome {
    id: string;
    jobId: string;
    invoiceNumber: string;
    description?: string;
    amountNet: number;
    amountGross: number;
    vatRate: number;
    status: 'pending' | 'paid';
    issueDate: string;
    dueDate?: string;
    paidDate?: string;
    createdAt: string;
    updatedAt: string;
}

interface InvoiceCost {
    id: string;
    jobId: string;
    invoiceNumber: string;
    vendorName: string;
    description?: string;
    category: 'material' | 'labor' | 'transport' | 'equipment' | 'other';
    amountNet: number;
    amountGross: number;
    vatRate: number;
    status: 'pending' | 'paid';
    issueDate: string;
    dueDate?: string;
    paidDate?: string;
    createdAt: string;
    updatedAt: string;
}

interface JobInvoicesTabProps {
    job: Job;
}

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
}

const CATEGORY_LABELS: Record<InvoiceCost['category'], string> = {
    material: 'Materiały',
    labor: 'Robocizna',
    transport: 'Transport',
    equipment: 'Wynajem sprzętu',
    other: 'Inne',
};

const CATEGORY_COLORS: Record<InvoiceCost['category'], string> = {
    material: 'bg-blue-100 text-blue-800',
    labor: 'bg-green-100 text-green-800',
    transport: 'bg-orange-100 text-orange-800',
    equipment: 'bg-purple-100 text-purple-800',
    other: 'bg-gray-100 text-gray-800',
};

const vatOptions = [23, 8, 5, 0];
const fmt = (val: number) => val.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
const statusBadge = (status: string) =>
    status === 'paid' ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" /> Opłacona
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3" /> Oczekująca
        </span>
    );

export default function JobInvoicesTab({ job }: JobInvoicesTabProps) {
    const { updateJob } = useJobs();
    const [activeTab, setActiveTab] = useState<'income' | 'cost'>('cost');

    // ─── INCOME ────────────────────────────────────────────────────────────────
    const [incomeInvoices, setIncomeInvoices] = useState<InvoiceIncome[]>([]);
    const [incomeLoading, setIncomeLoading] = useState(true);
    const [showIncomeForm, setShowIncomeForm] = useState(false);
    const [newIncome, setNewIncome] = useState({
        invoiceNumber: '', description: '',
        amountNet: job.revenuePlannedNet || 0,
        vatRate: 23,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: ''
    });

    const fetchIncome = useCallback(async () => {
        setIncomeLoading(true);
        try {
            const res = await fetch(`${API_BASE}/invoices?jobId=${job.id}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const raw = await res.json();
                const arr: InvoiceIncome[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.invoices ?? []);
                setIncomeInvoices(arr.filter((inv: InvoiceIncome) => inv.jobId === job.id));
            }
        } catch (e) { console.error(e); }
        finally { setIncomeLoading(false); }
    }, [job.id]);

    useEffect(() => { fetchIncome(); }, [fetchIncome]);

    const handleCreateIncome = async () => {
        if (!newIncome.invoiceNumber || newIncome.amountNet <= 0) return;
        const gross = parseFloat((newIncome.amountNet * (1 + newIncome.vatRate / 100)).toFixed(2));
        const inv: InvoiceIncome = {
            id: uuidv4(), jobId: job.id,
            invoiceNumber: newIncome.invoiceNumber,
            description: newIncome.description || undefined,
            amountNet: newIncome.amountNet, amountGross: gross,
            vatRate: newIncome.vatRate, status: 'pending',
            issueDate: newIncome.issueDate, dueDate: newIncome.dueDate || undefined,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        await fetch(`${API_BASE}/invoices`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(inv) });
        await fetchIncome();
        setShowIncomeForm(false);
        setNewIncome({ invoiceNumber: '', description: '', amountNet: 0, vatRate: 23, issueDate: new Date().toISOString().split('T')[0], dueDate: '' });
    };

    const handleMarkIncomePaid = async (id: string) => {
        await fetch(`${API_BASE}/invoices/${id}/pay`, { method: 'PATCH', headers: getAuthHeaders() });
        await fetchIncome();
    };

    const handleDeleteIncome = async (id: string) => {
        if (!window.confirm('Usunąć fakturę przychodową?')) return;
        await fetch(`${API_BASE}/invoices/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        await fetchIncome();
    };

    const incomeNet = incomeInvoices.reduce((s, i) => s + i.amountNet, 0);
    const incomePaid = incomeInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountNet, 0);
    const revenueFromOffer = job.revenuePlannedNet || job.totalPlannedRevenueNet || 0;
    const extraWorksRevenue = (job.extraWorks || []).filter(e => e.status === 'zaakceptowana').reduce((s, e) => s + (e.plannedRevenueNet || 0), 0);
    const totalContractRevenue = revenueFromOffer + extraWorksRevenue;
    const remainingToInvoice = Math.max(0, totalContractRevenue - incomeNet);
    const invoiceCoverage = totalContractRevenue > 0 ? (incomeNet / totalContractRevenue * 100) : 0;

    // ─── COST ──────────────────────────────────────────────────────────────────
    const [costInvoices, setCostInvoices] = useState<InvoiceCost[]>([]);
    const [costLoading, setCostLoading] = useState(true);
    const [showCostForm, setShowCostForm] = useState(false);
    const [newCost, setNewCost] = useState({
        invoiceNumber: '', vendorName: '', description: '',
        category: 'material' as InvoiceCost['category'],
        amountNet: 0, vatRate: 23,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: ''
    });

    const fetchCost = useCallback(async () => {
        setCostLoading(true);
        try {
            const res = await fetch(`${API_BASE}/cost-invoices?jobId=${job.id}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const raw = await res.json();
                const arr: InvoiceCost[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.invoices ?? []);
                setCostInvoices(arr.filter((inv: InvoiceCost) => inv.jobId === job.id));
            }
        } catch (e) { console.error(e); }
        finally { setCostLoading(false); }
    }, [job.id]);

    useEffect(() => { fetchCost(); }, [fetchCost]);

    const handleCreateCost = async () => {
        if (!newCost.invoiceNumber || !newCost.vendorName || newCost.amountNet <= 0) return;
        const gross = parseFloat((newCost.amountNet * (1 + newCost.vatRate / 100)).toFixed(2));
        const inv: InvoiceCost = {
            id: uuidv4(), jobId: job.id,
            invoiceNumber: newCost.invoiceNumber,
            vendorName: newCost.vendorName,
            description: newCost.description || undefined,
            category: newCost.category,
            amountNet: newCost.amountNet, amountGross: gross,
            vatRate: newCost.vatRate, status: 'pending',
            issueDate: newCost.issueDate, dueDate: newCost.dueDate || undefined,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        await fetch(`${API_BASE}/cost-invoices`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(inv) });
        await fetchCost();
        setShowCostForm(false);
        setNewCost({ invoiceNumber: '', vendorName: '', description: '', category: 'material', amountNet: 0, vatRate: 23, issueDate: new Date().toISOString().split('T')[0], dueDate: '' });
    };

    const handleMarkCostPaid = async (id: string) => {
        const inv = costInvoices.find(i => i.id === id);
        if (!inv) return;
        await fetch(`${API_BASE}/cost-invoices/${id}`, {
            method: 'PATCH', headers: getAuthHeaders(),
            body: JSON.stringify({ status: 'paid', paidDate: new Date().toISOString(), updatedAt: new Date().toISOString() })
        });
        await fetchCost();
    };

    const handleDeleteCost = async (id: string) => {
        if (!window.confirm('Usunąć fakturę kosztową?')) return;
        await fetch(`${API_BASE}/cost-invoices/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        await fetchCost();
    };

    // Legacy job.expenses delete
    const handleDeleteJobExpense = (expenseId: string) => {
        if (!window.confirm('Usunąć ten wpis kosztowy?')) return;
        const updated = (job.expenses || []).filter(e => e.id !== expenseId);
        updateJob(job.id, { expenses: updated });
    };

    // Edit state (shared for both cost-invoice and legacy expense)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        invoiceNumber: '', vendorName: '', description: '',
        category: 'material' as InvoiceCost['category'],
        amountNet: 0, vatRate: 23, issueDate: '', dueDate: ''
    });

    const startEdit = (id: string, fields: typeof editForm) => {
        setEditingId(id);
        setEditForm(fields);
    };

    const handleSaveEdit = async (id: string, isLegacy: boolean) => {
        if (isLegacy) {
            const updated = (job.expenses || []).map(e =>
                e.id === id ? {
                    ...e,
                    invoiceNumber: editForm.invoiceNumber || undefined,
                    vendorName: editForm.vendorName || undefined,
                    description: editForm.description,
                    category: editForm.category as any,
                    amountNet: editForm.amountNet,
                    date: editForm.issueDate || e.date
                } : e
            );
            updateJob(job.id, { expenses: updated });
        } else {
            const gross = parseFloat((editForm.amountNet * (1 + editForm.vatRate / 100)).toFixed(2));
            await fetch(`${API_BASE}/cost-invoices/${id}`, {
                method: 'PATCH', headers: getAuthHeaders(),
                body: JSON.stringify({
                    invoiceNumber: editForm.invoiceNumber,
                    vendorName: editForm.vendorName,
                    description: editForm.description,
                    category: editForm.category,
                    amountNet: editForm.amountNet,
                    amountGross: gross,
                    vatRate: editForm.vatRate,
                    issueDate: editForm.issueDate,
                    dueDate: editForm.dueDate || undefined,
                    updatedAt: new Date().toISOString()
                })
            });
            await fetchCost();
        }
        setEditingId(null);
    };

    // Merged cost list: legacy job.expenses + /api/cost-invoices
    const legacyExpenses: JobExpense[] = job.expenses || [];
    const allCostNet = costInvoices.reduce((s, i) => s + i.amountNet, 0)
        + legacyExpenses.reduce((s, e) => s + e.amountNet, 0);
    const costPaid = costInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amountNet, 0);
    const costPending = allCostNet - costPaid;
    const totalCostCount = costInvoices.length + legacyExpenses.length;

    // ─── RENDER ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-5">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('income')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'income' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <TrendingUp className="w-4 h-4" />
                    Przychodowe
                </button>
                <button
                    onClick={() => setActiveTab('cost')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'cost' ? 'bg-white shadow text-red-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <TrendingDown className="w-4 h-4" />
                    Kosztowe
                </button>
            </div>

            {/* ── INCOME TAB ── */}
            {activeTab === 'income' && (
                <div className="space-y-5">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-500 mb-1">Umowa pierwotna</p>
                            <p className="text-base font-bold text-gray-800">{fmt(revenueFromOffer)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-500 mb-1">Prace dodatkowe</p>
                            <p className="text-base font-bold text-indigo-600">{fmt(extraWorksRevenue)}</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm text-center">
                            <p className="text-xs text-blue-700 mb-1">Łączny kontrakt</p>
                            <p className="text-base font-bold text-blue-900">{fmt(totalContractRevenue)}</p>
                            <p className="text-xs text-blue-400">{invoiceCoverage.toFixed(0)}% zafakturowano</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200 shadow-sm text-center">
                            <p className="text-xs text-green-700 mb-1">Opłacone</p>
                            <p className="text-base font-bold text-green-700">{fmt(incomePaid)}</p>
                        </div>
                        <div className={`p-4 rounded-xl border shadow-sm text-center ${remainingToInvoice > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                            <p className="text-xs text-gray-500 mb-1">Pozostało</p>
                            <p className={`text-base font-bold ${remainingToInvoice > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(remainingToInvoice)}</p>
                        </div>
                    </div>

                    {/* List card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                Faktury przychodowe
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={fetchIncome} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50" title="Odśwież">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => { setNewIncome(p => ({ ...p, amountNet: remainingToInvoice })); setShowIncomeForm(!showIncomeForm); }}
                                    className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    {remainingToInvoice > 0 && incomeNet > 0 ? 'Faktura końcowa' : 'Nowa faktura'}
                                </button>
                            </div>
                        </div>

                        {/* Add form */}
                        {showIncomeForm && (
                            <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <h4 className="text-sm font-semibold text-blue-900 mb-3">Nowa faktura przychodowa</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Nr faktury *</label>
                                        <input type="text" value={newIncome.invoiceNumber} onChange={e => setNewIncome({ ...newIncome, invoiceNumber: e.target.value })} placeholder="FV/2026/001" className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Opis</label>
                                        <input type="text" value={newIncome.description} onChange={e => setNewIncome({ ...newIncome, description: e.target.value })} placeholder="Za montaż etap 1" className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Kwota netto *</label>
                                        <input type="number" min="0" step="0.01" value={newIncome.amountNet} onChange={e => setNewIncome({ ...newIncome, amountNet: Number(e.target.value) })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label>
                                        <select value={newIncome.vatRate} onChange={e => setNewIncome({ ...newIncome, vatRate: Number(e.target.value) })} className="w-full p-2 rounded-md border border-gray-300 text-sm">
                                            {vatOptions.map(v => <option key={v} value={v}>{v === 0 ? '0% (zw.)' : `${v}%`}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Data wystawienia</label>
                                        <input type="date" value={newIncome.issueDate} onChange={e => setNewIncome({ ...newIncome, issueDate: e.target.value })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Termin płatności</label>
                                        <input type="date" value={newIncome.dueDate} onChange={e => setNewIncome({ ...newIncome, dueDate: e.target.value })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-3">
                                    <p className="text-xs text-gray-500">Brutto: <strong>{fmt(newIncome.amountNet * (1 + newIncome.vatRate / 100))}</strong></p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowIncomeForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                        <button onClick={handleCreateIncome} disabled={!newIncome.invoiceNumber || newIncome.amountNet <= 0} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Zapisz</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {incomeLoading ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Ładowanie...</p>
                        ) : incomeInvoices.length === 0 ? (
                            <p className="text-sm text-gray-500 italic py-4 text-center">Brak faktur przychodowych.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                                            <th className="py-2 font-medium">Nr faktury</th>
                                            <th className="py-2 font-medium">Opis</th>
                                            <th className="py-2 font-medium">Data wyst.</th>
                                            <th className="py-2 font-medium text-right">Netto</th>
                                            <th className="py-2 font-medium text-right">Brutto</th>
                                            <th className="py-2 font-medium text-center">Status</th>
                                            <th className="py-2 font-medium text-right">Akcje</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {incomeInvoices.map(inv => (
                                            <tr key={inv.id} className="hover:bg-gray-50">
                                                <td className="py-3 font-mono text-xs font-medium text-gray-900">{inv.invoiceNumber}</td>
                                                <td className="py-3 text-gray-600">{inv.description || '-'}</td>
                                                <td className="py-3 text-gray-600">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
                                                <td className="py-3 text-right font-semibold text-gray-900">{fmt(inv.amountNet)}</td>
                                                <td className="py-3 text-right text-gray-600">{fmt(inv.amountGross)}</td>
                                                <td className="py-3 text-center">{statusBadge(inv.status)}</td>
                                                <td className="py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {inv.status === 'pending' && (
                                                            <button onClick={() => handleMarkIncomePaid(inv.id)} className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded" title="Oznacz opłaconą">
                                                                <CreditCard className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDeleteIncome(inv.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="font-bold bg-gray-50 border-t-2 border-gray-300">
                                            <td colSpan={3} className="py-2 pl-2">SUMA</td>
                                            <td className="py-2 text-right">{fmt(incomeNet)}</td>
                                            <td className="py-2 text-right text-gray-600">{fmt(incomeInvoices.reduce((s, i) => s + i.amountGross, 0))}</td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── COST TAB ── */}
            {activeTab === 'cost' && (
                <div className="space-y-5">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-500 mb-1">Liczba faktur</p>
                            <p className="text-2xl font-bold text-gray-800">{totalCostCount}</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm text-center">
                            <p className="text-xs text-red-700 mb-1">Łączny koszt (netto)</p>
                            <p className="text-base font-bold text-red-800">{fmt(allCostNet)}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200 shadow-sm text-center">
                            <p className="text-xs text-green-700 mb-1">Opłacone</p>
                            <p className="text-base font-bold text-green-700">{fmt(costPaid)}</p>
                        </div>
                        <div className={`p-4 rounded-xl border shadow-sm text-center ${costPending > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                            <p className="text-xs text-gray-500 mb-1">Do zapłaty</p>
                            <p className={`text-base font-bold ${costPending > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(costPending)}</p>
                        </div>
                    </div>

                    {/* List card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-red-600" />
                                Faktury kosztowe
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={fetchCost} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50" title="Odśwież">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setShowCostForm(!showCostForm)}
                                    className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    Dodaj fakturę kosztową
                                </button>
                            </div>
                        </div>

                        {/* Add form */}
                        {showCostForm && (
                            <div className="mb-5 p-4 bg-red-50 rounded-lg border border-red-200">
                                <h4 className="text-sm font-semibold text-red-900 mb-3">Nowa faktura kosztowa</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Nr faktury *</label>
                                        <input type="text" value={newCost.invoiceNumber} onChange={e => setNewCost({ ...newCost, invoiceNumber: e.target.value })} placeholder="FV-D/001/2026" className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Dostawca / Wystawca *</label>
                                        <input type="text" value={newCost.vendorName} onChange={e => setNewCost({ ...newCost, vendorName: e.target.value })} placeholder="Nazwa firmy" className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Kategoria</label>
                                        <select value={newCost.category} onChange={e => setNewCost({ ...newCost, category: e.target.value as InvoiceCost['category'] })} className="w-full p-2 rounded-md border border-gray-300 text-sm">
                                            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Opis</label>
                                        <input type="text" value={newCost.description} onChange={e => setNewCost({ ...newCost, description: e.target.value })} placeholder="Opis" className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Kwota netto *</label>
                                        <input type="number" min="0" step="0.01" value={newCost.amountNet} onChange={e => setNewCost({ ...newCost, amountNet: Number(e.target.value) })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label>
                                        <select value={newCost.vatRate} onChange={e => setNewCost({ ...newCost, vatRate: Number(e.target.value) })} className="w-full p-2 rounded-md border border-gray-300 text-sm">
                                            {vatOptions.map(v => <option key={v} value={v}>{v === 0 ? '0% (zw.)' : `${v}%`}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Data wystawienia</label>
                                        <input type="date" value={newCost.issueDate} onChange={e => setNewCost({ ...newCost, issueDate: e.target.value })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-3">
                                    <p className="text-xs text-gray-500">Brutto: <strong>{fmt(newCost.amountNet * (1 + newCost.vatRate / 100))}</strong></p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowCostForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                        <button onClick={handleCreateCost} disabled={!newCost.invoiceNumber || !newCost.vendorName || newCost.amountNet <= 0} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">Zapisz</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {costLoading ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Ładowanie...</p>
                        ) : costInvoices.length === 0 && legacyExpenses.length === 0 ? (
                            <p className="text-sm text-gray-500 italic py-4 text-center">Brak faktur kosztowych. Kliknij "Dodaj fakturę kosztową" aby dodać pierwszą.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                                            <th className="py-2 font-medium">Nr faktury</th>
                                            <th className="py-2 font-medium">Dostawca</th>
                                            <th className="py-2 font-medium">Kategoria</th>
                                            <th className="py-2 font-medium">Opis</th>
                                            <th className="py-2 font-medium">Data wyst.</th>
                                            <th className="py-2 font-medium text-right">Netto</th>
                                            <th className="py-2 font-medium text-right">Brutto</th>
                                            <th className="py-2 font-medium text-center">Status</th>
                                            <th className="py-2 font-medium text-right">Akcje</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {costInvoices.map(inv => (
                                            <React.Fragment key={inv.id}>
                                                <tr className="hover:bg-gray-50">
                                                    <td className="py-3 font-mono text-xs font-medium text-gray-900">{inv.invoiceNumber}</td>
                                                    <td className="py-3 text-gray-800 font-medium">{inv.vendorName}</td>
                                                    <td className="py-3">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[inv.category]}`}>
                                                            {CATEGORY_LABELS[inv.category]}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-gray-600 max-w-[140px] truncate" title={inv.description}>{inv.description || '-'}</td>
                                                    <td className="py-3 text-gray-600">{new Date(inv.issueDate).toLocaleDateString('pl-PL')}</td>
                                                    <td className="py-3 text-right font-semibold text-red-700">{fmt(inv.amountNet)}</td>
                                                    <td className="py-3 text-right text-gray-600">{fmt(inv.amountGross)}</td>
                                                    <td className="py-3 text-center">{statusBadge(inv.status)}</td>
                                                    <td className="py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={() => startEdit(inv.id, { invoiceNumber: inv.invoiceNumber, vendorName: inv.vendorName, description: inv.description || '', category: inv.category, amountNet: inv.amountNet, vatRate: inv.vatRate, issueDate: inv.issueDate, dueDate: inv.dueDate || '' })} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edytuj">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            {inv.status === 'pending' && (
                                                                <button onClick={() => handleMarkCostPaid(inv.id)} className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded" title="Oznacz opłaconą">
                                                                    <CreditCard className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <button onClick={() => handleDeleteCost(inv.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {editingId === inv.id && (
                                                    <tr className="bg-blue-50 border-b border-blue-200">
                                                        <td colSpan={9} className="p-4">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Nr faktury</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.invoiceNumber} onChange={e => setEditForm({ ...editForm, invoiceNumber: e.target.value })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Dostawca</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.vendorName} onChange={e => setEditForm({ ...editForm, vendorName: e.target.value })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Kategoria</label><select className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value as InvoiceCost['category'] })}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Opis</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Kwota netto</label><input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.amountNet} onChange={e => setEditForm({ ...editForm, amountNet: Number(e.target.value) })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label><select className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.vatRate} onChange={e => setEditForm({ ...editForm, vatRate: Number(e.target.value) })}>{vatOptions.map(v => <option key={v} value={v}>{v === 0 ? '0% (zw.)' : `${v}%`}</option>)}</select></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Data wyst.</label><input type="date" className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.issueDate} onChange={e => setEditForm({ ...editForm, issueDate: e.target.value })} /></div>
                                                            </div>
                                                            <div className="flex gap-2 justify-end">
                                                                <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                                                <button onClick={() => handleSaveEdit(inv.id, false)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Zapisz zmiany</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        {legacyExpenses.map(exp => (
                                            <React.Fragment key={exp.id}>
                                                <tr className="hover:bg-amber-50/50 bg-amber-50/20">
                                                    <td className="py-2 font-mono text-xs text-gray-500">{exp.invoiceNumber || '-'}</td>
                                                    <td className="py-2 font-medium text-gray-800">{exp.vendorName || '-'}</td>
                                                    <td className="py-2">
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                                            {({ material: 'Materiały', transport: 'Transport', equipment: 'Sprzęt', other: 'Inne' } as Record<string, string>)[exp.category] ?? exp.category}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 text-gray-600 max-w-[120px] truncate" title={exp.description}>{exp.description}</td>
                                                    <td className="py-2 text-gray-500 text-xs">{new Date(exp.date).toLocaleDateString('pl-PL')}</td>
                                                    <td className="py-2 text-right font-semibold text-red-700">{fmt(exp.amountNet)}</td>
                                                    <td className="py-2 text-right text-gray-400">-</td>
                                                    <td className="py-2 text-center">
                                                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Starszy wpis</span>
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={() => startEdit(exp.id, { invoiceNumber: exp.invoiceNumber || '', vendorName: exp.vendorName || '', description: exp.description, category: (exp.category as any) || 'other', amountNet: exp.amountNet, vatRate: 23, issueDate: exp.date, dueDate: '' })} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edytuj">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDeleteJobExpense(exp.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Usuń">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {editingId === exp.id && (
                                                    <tr className="bg-amber-50 border-b border-amber-200">
                                                        <td colSpan={9} className="p-4">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Nr faktury</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.invoiceNumber} onChange={e => setEditForm({ ...editForm, invoiceNumber: e.target.value })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Dostawca</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.vendorName} onChange={e => setEditForm({ ...editForm, vendorName: e.target.value })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Kategoria</label><select className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value as InvoiceCost['category'] })}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Opis</label><input className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Kwota netto</label><input type="number" className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.amountNet} onChange={e => setEditForm({ ...editForm, amountNet: Number(e.target.value) })} /></div>
                                                                <div><label className="block text-xs font-medium text-gray-600 mb-1">Data</label><input type="date" className="w-full p-2 border border-gray-300 rounded text-sm" value={editForm.issueDate} onChange={e => setEditForm({ ...editForm, issueDate: e.target.value })} /></div>
                                                            </div>
                                                            <div className="flex gap-2 justify-end">
                                                                <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                                                <button onClick={() => handleSaveEdit(exp.id, true)} className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Zapisz zmiany</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        <tr className="font-bold bg-red-50 border-t-2 border-gray-300">
                                            <td colSpan={5} className="py-2 pl-2">SUMA KOSZTÓW</td>
                                            <td className="py-2 text-right text-red-700">{fmt(allCostNet)}</td>
                                            <td className="py-2 text-right text-gray-600">{fmt(costInvoices.reduce((s, i) => s + i.amountGross, 0))}</td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
