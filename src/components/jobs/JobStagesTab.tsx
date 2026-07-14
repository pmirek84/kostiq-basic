
import { useState } from 'react';
import type { Job, JobStage } from '../../models/types';
import { useJobs } from '../../context/JobsContext';
import { Plus, Edit2, Trash2, CheckCircle, Circle, AlertCircle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { JobStageDetail } from './stages/JobStageDetail';

interface JobStagesTabProps {
    job: Job;
}

export const JobStagesTab = ({ job }: JobStagesTabProps) => {
    const { addJobStage, updateJobStage, deleteJobStage } = useJobs();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStage, setEditingStage] = useState<JobStage | null>(null);
    const [selectedStage, setSelectedStage] = useState<JobStage | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: 'podstawowy' as const,
        status: 'planowany' as const,
        plannedRevenueNet: 0,
        plannedCostNet: 0,
        plannedLaborHours: 0,
        plannedLaborCost: 0,
        startPlanned: '',
        endPlanned: '',
        description: ''
    });

    if (selectedStage) {
        return (
            <JobStageDetail
                job={job}
                stage={selectedStage}
                onBack={() => setSelectedStage(null)}
            />
        );
    }

    // ... rest of existing implementation logic with "Szczegóły" button added ...

    // Helper to open edit modal
    const handleOpenModal = (stage?: JobStage) => {
        if (stage) {
            setEditingStage(stage);
            setFormData({
                name: stage.name,
                type: stage.type as any,
                status: stage.status as any,
                plannedRevenueNet: stage.plannedRevenueNet,
                plannedCostNet: stage.plannedCostNet || 0,
                plannedLaborHours: stage.plannedLaborHours || 0,
                plannedLaborCost: stage.plannedLaborCost || 0,
                startPlanned: stage.startPlanned || '',
                endPlanned: stage.endPlanned || '',
                description: stage.description || ''
            });
        } else {
            setEditingStage(null);
            setFormData({
                name: '',
                type: 'podstawowy',
                status: 'planowany',
                plannedRevenueNet: 0,
                plannedCostNet: 0,
                plannedLaborHours: 0,
                plannedLaborCost: 0,
                startPlanned: '',
                endPlanned: '',
                description: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = () => {
        if (editingStage) {
            updateJobStage(job.id, editingStage.id, formData);
        } else {
            addJobStage(job.id, formData);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (stageId: string) => {
        if (window.confirm('Czy na pewno chcesz usunąć ten etap?')) {
            deleteJobStage(job.id, stageId);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'zakończony': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'w_toku': return <Circle className="w-4 h-4 text-blue-500 fill-blue-100" />;
            case 'anulowany': return <AlertCircle className="w-4 h-4 text-red-500" />;
            default: return <Circle className="w-4 h-4 text-gray-300" />;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'zakończony': return 'Zakończony';
            case 'w_toku': return 'W toku';
            case 'anulowany': return 'Anulowany';
            default: return 'Planowany';
        }
    };

    const totalPlannedRevenue = (job.stages || []).reduce((sum, stage) => sum + stage.plannedRevenueNet, 0);

    return (
        <div className="space-y-6">

            {/* Header / Summary Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Etapy zlecenia</h3>
                    <p className="text-sm text-gray-500">Zarządzaj zakresem prac i etapami</p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-gray-500">Suma etapów (netto)</div>
                    <div className="text-xl font-bold text-gray-900">
                        {totalPlannedRevenue.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end">
                <button
                    onClick={() => handleOpenModal()}
                    className="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Dodaj etap
                </button>
            </div>

            {/* Stages List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">Nazwa etapu</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Przychód</th>
                            <th className="px-6 py-4 text-right">Robocizna (h)<br /><span className="text-xs font-normal">Plan / Rzecz.</span></th>
                            <th className="px-6 py-4 text-right">Robocizna (PLN)<br /><span className="text-xs font-normal">Plan / Rzecz.</span></th>
                            <th className="px-6 py-4 text-right">Termin</th>
                            <th className="px-6 py-4 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(job.stages || []).length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                    Brak zdefiniowanych etapów
                                </td>
                            </tr>
                        ) : (
                            (job.stages || []).map((stage) => {
                                return (
                                    <tr key={stage.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedStage(stage)}>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {stage.name}
                                            {stage.type === 'dodatkowy' && (
                                                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                    Dodatkowy
                                                </span>
                                            )}
                                            {stage.description && (
                                                <div className="text-xs text-gray-400 font-normal mt-0.5">{stage.description}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(stage.status)}
                                                <span>{getStatusLabel(stage.status)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-900">
                                            {stage.plannedRevenueNet.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                        </td>

                                        {/* Labor Hours */}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-gray-500 text-xs">Plan: <span className="font-medium text-gray-700">{stage.plannedLaborHours || 0} h</span></span>
                                                <span className={`text-sm font-bold ${(stage.actualLaborHours || 0) > (stage.plannedLaborHours || 0) ? 'text-red-600' : 'text-green-600'}`}>
                                                    {stage.actualLaborHours || 0} h
                                                </span>
                                            </div>
                                        </td>

                                        {/* Labor Cost */}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-gray-500 text-xs">Plan: <span className="font-medium text-gray-700">{stage.plannedLaborCost?.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) || '0 zł'}</span></span>
                                                <span className={`text-sm font-bold ${(stage.actualLaborCost || 0) > (stage.plannedLaborCost || 0) ? 'text-red-600' : 'text-green-600'}`}>
                                                    {stage.actualLaborCost?.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) || '0 zł'}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-right text-gray-600 whitespace-nowrap">
                                            {stage.startPlanned ? (
                                                <div className="flex flex-col text-xs">
                                                    <span>{format(new Date(stage.startPlanned), 'dd.MM.yyyy')}</span>
                                                    {stage.endPlanned && <span className="text-gray-400">- {format(new Date(stage.endPlanned), 'dd.MM.yyyy')}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedStage(stage); }}
                                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors mr-1"
                                                    title="Szczegóły / BOM"
                                                >
                                                    <ArrowRight className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenModal(stage)}
                                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(stage.id)}
                                                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">
                            {editingStage ? 'Edytuj etap' : 'Nowy etap'}
                        </h2>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa etapu</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="np. Montaż okien parter"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                                    >
                                        <option value="podstawowy">Podstawowy</option>
                                        <option value="dodatkowy">Dodatkowy</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                                    >
                                        <option value="planowany">Planowany</option>
                                        <option value="w_toku">W toku</option>
                                        <option value="zakończony">Zakończony</option>
                                        <option value="anulowany">Anulowany</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Przychód (PLN)</label>
                                    <input
                                        type="number"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        value={formData.plannedRevenueNet}
                                        onChange={e => setFormData({ ...formData, plannedRevenueNet: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div>
                                    {/* Spacer or Total Cost - Keeping hidden for now or using for Labor Budget Header */}
                                </div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <h4 className="text-sm font-semibold text-blue-900 mb-3">Budżet Robocizny</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-blue-800 mb-1">Planowane Godziny (h)</label>
                                        <input
                                            type="number"
                                            className="w-full border border-blue-200 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                            value={formData.plannedLaborHours}
                                            onChange={e => setFormData({ ...formData, plannedLaborHours: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-blue-800 mb-1">Budżet Kosztowy (PLN)</label>
                                        <input
                                            type="number"
                                            className="w-full border border-blue-200 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                                            value={formData.plannedLaborCost}
                                            onChange={e => setFormData({ ...formData, plannedLaborCost: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Data rozpoczęcia</label>
                                    <input
                                        type="date"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        value={formData.startPlanned}
                                        onChange={e => setFormData({ ...formData, startPlanned: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Data zakończenia</label>
                                    <input
                                        type="date"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                                        value={formData.endPlanned}
                                        onChange={e => setFormData({ ...formData, endPlanned: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Opis (opcjonalnie)</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 h-20"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                disabled={!formData.name}
                            >
                                Zapisz
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
