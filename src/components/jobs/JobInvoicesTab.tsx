import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FileText, CheckCircle, Clock, Trash2, CreditCard, RefreshCw, TrendingDown, TrendingUp, Edit2, Send, Ban, History, RotateCcw } from 'lucide-react';
import type { Job, JobExpense, ExtraWork } from '../../models/types';
import { useJobs } from '../../context/JobsContext';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { Modal } from '../ui/Modal';
import type { InvoiceDocument, InvoicePaymentDocument, InvoicePaymentMethod, InvoiceVatRate } from '../../../shared/contracts/invoice.generated';
import { createInvoiceMutationKey, InvoiceApiError, invoiceService, minorToPln, plnToMinor } from '../../services/data/invoiceService';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

type InvoiceIncome = InvoiceDocument;

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
const todayInWarsaw = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
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

const documentStatusBadge = (status: InvoiceIncome['documentStatus']) => {
    const styles = status === 'draft'
        ? 'bg-gray-100 text-gray-700'
        : status === 'issued'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-red-100 text-red-800';
    const label = status === 'draft' ? 'Szkic' : status === 'issued' ? 'Wystawiona' : 'Anulowana';
    return <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${styles}`}>{label}</span>;
};

const paymentStatusBadge = (invoice: InvoiceIncome) => {
    const today = todayInWarsaw();
    const overdue = invoice.documentStatus === 'issued'
        && invoice.paymentStatus !== 'paid'
        && !!invoice.dueDate
        && invoice.dueDate < today;
    const label = overdue ? 'Przeterminowana' : invoice.paymentStatus === 'paid'
        ? 'Opłacona'
        : invoice.paymentStatus === 'partial' ? 'Częściowa' : 'Nieopłacona';
    const styles = overdue ? 'bg-red-100 text-red-800' : invoice.paymentStatus === 'paid'
        ? 'bg-green-100 text-green-800'
        : invoice.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700';
    return <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${styles}`}>{label}</span>;
};

type IncomeAction = 'edit' | 'issue' | 'payment' | 'refund' | 'cancel' | 'history';

