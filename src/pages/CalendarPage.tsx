import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminCalendar from '../components/calendar/AdminCalendar';
import { ArrowLeft } from 'lucide-react';

export default function CalendarPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const fromPath = searchParams.get('from');

    return (
        <div className="max-w-6xl mx-auto p-6 bg-white rounded-[28px] shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Kalendarz Pracy i Obłożenia</h1>
                {fromPath && (
                    <button
                        onClick={() => navigate(fromPath)}
                        className="flex items-center gap-1.5 px-4 py-2 border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm font-semibold transition-all text-zinc-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Powrót do Zlecenia
                    </button>
                )}
            </div>
            <AdminCalendar />
        </div>
    );
}
