import { useState } from 'react';
import { Plus, Pencil, Trash2, Calendar, Banknote } from 'lucide-react';
import { useSubcontractorContracts } from '../../context/SubcontractorContractsContext';
import { useTiCo } from '../../context/TiCoContext';
import { useJobs } from '../../context/JobsContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { SubcontractorContract, Job } from '../../models/types';
import { clsx } from 'clsx';

interface JobSubcontractorsTabProps {
    job: Job;
}

export const JobSubcontractorsTab = ({ job }: JobSubcontractorsTabProps) => {
    const { contracts, createContract, updateContract, deleteContract } = useSubcontractorContracts();
    const { subcontractors, getSettlementsByContract, createContractSettlement } = useTiCo();
    const { getJobStages } = useJobs();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
    const [contractToSettle, setContractToSettle] = useState<SubcontractorContract | null>(null);
    const [settleFormData, setSettleFormData] = useState<{
        amount: number;
        exchangeRate?: number;
        periodFrom: string;
        periodTo: string;
        notes: string;
    }>({
        amount: 0,
        exchangeRate: undefined,
        periodFrom: new Date().toISOString().split('T')[0],
        periodTo: new Date().toISOString().split('T')[0],
        notes: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<SubcontractorContract>>({
        currency: 'PLN'
    });
    const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);
    const [settleIdempotencyKey, setSettleIdempotencyKey] = useState<string>('');

    const jobContracts = contracts.filter(c => c.jobId === job.id);
    const stages = getJobStages(job.id);

    const handleOpenCreate = () => {
        setEditingId(null);
        setFormData({
            jobId: job.id,
            currency: 'PLN',
            stageId: '' // defaults to empty string for select
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (contract: SubcontractorContract) => {
        setEditingId(contract.id);
        setFormData({
            ...contract,
            stageId: contract.stageId || '' // handle null/undefined
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Czy na pewno chcesz usunąć ten kontrakt?')) {
            await deleteContract(id);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.subcontractorId || !formData.description || !formData.totalAmountNet) {
            alert('Wypełnij wymagane pola (Podwykonawca, Opis, Kwota)');
            return;
        }

        const dataToSave = {
            ...formData,
            jobId: job.id,
            // Convert empty string back to undefined/null if needed, or keep consistent
            stageId: formData.stageId === '' ? null : formData.stageId
        } as Omit<SubcontractorContract, 'id' | 'createdAt' | 'updatedAt'>;

        if (editingId) {
            await updateContract(editingId, dataToSave);
        } else {
            await createContract(dataToSave);
        }
        setIsModalOpen(false);
    };

    const getSettledAmount = (contractId: string) => {
        const settlements = getSettlementsByContract(contractId);
        return settlements.reduce((sum, s) => sum + s.totalAmount, 0);
    };

    const handleOpenSettle = (contract: SubcontractorContract) => {
        const settled = getSettledAmount(contract.id);
        const remaining = Math.max(0, contract.totalAmountNet - settled);

        setContractToSettle(contract);
        setSettleIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('idemp-contract-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
        setIsSubmittingSettle(false);
        setSettleFormData({
            amount: remaining,
            exchangeRate: contract.currency === 'EUR' ? (contract.exchangeRate || undefined) : undefined,
            periodFrom: new Date().toISOString().split('T')[0],
            periodTo: new Date().toISOString().split('T')[0],
            notes: ''
        });
        setIsSettleModalOpen(true);
    };

    const handleSettleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contractToSettle || isSubmittingSettle) return;

        if (settleFormData.amount <= 0) {
            alert('Kwota rozliczenia musi być większa od zera.');
            return;
        }

        if (contractToSettle.currency !== 'PLN' && (!settleFormData.exchangeRate || settleFormData.exchangeRate <= 0)) {
            alert('Dla kontraktu w walucie obcej wymagany jest poprawny kurs wymiany waluty.');
            return;
        }

        try {
            setIsSubmittingSettle(true);
            await createContractSettlement({
                contractId: contractToSettle.id,
                subcontractorId: contractToSettle.subcontractorId,
                jobId: contractToSettle.jobId,
                stageId: contractToSettle.stageId || undefined,
                amount: settleFormData.amount,
                exchangeRate: contractToSettle.currency !== 'PLN' ? settleFormData.exchangeRate : undefined,
                periodFrom: settleFormData.periodFrom,
                periodTo: settleFormData.periodTo,
                notes: settleFormData.notes,
                idempotencyKey: settleIdempotencyKey
            });
            setIsSettleModalOpen(false);
        } catch (err: any) {
            console.error('Failed to create contract settlement:', err);
            alert(err?.message || 'Błąd podczas tworzenia rozliczenia kontraktowego.');
        } finally {
            setIsSubmittingSettle(false);
        }
    };

    const getSubcontractorName = (id: string) => {
        const sub = subcontractors.find(s => s.id === id);
        return sub?.name || 'Nieznany';
    };

    const getStageName = (id?: string | null) => {
        if (!id) return 'Całe zlecenie';
        const stage = stages.find(s => s.id === id);
        return stage ? stage.name : 'Nieznany etap';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Kontrakty Podwykonawców</h3>
                <Button onClick={handleOpenCreate} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Dodaj kontrakt
                </Button>
            </div>

            {jobContracts.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-500">Brak kontraktów dla tego zlecenia.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Podwykonawca</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etap</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opis</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Kwota Netto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Planowany okres</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {jobContracts.map(contract => (
                                <tr key={contract.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {getSubcontractorName(contract.subcontractorId)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className={clsx(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                            contract.stageId ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                                        )}>
                                            {getStageName(contract.stageId)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                        {contract.description}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                                        {contract.totalAmountNet.toLocaleString('pl-PL', { style: 'currency', currency: contract.currency })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {(contract.plannedStartDate || contract.plannedEndDate) ? (
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                <span>{contract.plannedStartDate || '?'} - {contract.plannedEndDate || '?'}</span>
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleOpenSettle(contract)}
                                            className="text-emerald-600 hover:text-emerald-900 mr-3"
                                            title="Rozlicz"
                                        >
                                            <Banknote className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleOpenEdit(contract)} className="text-blue-600 hover:text-blue-900 mr-3">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(contract.id)} className="text-red-600 hover:text-red-900">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? "Edytuj kontrakt" : "Nowy kontrakt podwykonawcy"}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Subcontractor Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Podwykonawca</label>
                        <select
                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            value={formData.subcontractorId || ''}
                            onChange={e => setFormData({ ...formData, subcontractorId: e.target.value })}
                            required
                        >
                            <option value="">Wybierz podwykonawcę...</option>
                            {subcontractors.filter(s => s.isActive).map(sub => (
                                <option key={sub.id} value={sub.id}>{sub.name} ({sub.specialization})</option>
                            ))}
                        </select>
                        {subcontractors.length === 0 && <p className="text-xs text-red-500 mt-1">Brak aktywnych podwykonawców w bazie KOSTIQ.</p>}
                    </div>

                    {/* Stage Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Przypisz do</label>
                        <select
                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            value={formData.stageId || ''}
                            onChange={e => setFormData({ ...formData, stageId: e.target.value })}
                        >
                            <option value="">Całe zlecenie (Globalnie)</option>
                            {stages.map(stage => (
                                <option key={stage.id} value={stage.id}>{stage.name} ({stage.status})</option>
                            ))}
                        </select>
                    </div>

                    <Input
                        label="Opis zakresu prac"
                        value={formData.description || ''}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        required
                        placeholder="np. Montaż stolarki 1. piętro"
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Kwota Netto"
                            type="number"
                            value={formData.totalAmountNet || ''}
                            onChange={e => setFormData({ ...formData, totalAmountNet: parseFloat(e.target.value) })}
                            required
                            min="0"
                            step="0.01"
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Waluta</label>
                            <select
                                className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={formData.currency || 'PLN'}
                                onChange={e => setFormData({ ...formData, currency: e.target.value as 'PLN' | 'EUR' })}
                            >
                                <option value="PLN">PLN</option>
                                <option value="EUR">EUR</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Data rozpoczęcia (plan)"
                            type="date"
                            value={formData.plannedStartDate || ''}
                            onChange={e => setFormData({ ...formData, plannedStartDate: e.target.value })}
                        />
                        <Input
                            label="Data zakończenia (plan)"
                            type="date"
                            value={formData.plannedEndDate || ''}
                            onChange={e => setFormData({ ...formData, plannedEndDate: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                            Anuluj
                        </Button>
                        <Button type="submit">
                            Zapisz
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Settle Modal */}
            <Modal
                isOpen={isSettleModalOpen}
                onClose={() => setIsSettleModalOpen(false)}
                title="Rozlicz kontrakt"
            >
                <form onSubmit={handleSettleSubmit} className="space-y-4">
                    <div className="bg-gray-50 p-3 rounded-lg text-sm mb-4">
                        <div className="flex justify-between mb-1">
                            <span className="text-gray-500">Kontrakt:</span>
                            <span className="font-medium">{contractToSettle ? getSubcontractorName(contractToSettle.subcontractorId) : ''}</span>
                        </div>
                        <div className="flex justify-between mb-1">
                            <span className="text-gray-500">Wartość kontraktu:</span>
                            <span className="font-medium text-gray-900">
                                {contractToSettle?.totalAmountNet.toLocaleString('pl-PL', { style: 'currency', currency: contractToSettle.currency })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Już rozliczono:</span>
                            <span className="font-medium text-emerald-600">
                                {contractToSettle ? getSettledAmount(contractToSettle.id).toLocaleString('pl-PL', { style: 'currency', currency: contractToSettle.currency }) : '-'}
                            </span>
                        </div>
                    </div>

                    <Input
                        label="Kwota rozliczenia (Netto)"
                        type="number"
                        value={settleFormData.amount}
                        onChange={e => setSettleFormData({ ...settleFormData, amount: parseFloat(e.target.value) })}
                        required
                        min="0.01"
                        step="0.01"
                    />

                    {contractToSettle && contractToSettle.currency !== 'PLN' && (
                        <div>
                            <Input
                                label={`Kurs wymiany (${contractToSettle.currency}/PLN)`}
                                type="number"
                                value={settleFormData.exchangeRate ?? ''}
                                onChange={e => setSettleFormData({
                                    ...settleFormData,
                                    exchangeRate: e.target.value === '' ? undefined : parseFloat(e.target.value)
                                })}
                                required
                                min="0.0001"
                                step="0.0001"
                                placeholder="Wprowadź kurs, np. 4.2850"
                            />
                            {typeof settleFormData.exchangeRate === 'number' && settleFormData.exchangeRate > 0 && settleFormData.amount > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Szacunkowa wartość w PLN: <span className="font-semibold text-gray-800">
                                        {(Math.round(settleFormData.amount * settleFormData.exchangeRate * 100) / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </span>
                                </p>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Okres od"
                            type="date"
                            value={settleFormData.periodFrom}
                            onChange={e => setSettleFormData({ ...settleFormData, periodFrom: e.target.value })}
                            required
                        />
                        <Input
                            label="Okres do"
                            type="date"
                            value={settleFormData.periodTo}
                            onChange={e => setSettleFormData({ ...settleFormData, periodTo: e.target.value })}
                            required
                        />
                    </div>

                    <Input
                        label="Uwagi (na fakturze/rachunku)"
                        value={settleFormData.notes}
                        onChange={e => setSettleFormData({ ...settleFormData, notes: e.target.value })}
                        placeholder="np. Faktura FV/12/2025"
                    />

                    <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsSettleModalOpen(false)} disabled={isSubmittingSettle}>
                            Anuluj
                        </Button>
                        <Button type="submit" variant="primary" disabled={isSubmittingSettle} className="bg-emerald-600 hover:bg-emerald-700">
                            {isSubmittingSettle ? 'Zapisywanie...' : 'Zatwierdź rozliczenie'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
