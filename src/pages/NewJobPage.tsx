import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../context/JobsContext';
import { useClients } from '../context/ClientsContext';
import { ChevronLeft, Save } from 'lucide-react';
import type { Job, Client } from '../models/types';

export const NewJobPage = () => {
    const navigate = useNavigate();
    const { addJob } = useJobs();
    const { clients } = useClients();

    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<Job>>({
        name: '',
        clientId: '',
        status: 'draft',
        location: '',
        plannedStartDate: '',
        plannedEndDate: '',
        notesInternal: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const selectedClient = clients.find(c => c.id === formData.clientId);

            // Helper to get client name safely
            const getClientName = (c: Client | undefined) => {
                if (!c) return 'Unknown Client';
                if (c.type === 'company' && c.company) return c.company;
                return `${c.name || ''} ${c.lastName || ''}`.trim() || 'Client';
            };

            addJob({
                ...(formData as any), // Cast to any to avoid partial issues during creation if strict
                clientName: getClientName(selectedClient),
                riskFlag: 'none',
                // Initialize default financials
                revenuePlannedNet: 0,
                revenueActualNet: 0,
                plannedTotalCost: 0,
                actualTotalCost: 0,
                documentCount: 0,
                checklistCount: 0
            });

            navigate('/jobs');
        } catch (error) {
            console.error('Failed to create job:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <button onClick={() => navigate('/jobs')} className="hover:text-gray-900 flex items-center">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Wróć do listy
                </button>
                <span>/</span>
                <span>Nowe zlecenie</span>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h1 className="text-xl font-bold text-gray-900">Utwórz nowe zlecenie</h1>
                    <p className="text-sm text-gray-500 mt-1">Wypełnij podstawowe dane, aby utworzyć szkic zlecenia.</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nazwa zlecenia <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="np. Montaż konstrukcji stalowej - Hala A"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {/* Client */}
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Klient <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="clientId"
                                required
                                value={formData.clientId}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                            >
                                <option value="">Wybierz klienta...</option>
                                {clients.map(client => (
                                    <option key={client.id} value={client.id}>
                                        {client.type === 'company' ? client.company : `${client.name || ''} ${client.lastName || ''}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Location */}
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Lokalizacja <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="location"
                                required
                                value={formData.location}
                                onChange={handleChange}
                                placeholder="Miasto, Ulica"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {/* Dates */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Planowany Start
                            </label>
                            <input
                                type="date"
                                name="plannedStartDate"
                                value={formData.plannedStartDate}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Planowany Koniec
                            </label>
                            <input
                                type="date"
                                name="plannedEndDate"
                                value={formData.plannedEndDate}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {/* Notes */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Uwagi wewnętrzne
                            </label>
                            <textarea
                                name="notesInternal"
                                rows={3}
                                value={formData.notesInternal}
                                onChange={handleChange}
                                placeholder="Dodatkowe informacje dla zespołu..."
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100 gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/jobs')}
                            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isLoading ? 'Tworzenie...' : 'Utwórz zlecenie'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewJobPage;