export default function JobInvoicesTab({ job }: JobInvoicesTabProps) {
    const { updateJob, refreshJobs } = useJobs();
    const [activeTab, setActiveTab] = useState<'income' | 'cost'>('cost');

    // ─── INCOME ────────────────────────────────────────────────────────────────
    const [incomeInvoices, setIncomeInvoices] = useState<InvoiceIncome[]>([]);
    const [incomeLoading, setIncomeLoading] = useState(true);
    const [incomeError, setIncomeError] = useState<string | null>(null);
    const [incomeConflict, setIncomeConflict] = useState(false);
    const [incomeSubmitting, setIncomeSubmitting] = useState(false);
    const [extraWorks, setExtraWorks] = useState<ExtraWork[]>([]);
    const [selectedIncome, setSelectedIncome] = useState<InvoiceIncome | null>(null);
    const [incomeAction, setIncomeAction] = useState<IncomeAction | null>(null);
    const [incomePayments, setIncomePayments] = useState<InvoicePaymentDocument[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const operationKeys = useRef(new Map<string, string>());

    const fetchExtraWorks = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/extra-works?jobId=${job.id}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const raw = await res.json();
                const arr: ExtraWork[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
                setExtraWorks(arr.filter((ew: ExtraWork) => ew.jobId === job.id));
            }
        } catch (e) {
            console.error('Failed to fetch extra works for invoices tab:', e);
        }
    }, [job.id]);

    useEffect(() => {
        fetchExtraWorks();
    }, [fetchExtraWorks]);
    const [showIncomeForm, setShowIncomeForm] = useState(false);
    const [createIncomeKey, setCreateIncomeKey] = useState<string | null>(null);
    const [newIncome, setNewIncome] = useState({
        description: '',
        amountNet: String(job.revenuePlannedNet || 0),
        vatRate: 23 as InvoiceVatRate,
        dueDate: ''
    });
    const [actionForm, setActionForm] = useState({
        description: '', amountNet: '0', vatRate: 23 as InvoiceVatRate,
        issueDate: todayInWarsaw(), dueDate: '',
        paymentAmount: '0', paymentDate: todayInWarsaw(),
        paymentMethod: 'transfer' as InvoicePaymentMethod, reason: '', reversesPaymentId: ''
    });

    const fetchIncome = useCallback(async () => {
        setIncomeLoading(true);
        setIncomeError(null);
        try {
            setIncomeInvoices(await invoiceService.getJobInvoices(job.id));
            setIncomeConflict(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Nie udało się pobrać faktur.';
            setIncomeError(message);
        }
        finally { setIncomeLoading(false); }
    }, [job.id]);

    useEffect(() => { fetchIncome(); }, [fetchIncome]);

    const reportIncomeError = useCallback((error: unknown) => {
        const apiError = error instanceof InvoiceApiError ? error : null;
        const message = error instanceof Error ? error.message : 'Operacja faktury nie powiodła się.';
        setIncomeError(message);
        if (apiError?.isConflict) setIncomeConflict(true);
        toast.error(apiError?.isConflict ? 'Faktura została zmieniona. Odśwież dane przed ponowną próbą.' : message);
    }, []);

    const refreshIncomeAndJob = useCallback(async () => {
        await Promise.all([fetchIncome(), refreshJobs()]);
    }, [fetchIncome, refreshJobs]);

    const getOperationKey = (scope: string) => {
        const existing = operationKeys.current.get(scope);
        if (existing) return existing;
        const key = createInvoiceMutationKey();
        operationKeys.current.set(scope, key);
        return key;
    };

    const completeOperation = (scope: string) => operationKeys.current.delete(scope);

    const handleCreateIncome = async () => {
        const key = createIncomeKey || createInvoiceMutationKey();
        if (!createIncomeKey) setCreateIncomeKey(key);
        setIncomeSubmitting(true);
        try {
            const amountNetMinor = plnToMinor(newIncome.amountNet);
            if (amountNetMinor <= 0) throw new Error('Kwota netto musi być większa od zera.');
            await invoiceService.createInvoiceDraft({
                jobId: job.id,
                amountNetMinor,
                vatRate: newIncome.vatRate,
                description: newIncome.description || undefined,
                dueDate: newIncome.dueDate || undefined,
            }, key);
            setCreateIncomeKey(null);
            setShowIncomeForm(false);
            setNewIncome({ description: '', amountNet: '0', vatRate: 23, dueDate: '' });
            toast.success('Szkic faktury został utworzony.');
            await refreshIncomeAndJob();
        } catch (error) {
            reportIncomeError(error);
        } finally {
            setIncomeSubmitting(false);
        }
    };

    const openIncomeAction = async (action: IncomeAction, invoice: InvoiceIncome, payment?: InvoicePaymentDocument) => {
        setSelectedIncome(invoice);
        setIncomeAction(action);
        setIncomeError(null);
        setActionForm({
            description: invoice.description || '',
            amountNet: String(minorToPln(invoice.amountNetMinor)),
            vatRate: (invoice.vatRate ?? 23) as InvoiceVatRate,
            issueDate: action === 'cancel' ? todayInWarsaw() : (invoice.issueDate || todayInWarsaw()),
            dueDate: invoice.dueDate || '',
            paymentAmount: String(minorToPln(payment?.amountMinor ?? invoice.remainingAmountMinor)),
            paymentDate: todayInWarsaw(),
            paymentMethod: payment?.paymentMethod || 'transfer',
            reason: '',
            reversesPaymentId: payment?.id || '',
        });
        if (action === 'history') {
            setPaymentsLoading(true);
            try {
                setIncomePayments(await invoiceService.getInvoicePayments(invoice.id));
            } catch (error) {
                reportIncomeError(error);
            } finally {
                setPaymentsLoading(false);
            }
        }
    };

    const closeIncomeAction = () => {
        setIncomeAction(null);
        setSelectedIncome(null);
        setIncomePayments([]);
    };

    const handleIncomeAction = async () => {
        if (!selectedIncome || !incomeAction || incomeAction === 'history') return;
        const scope = `${incomeAction}:${selectedIncome.id}:${selectedIncome.editVersion}`;
        setIncomeSubmitting(true);
        try {
            if (incomeAction === 'edit') {
                await invoiceService.updateInvoiceDraft(selectedIncome.id, {
                    description: actionForm.description,
                    dueDate: actionForm.dueDate || undefined,
                    amountNetMinor: plnToMinor(actionForm.amountNet),
                    vatRate: actionForm.vatRate,
                }, selectedIncome.editVersion);
            } else if (incomeAction === 'issue') {
                await invoiceService.issueInvoice(selectedIncome.id, {
                    issueDate: actionForm.issueDate,
                    dueDate: actionForm.dueDate || undefined,
                }, selectedIncome.editVersion, getOperationKey(scope));
            } else if (incomeAction === 'payment' || incomeAction === 'refund') {
                await invoiceService.registerPayment(selectedIncome.id, {
                    type: incomeAction === 'refund' ? 'refund' : 'payment',
                    amountMinor: plnToMinor(actionForm.paymentAmount),
                    paymentDate: actionForm.paymentDate,
                    paymentMethod: actionForm.paymentMethod,
                    ...(incomeAction === 'refund' ? { reversesPaymentId: actionForm.reversesPaymentId } : {}),
                }, selectedIncome.editVersion, getOperationKey(scope));
            } else if (incomeAction === 'cancel') {
                if (!actionForm.reason.trim()) throw new Error('Podaj powód anulowania faktury.');
                await invoiceService.cancelInvoice(selectedIncome.id, {
                    reason: actionForm.reason.trim(),
                    cancellationDate: actionForm.issueDate,
                }, selectedIncome.editVersion, getOperationKey(scope));
            }
            completeOperation(scope);
            closeIncomeAction();
            toast.success('Operacja została zapisana.');
            await refreshIncomeAndJob();
        } catch (error) {
            reportIncomeError(error);
        } finally {
            setIncomeSubmitting(false);
        }
    };

    const handleDeleteIncome = async (invoice: InvoiceIncome) => {
        if (!window.confirm('Usunąć szkic faktury przychodowej?')) return;
        setIncomeSubmitting(true);
        try {
            await invoiceService.deleteInvoiceDraft(invoice.id, invoice.editVersion);
            toast.success('Szkic faktury został usunięty.');
            await refreshIncomeAndJob();
        } catch (error) {
            reportIncomeError(error);
        } finally {
            setIncomeSubmitting(false);
        }
    };

    const issuedIncomeInvoices = incomeInvoices.filter(i => i.documentStatus === 'issued');
    const incomeNet = issuedIncomeInvoices.reduce((s, i) => s + minorToPln(i.amountNetMinor), 0);
    const incomePaid = issuedIncomeInvoices.reduce((sum, invoice) => {
        if (invoice.amountGrossMinor <= 0) return sum;
        return sum + minorToPln(Math.round(invoice.paidAmountMinor * invoice.amountNetMinor / invoice.amountGrossMinor));
    }, 0);
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
                                    onClick={() => {
                                        if (!showIncomeForm) {
                                            setCreateIncomeKey(createInvoiceMutationKey());
                                            setNewIncome(p => ({ ...p, amountNet: remainingToInvoice.toFixed(2) }));
                                        }
                                        setShowIncomeForm(!showIncomeForm);
                                    }}
                                    className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    {remainingToInvoice > 0 && incomeNet > 0 ? 'Faktura końcowa' : 'Nowa faktura'}
                                </button>
                            </div>
                        </div>

                        {incomeError && (
                            <div className={`mb-4 flex items-center justify-between rounded-lg border p-3 text-sm ${incomeConflict ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
                                <span>{incomeError}</span>
                                <button onClick={fetchIncome} className="ml-3 font-semibold underline">Odśwież dane</button>
                            </div>
                        )}

                        {/* Draft creation form */}
                        {showIncomeForm && (
                            <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <h4 className="text-sm font-semibold text-blue-900 mb-1">Nowy szkic faktury przychodowej</h4>
                                <p className="text-xs text-blue-700 mb-3">Numer FV zostanie nadany atomowo przez serwer podczas wystawienia.</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Opis</label>
                                        <input type="text" value={newIncome.description} onChange={e => setNewIncome({ ...newIncome, description: e.target.value })} placeholder="Za montaż etap 1" className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Kwota netto *</label>
                                        <input type="text" inputMode="decimal" value={newIncome.amountNet} onChange={e => setNewIncome({ ...newIncome, amountNet: e.target.value })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label>
                                        <select value={newIncome.vatRate} onChange={e => setNewIncome({ ...newIncome, vatRate: Number(e.target.value) as InvoiceVatRate })} className="w-full p-2 rounded-md border border-gray-300 text-sm">
                                            {vatOptions.map(v => <option key={v} value={v}>{v === 0 ? '0% (zw.)' : `${v}%`}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Termin płatności</label>
                                        <input type="date" value={newIncome.dueDate} onChange={e => setNewIncome({ ...newIncome, dueDate: e.target.value })} className="w-full p-2 rounded-md border border-gray-300 text-sm" />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-3">
                                    <p className="text-xs text-gray-500">Wartości VAT i brutto zostaną przeliczone przez serwer.</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setShowIncomeForm(false); setCreateIncomeKey(null); }} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                        <button onClick={handleCreateIncome} disabled={incomeSubmitting || !newIncome.amountNet} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Zapisz szkic</button>
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
                                            <th className="py-2 font-medium">Data / termin</th>
                                            <th className="py-2 font-medium text-right">Netto</th>
                                            <th className="py-2 font-medium text-right">Brutto</th>
                                            <th className="py-2 font-medium text-right">Zapłacono / pozostało</th>
                                            <th className="py-2 font-medium text-center">Dokument</th>
                                            <th className="py-2 font-medium text-center">Płatność</th>
                                            <th className="py-2 font-medium text-right">Akcje</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {incomeInvoices.map(inv => (
                                            <tr key={inv.id} className="hover:bg-gray-50">
                                                <td className="py-3 font-mono text-xs font-medium text-gray-900">{inv.invoiceNumber || 'Numer po wystawieniu'}</td>
                                                <td className="py-3 text-gray-600">{inv.description || '-'}</td>
                                                <td className="py-3 text-gray-600 text-xs">
                                                    <div>{inv.issueDate || 'Szkic'}</div>
                                                    <div className="text-gray-400">termin: {inv.dueDate || '-'}</div>
                                                </td>
                                                <td className="py-3 text-right font-semibold text-gray-900">{fmt(minorToPln(inv.amountNetMinor))}</td>
                                                <td className="py-3 text-right text-gray-600">{fmt(minorToPln(inv.amountGrossMinor))}</td>
                                                <td className="py-3 text-right text-xs">
                                                    <div className="text-green-700">{fmt(minorToPln(inv.paidAmountMinor))}</div>
                                                    <div className="text-gray-500">{fmt(minorToPln(inv.remainingAmountMinor))}</div>
                                                </td>
                                                <td className="py-3 text-center">{documentStatusBadge(inv.documentStatus)}</td>
                                                <td className="py-3 text-center">{paymentStatusBadge(inv)}</td>
                                                <td className="py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {inv.documentStatus === 'draft' && (
                                                            <>
                                                                <button onClick={() => openIncomeAction('edit', inv)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Edytuj szkic"><Edit2 className="w-4 h-4" /></button>
                                                                <button onClick={() => openIncomeAction('issue', inv)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded" title="Wystaw fakturę"><Send className="w-4 h-4" /></button>
                                                                <button onClick={() => handleDeleteIncome(inv)} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Usuń szkic"><Trash2 className="w-4 h-4" /></button>
                                                            </>
                                                        )}
                                                        {inv.documentStatus === 'issued' && (
                                                            <>
                                                                {inv.remainingAmountMinor > 0 && <button onClick={() => openIncomeAction('payment', inv)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Zarejestruj wpłatę"><CreditCard className="w-4 h-4" /></button>}
                                                                <button onClick={() => openIncomeAction('history', inv)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Historia wpłat"><History className="w-4 h-4" /></button>
                                                                {inv.paidAmountMinor === 0 && <button onClick={() => openIncomeAction('cancel', inv)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Anuluj fakturę"><Ban className="w-4 h-4" /></button>}
                                                            </>
                                                        )}
                                                        {inv.documentStatus === 'cancelled' && <button onClick={() => openIncomeAction('history', inv)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Historia"><History className="w-4 h-4" /></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="font-bold bg-gray-50 border-t-2 border-gray-300">
                                            <td colSpan={3} className="py-2 pl-2">SUMA WYSTAWIONYCH</td>
                                            <td className="py-2 text-right">{fmt(incomeNet)}</td>
                                            <td className="py-2 text-right text-gray-600">{fmt(issuedIncomeInvoices.reduce((s, i) => s + minorToPln(i.amountGrossMinor), 0))}</td>
                                            <td colSpan={4}></td>
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

            <Modal
                isOpen={!!incomeAction && !!selectedIncome}
                onClose={closeIncomeAction}
                title={incomeAction === 'edit' ? 'Edytuj szkic faktury'
                    : incomeAction === 'issue' ? 'Wystaw fakturę'
                        : incomeAction === 'payment' ? 'Zarejestruj wpłatę'
                            : incomeAction === 'refund' ? 'Zarejestruj zwrot'
                                : incomeAction === 'cancel' ? 'Anuluj fakturę'
                                    : 'Historia wpłat'}
            >
                {selectedIncome && incomeAction === 'history' && (
                    <div className="space-y-3">
                        {paymentsLoading ? <p className="text-sm text-gray-500">Ładowanie historii...</p>
                            : incomePayments.length === 0 ? <p className="text-sm text-gray-500">Brak zarejestrowanych wpłat.</p>
                                : incomePayments.map(payment => {
                                    const refunded = incomePayments
                                        .filter(item => item.type === 'refund' && item.reversesPaymentId === payment.id)
                                        .reduce((sum, item) => sum + item.amountMinor, 0);
                                    const refundable = payment.type === 'payment' ? Math.max(0, payment.amountMinor - refunded) : 0;
                                    return (
                                        <div key={payment.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm">
                                            <div>
                                                <p className="font-medium text-gray-900">{payment.type === 'payment' ? 'Wpłata' : 'Zwrot'} · {fmt(minorToPln(payment.amountMinor))}</p>
                                                <p className="text-xs text-gray-500">{payment.paymentDate} · {payment.paymentMethod} · sekwencja {payment.sequence}</p>
                                            </div>
                                            {refundable > 0 && selectedIncome.documentStatus === 'issued' && (
                                                <button
                                                    onClick={() => openIncomeAction('refund', selectedIncome, { ...payment, amountMinor: refundable })}
                                                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" /> Zwrot
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                        <div className="flex justify-end"><button onClick={closeIncomeAction} className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700">Zamknij</button></div>
                    </div>
                )}

                {selectedIncome && incomeAction === 'edit' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-sm text-gray-700">Opis<input className="mt-1 w-full rounded-md border p-2" value={actionForm.description} onChange={e => setActionForm({ ...actionForm, description: e.target.value })} /></label>
                        <label className="text-sm text-gray-700">Kwota netto<input className="mt-1 w-full rounded-md border p-2" inputMode="decimal" value={actionForm.amountNet} onChange={e => setActionForm({ ...actionForm, amountNet: e.target.value })} /></label>
                        <label className="text-sm text-gray-700">VAT<select className="mt-1 w-full rounded-md border p-2" value={actionForm.vatRate} onChange={e => setActionForm({ ...actionForm, vatRate: Number(e.target.value) as InvoiceVatRate })}>{vatOptions.map(v => <option key={v} value={v}>{v}%</option>)}</select></label>
                        <label className="text-sm text-gray-700">Termin płatności<input type="date" className="mt-1 w-full rounded-md border p-2" value={actionForm.dueDate} onChange={e => setActionForm({ ...actionForm, dueDate: e.target.value })} /></label>
                    </div>
                )}

                {selectedIncome && incomeAction === 'issue' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-sm text-gray-700">Data wystawienia<input type="date" className="mt-1 w-full rounded-md border p-2" value={actionForm.issueDate} onChange={e => setActionForm({ ...actionForm, issueDate: e.target.value })} /></label>
                        <label className="text-sm text-gray-700">Termin płatności<input type="date" className="mt-1 w-full rounded-md border p-2" value={actionForm.dueDate} onChange={e => setActionForm({ ...actionForm, dueDate: e.target.value })} /></label>
                        <p className="sm:col-span-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">Po wystawieniu serwer nada numer FV. Dokumentu nie będzie można już edytować ani usunąć.</p>
                    </div>
                )}

                {selectedIncome && (incomeAction === 'payment' || incomeAction === 'refund') && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="text-sm text-gray-700">Kwota brutto<input className="mt-1 w-full rounded-md border p-2" inputMode="decimal" value={actionForm.paymentAmount} onChange={e => setActionForm({ ...actionForm, paymentAmount: e.target.value })} /></label>
                        <label className="text-sm text-gray-700">Data<input type="date" className="mt-1 w-full rounded-md border p-2" value={actionForm.paymentDate} onChange={e => setActionForm({ ...actionForm, paymentDate: e.target.value })} /></label>
                        <label className="text-sm text-gray-700">Metoda<select className="mt-1 w-full rounded-md border p-2" value={actionForm.paymentMethod} onChange={e => setActionForm({ ...actionForm, paymentMethod: e.target.value as InvoicePaymentMethod })}><option value="transfer">Przelew</option><option value="cash">Gotówka</option><option value="card">Karta</option><option value="blik">BLIK</option><option value="other">Inna</option></select></label>
                        {incomeAction === 'refund' && <p className="sm:col-span-3 text-xs text-amber-700">Zwrot zostanie powiązany z wybraną wpłatą. Backend zablokuje przekroczenie jej nierozliczonego salda.</p>}
                    </div>
                )}

                {selectedIncome && incomeAction === 'cancel' && (
                    <div className="space-y-3">
                        <label className="block text-sm text-gray-700">Data anulowania<input type="date" className="mt-1 w-full rounded-md border p-2" value={actionForm.issueDate} onChange={e => setActionForm({ ...actionForm, issueDate: e.target.value })} /></label>
                        <label className="block text-sm text-gray-700">Powód<textarea className="mt-1 w-full rounded-md border p-2" value={actionForm.reason} onChange={e => setActionForm({ ...actionForm, reason: e.target.value })} /></label>
                    </div>
                )}

                {selectedIncome && incomeAction && incomeAction !== 'history' && (
                    <div className="mt-5 flex justify-end gap-2">
                        <button onClick={closeIncomeAction} disabled={incomeSubmitting} className="rounded-lg px-4 py-2 text-sm text-gray-600">Anuluj</button>
                        <button onClick={handleIncomeAction} disabled={incomeSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{incomeSubmitting ? 'Zapisywanie...' : 'Zapisz'}</button>
                    </div>
                )}
            </Modal>
        </div>
    );
}
