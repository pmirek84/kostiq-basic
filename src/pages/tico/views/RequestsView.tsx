import { useState } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { Calendar, DollarSign, FileText, CheckCircle, XCircle } from 'lucide-react';
// date-fns removed as string dates are used directly
import type { Request } from '../../../models/types';

export const RequestsView = () => {
    const { requests, updateRequestStatus, employees } = useTiCo();
    const [filterStatus, setFilterStatus] = useState<'all' | 'oczekujący' | 'zaakceptowany'>('all');

    const filteredRequests = requests
        .filter(r => filterStatus === 'all' || r.status === filterStatus)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const getPersonName = (id: string) => {
        const emp = employees.find(e => e.id === id);
        return emp ? `${emp.firstName} ${emp.lastName}` : 'Nieznany';
    };

    const getTypeLabel = (type: Request['type']) => {
        switch (type) {
            case 'urlop': return <span className="flex items-center gap-1 text-blue-600"><Calendar className="w-4 h-4" /> Urlop</span>;
            case 'zaliczka': return <span className="flex items-center gap-1 text-green-600"><DollarSign className="w-4 h-4" /> Zaliczka</span>;
            case 'koszt': return <span className="flex items-center gap-1 text-purple-600"><FileText className="w-4 h-4" /> Zwrot Kosztów</span>;
        }
    };

    const getStatusBadge = (status: Request['status']) => {
        switch (status) {
            case 'oczekujący': return <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs">Oczekujący</span>;
            case 'zaakceptowany': return <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs">Zaakceptowany</span>;
            case 'odrzucony': return <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Odrzucony</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Wnioski i Rozliczenia</h2>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filterStatus === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                    >
                        Wszystkie
                    </button>
                    <button
                        onClick={() => setFilterStatus('oczekujący')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filterStatus === 'oczekujący' ? 'bg-white shadow text-yellow-700' : 'text-gray-500'}`}
                    >
                        Oczekujące
                    </button>
                    <button
                        onClick={() => setFilterStatus('zaakceptowany')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filterStatus === 'zaakceptowany' ? 'bg-white shadow text-green-700' : 'text-gray-500'}`}
                    >
                        Zatwierdzone
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-3">Typ</th>
                            <th className="px-6 py-3">Pracownik</th>
                            <th className="px-6 py-3">Szczegóły (Data / Kwota)</th>
                            <th className="px-6 py-3">Opis</th>
                            <th className="px-6 py-3 text-center">Status</th>
                            <th className="px-6 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredRequests.map(req => (
                            <tr key={req.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium">{getTypeLabel(req.type)}</td>
                                <td className="px-6 py-4 text-gray-900">{getPersonName(req.employeeId)}</td>
                                <td className="px-6 py-4">
                                    {req.type === 'urlop' ? (
                                        <span className="font-mono text-xs">{req.dateFrom} - {req.dateTo}</span>
                                    ) : (
                                        <span className="font-bold text-gray-900">{req.amount} PLN</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-gray-500 text-xs italic max-w-xs truncate" title={req.description}>
                                    {req.description || '-'}
                                </td>
                                <td className="px-6 py-4 text-center">{getStatusBadge(req.status)}</td>
                                <td className="px-6 py-4 text-right">
                                    {req.status === 'oczekujący' && (
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => updateRequestStatus(req.id, 'zaakceptowany')}
                                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                title="Akceptuj"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => updateRequestStatus(req.id, 'odrzucony')}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                title="Odrzuć"
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredRequests.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 italic">Brak wniosków spełniających kryteria.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
