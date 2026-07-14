import { useParams, Link } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { ArrowLeft, MapPin, Calendar, Briefcase } from 'lucide-react';
import JobInvoicesTab from '../components/jobs/JobInvoicesTab';

export default function InvoiceDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const { jobs } = useJobs();

    const job = jobs.find(j => j.id === id);

    if (!job) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <Link to="/orders" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-6 group">
                    <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
                    Powrót do listy faktur
                </Link>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
                    <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Zlecenie nie znalezione</h2>
                    <p className="text-gray-500 mt-2">Zlecenie o ID <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{id}</code> nie istnieje lub zostało usunięte.</p>
                </div>
            </div>
        );
    }

    const statusLabel: Record<string, { text: string; color: string }> = {
        planned: { text: 'Planowane', color: 'bg-gray-100 text-gray-700' },
        in_progress: { text: 'W toku', color: 'bg-blue-100 text-blue-800' },
        done: { text: 'Zakończone', color: 'bg-green-100 text-green-800' },
        cancelled: { text: 'Anulowane', color: 'bg-red-100 text-red-800' },
    };
    const st = statusLabel[job.status] || statusLabel.planned;

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {/* ─ Breadcrumb / Back ─ */}
            <Link to="/orders" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 group">
                <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
                Powrót do listy faktur
            </Link>

            {/* ─ Job Header Card ─ */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-gray-900">{job.name}</h1>
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-mono">
                                {job.jobCode}
                            </span>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.color}`}>
                                {st.text}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                            {job.location && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {job.location}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                Utworzono: {new Date(job.createdAt).toLocaleDateString('pl-PL')}
                            </span>
                        </div>
                    </div>
                    <Link
                        to={`/jobs/${job.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                    >
                        Otwórz pełne zlecenie →
                    </Link>
                </div>
            </div>

            {/* ─ Invoices Tab (reused from JobDetailsPage) ─ */}
            <JobInvoicesTab job={job} />
        </div>
    );
}
