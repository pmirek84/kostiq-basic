import { useState } from 'react';
import {
    FileText,
    Plus,
    Download,
    Edit2,
    Calendar,
    Trash2,
    // CheckCircle2,
} from 'lucide-react';
import type { ClientReportStatus, Job } from '../../../models/types';
import { useClientReports } from '../../../context/ClientReportsContext';
import { format } from 'date-fns';
import { CreateReportWizard } from './CreateReportWizard';
// import { pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { generateClientReportPdf } from '../../../utils/pdfGenerator';

interface ClientReportsTabProps {
    job: Job;
}

export const ClientReportsTab = ({ job }: ClientReportsTabProps) => {
    const { getReportsByJob, deleteReport } = useClientReports();
    const navigate = useNavigate();
    const [isWizardOpen, setIsWizardOpen] = useState(false); // Stub for Wizard

    // In a real implementation we would open a Wizard modal. 
    // For this step I'll just have a placeholder or basic create.
    // Actually the prompt says: "Implement a 'Create Client Report' wizard... generating a draft... redirecting to edit view".
    // I will implement the Wizard in the next step. Here I just need the list.

    const reports = getReportsByJob(job.id);

    const getStatusColor = (status: ClientReportStatus) => {
        switch (status) {
            case 'draft': return 'bg-gray-100 text-gray-700';
            case 'ready': return 'bg-blue-100 text-blue-700';
            case 'sent': return 'bg-green-100 text-green-700';
            default: return 'bg-gray-100';
        }
    };

    const getStatusLabel = (status: ClientReportStatus) => {
        switch (status) {
            case 'draft': return 'Szkic';
            case 'ready': return 'Gotowy';
            case 'sent': return 'Wysłany';
            default: return status;
        }
    };

    const handleCreateClick = () => {
        // We will implement Wizard in next step. 
        // For now, let's assuming we navigate to a wizard route or open a modal.
        // Let's use a modal. I'll pass a state to open it if it was here, 
        // but for now let's just log or waiting for Wizard component.
        // I'll create a CreateReportWizard component next and import it here.
        setIsWizardOpen(true);
    };

    const handleEdit = (reportId: string) => {
        // Navigate to edit view. Where should it be?
        // Prompt says "Create an 'Edit Report' view... redirecting to the edit view".
        // Is it a separate route or a full-screen view inside the tab?
        // "redirecting to the edit view" implies a route usually.
        // Let's assume a route `/jobs/:id/reports/:reportId`.
        navigate(`/jobs/${job.id}/reports/${reportId}`);
    };

    const handleDelete = async (reportId: string) => {
        if (confirm('Czy na pewno chcesz usunąć ten raport?')) {
            await deleteReport(reportId);
        }
    };

    const handleDownload = (report: any) => {
        try {
            generateClientReportPdf(report, job);
        } catch (error) {
            console.error("PDF generation failed", error);
            alert("Błąd generowania PDF. Sprawdź konsolę.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Raporty dla klienta</h3>
                <button
                    onClick={handleCreateClick}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Utwórz nowy raport
                </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tytuł</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Okres</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data utworzenia</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {reports.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    Brak raportów. Utwórz pierwszy raport korzystając z przycisku powyżej.
                                </td>
                            </tr>
                        ) : (
                            reports.map((report) => (
                                <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <FileText className="w-5 h-5 text-gray-400 mr-3" />
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{report.title}</div>
                                                <div className="text-xs text-gray-500">{report.generatedBy}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center text-sm text-gray-500">
                                            <Calendar className="w-4 h-4 mr-1" />
                                            {format(new Date(report.periodStart), 'dd.MM')} - {format(new Date(report.periodEnd), 'dd.MM.yyyy')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(report.status)}`}>
                                            {getStatusLabel(report.status)}
                                        </span>
                                        {report.sentAt && (
                                            <div className="text-xs text-gray-400 mt-1">
                                                Wysłano: {format(new Date(report.sentAt), 'dd.MM')}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {format(new Date(report.generatedAt), 'dd.MM.yyyy HH:mm')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(report.id)}
                                                className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded"
                                                title="Edytuj"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            {report.status !== 'draft' && (
                                                <button
                                                    onClick={() => handleDownload(report)}
                                                    className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded"
                                                    title="Pobierz PDF"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(report.id)}
                                                className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded"
                                                title="Usuń"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Wizard Modal */}
            {isWizardOpen && (
                <CreateReportWizard
                    isOpen={isWizardOpen}
                    onClose={() => setIsWizardOpen(false)}
                    jobId={job.id}
                    onReportCreated={(reportId) => navigate(`/jobs/${job.id}/reports/${reportId}`)}
                />
            )}
        </div>
    );
};
