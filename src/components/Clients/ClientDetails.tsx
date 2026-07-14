import { useState } from 'react';
import { ArrowLeft, Mail, Phone, MapPin, Building2, User, Edit2, Trash2, Calendar, FileText, CheckCircle, TrendingUp } from 'lucide-react';
import type { Client } from '../../models/types';
import { useClients } from '../../context/ClientsContext';
import { useOffers } from '../../context/OffersContext';
import { useJobs } from '../../context/JobsContext';

interface ClientDetailsProps {
    client: Client;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
}
export default function ClientDetails({ client, onBack, onEdit, onDelete }: ClientDetailsProps) {
    const { updateClient } = useClients();
    const { offers } = useOffers();
    const { jobs } = useJobs();
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [noteContent, setNoteContent] = useState(client.notes || '');


    const handleSaveNote = () => {
        updateClient(client.id, { notes: noteContent });
        setIsEditingNotes(false);
    };

    const getClientDisplayName = () => {
        if (client.type === 'company' && client.company) {
            return client.company;
        }
        return `${client.name} ${client.lastName}`;
    };

    const currentAddress = client.address?.[0];

    // Client stats
    const clientOffers = offers.filter(o => o.clientId === client.id);
    const clientJobs = jobs.filter(j => j.clientId === client.id);

    const totalOffersValue = clientOffers.reduce((sum, o) => sum + (o.totalGross || 0), 0);
    const totalJobsValue = clientJobs.reduce((sum, j) => sum + (j.totalPlannedRevenueNet || 0), 0);
    const totalActualRevenue = clientJobs.reduce((sum, j) => sum + (j.actualRevenue || 0), 0);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    <span>Powrót do listy</span>
                </button>

                <div className="flex space-x-3">
                    <button
                        onClick={onEdit}
                        className="btn-secondary"
                    >
                        <Edit2 className="h-4 w-4 mr-2" />
                        <span>Edytuj</span>
                    </button>
                    <button
                        onClick={onDelete}
                        className="flex items-center px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 border border-transparent rounded-md transition-colors shadow-sm text-sm font-medium"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        <span>Usuń</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Info Card */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center space-x-4">
                                <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200">
                                    {client.type === 'company' ? (
                                        <Building2 className="h-8 w-8 text-gray-500" />
                                    ) : (
                                        <User className="h-8 w-8 text-gray-500" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">{getClientDisplayName()}</h2>
                                    <div className="flex items-center space-x-3 mt-2">
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${client.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                                            client.status === 'potential' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                'bg-gray-50 text-gray-600 border-gray-200'
                                            }`}>
                                            {client.status === 'active' ? 'Aktywny' :
                                                client.status === 'potential' ? 'Potencjalny' : 'Nieaktywny'}
                                        </span>
                                        <span className="text-gray-500 text-sm flex items-center">
                                            <Calendar className="h-3.5 w-3.5 mr-1.5" />
                                            Dodano: {new Date(client.createdAt).toLocaleDateString('pl-PL')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Dane kontaktowe</h3>

                                <div className="flex items-center space-x-3 text-gray-700">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                    <span>{client.email}</span>
                                </div>

                                <div className="flex items-center space-x-3 text-gray-700">
                                    <Phone className="h-5 w-5 text-gray-400" />
                                    <span>+{client.countryCode || 48} {client.phone}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Dane adresowe</h3>

                                {currentAddress ? (
                                    <div className="flex items-start space-x-3 text-gray-700">
                                        <MapPin className="h-5 w-5 text-gray-400 mt-1" />
                                        <div>
                                            <p>{currentAddress.street}</p>
                                            <p>{currentAddress.zipCode} {currentAddress.city}</p>
                                            <p className="text-gray-500 text-sm mt-1">{currentAddress.country}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 italic">Brak danych adresowych</p>
                                )}
                            </div>
                        </div>

                        {client.type === 'company' && (client.nip || client.taxId) && (
                            <div className="mt-8 pt-6 border-t border-gray-200">
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Dane firmy</h3>
                                <div className="flex items-center space-x-2 text-gray-700">
                                    <span className="text-gray-500">NIP:</span>
                                    <span className="font-mono">{client.nip || client.taxId}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-gray-900 flex items-center">
                                <FileText className="h-5 w-5 mr-2 text-gray-400" />
                                Notatki
                            </h3>
                            {!isEditingNotes && (
                                <button
                                    onClick={() => {
                                        setNoteContent(client.notes || '');
                                        setIsEditingNotes(true);
                                    }}
                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                    title="Edytuj notatki"
                                >
                                    <Edit2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {isEditingNotes ? (
                            <div className="space-y-3">
                                <textarea
                                    value={noteContent}
                                    onChange={(e) => setNoteContent(e.target.value)}
                                    className="w-full min-h-[120px] p-3 text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                                    placeholder="Wpisz treść notatki..."
                                />
                                <div className="flex justify-end space-x-2">
                                    <button
                                        onClick={() => setIsEditingNotes(false)}
                                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                                    >
                                        Anuluj
                                    </button>
                                    <button
                                        onClick={handleSaveNote}
                                        className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                                    >
                                        Zapisz
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                {client.notes ? (
                                    <p className="text-gray-700 whitespace-pre-wrap">{client.notes}</p>
                                ) : (
                                    <p className="text-gray-500 italic">Brak notatek</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar / Stats */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Statystyki Klienta</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg group transition-colors hover:bg-blue-50">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-blue-100 rounded-md">
                                        <FileText className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <span className="text-gray-600">Oferty (Suma)</span>
                                </div>
                                <span className="text-gray-900 font-bold">{formatCurrency(totalOffersValue)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg group transition-colors hover:bg-green-50">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-green-100 rounded-md">
                                        <TrendingUp className="h-4 w-4 text-green-600" />
                                    </div>
                                    <span className="text-gray-600">Zlecenia (Suma)</span>
                                </div>
                                <span className="text-gray-900 font-bold">{formatCurrency(totalJobsValue)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg group transition-colors hover:bg-emerald-50">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-emerald-100 rounded-md">
                                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                                    </div>
                                    <span className="text-gray-600">Przychód Rzeczywisty</span>
                                </div>
                                <span className="text-emerald-700 font-bold">{formatCurrency(totalActualRevenue)}</span>
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-100">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Ostatnia Aktywność</h4>
                            <div className="space-y-3">
                                {[...clientOffers, ...clientJobs]
                                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                    .slice(0, 5)
                                    .map((activity, idx) => {
                                        const isOffer = 'number' in activity;
                                        return (
                                            <div key={idx} className="flex items-start space-x-3 text-xs">
                                                <div className="mt-0.5">
                                                    {isOffer ? (
                                                        <FileText className="h-3 w-3 text-blue-500" />
                                                    ) : (
                                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-gray-700 font-medium line-clamp-1">
                                                        {isOffer ? `Oferta: ${activity.number}` : `Zlecenie: ${activity.jobCode}`}
                                                    </p>
                                                    <p className="text-gray-400 text-[10px]">
                                                        {new Date(activity.createdAt).toLocaleDateString('pl-PL')}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {clientOffers.length === 0 && clientJobs.length === 0 && (
                                    <p className="text-gray-400 italic text-xs">Brak aktywności</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
