import { useState, useEffect } from 'react';
import { Users2, Plus, Download, Search, ArrowUpDown, Building2, User } from 'lucide-react';
import { useClients } from '../context/ClientsContext';
import type { Client } from '../models/types';
import ClientForm from '../components/Clients/ClientForm';
import ClientDetails from '../components/Clients/ClientDetails';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ActionButtons } from '../components/ui/ActionButtons';

export default function ClientsPage() {
    const { clients, addClient, updateClient } = useClients();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'status'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [viewState, setViewState] = useState<'list' | 'form' | 'details'>('list');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null);

    useEffect(() => {
        if (searchParams.get('action') === 'new' && viewState !== 'form') {
            const timer = setTimeout(() => {
                setEditingClient(null);
                setViewState('form');
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [searchParams, viewState]);

    const handleAddClient = () => {
        setEditingClient(null);
        setViewState('form');
    };

    const handleEditClient = (client: Client) => {
        setEditingClient(client);
        setViewState('form');
    };

    const handleViewDetails = (client: Client) => {
        setSelectedClient(client);
        setViewState('details');
    };

    const handleDeleteClient = (id: string) => {
        if (confirm('Czy na pewno chcesz zarchiwizować tego klienta? Jego zlecenia zostaną zachowane.')) {
            updateClient(id, { isActive: false } as Partial<Client>);
            if (selectedClient?.id === id) {
                setViewState('list');
                setSelectedClient(null);
            }
        }
    };

    const handleFormSubmit = async (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (editingClient) {
            updateClient(editingClient.id, {
                ...data,
                updatedAt: new Date().toISOString()
            });
        } else {
            addClient({
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ...data
            });
        }
        setViewState('list');
        setEditingClient(null);
    };

    const getClientDisplayName = (client: Client) => {
        if (client.type === 'company' && client.company) {
            return client.company;
        }
        return `${client.name} ${client.lastName}`;
    };

    const filteredClients = clients.filter(client => {
        // Hide archived clients
        if (client.isActive === false) return false;

        const searchString = client.type === 'company' && client.company
            ? client.company.toLowerCase()
            : `${client.name} ${client.lastName}`.toLowerCase();

        return searchString.includes(searchTerm.toLowerCase()) ||
            (client.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (client.nip?.includes(searchTerm));
    });

    const sortedClients = [...filteredClients].sort((a, b) => {
        if (sortBy === 'name') {
            const nameA = getClientDisplayName(a);
            const nameB = getClientDisplayName(b);
            return sortOrder === 'asc'
                ? nameA.localeCompare(nameB)
                : nameB.localeCompare(nameA);
        } else {
            return sortOrder === 'asc'
                ? (a.status || '').localeCompare(b.status || '')
                : (b.status || '').localeCompare(a.status || '');
        }
    });

    const handleSort = (key: 'name' | 'status') => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
    };

    const handleExportCSV = () => {
        const BOM = '\uFEFF';
        const headers = ['ID', 'Nazwa', 'Typ', 'NIP', 'Email', 'Telefon', 'Status', 'Data utworzenia'];

        const rows = sortedClients.map(c => [
            c.id,
            getClientDisplayName(c),
            c.type === 'company' ? 'Firma' : 'Osoba prywatna',
            c.nip || c.taxId || '',
            c.email,
            `+${c.countryCode || 48} ${c.phone}`,
            c.status,
            new Date(c.createdAt).toLocaleDateString('pl-PL')
        ]);

        const csvContent = BOM + [
            headers.join(';'),
            ...rows.map(row => row.map(field => {
                const s = String(field);
                if (s.includes(';') || s.includes('"') || s.includes('\n')) {
                    return `"${s.replace(/"/g, '""')}"`;
                }
                return s;
            }).join(';'))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `klienci_kostiq_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const activeClient = selectedClient ? clients.find(c => c.id === selectedClient.id) || selectedClient : null;

    if (viewState === 'details' && activeClient) {
        return (
            <ClientDetails
                key={activeClient.id}
                client={activeClient}
                onBack={() => setViewState('list')}
                onEdit={() => handleEditClient(activeClient)}
                onDelete={() => handleDeleteClient(activeClient.id)}
            />
        );
    }

    if (viewState === 'form') {
        return (
            <ClientForm
                client={editingClient}
                onSubmit={handleFormSubmit}
                onCancel={() => setViewState('list')}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-black/10 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                        <Users2 className="h-6 w-6 text-zinc-400" />
                        <h2 className="text-xl font-semibold text-zinc-900">Klienci</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="secondary" onClick={handleExportCSV}>
                            <Download className="h-4 w-4 mr-2" />
                            <span>Eksportuj</span>
                        </Button>
                        <Button onClick={handleAddClient}>
                            <Plus className="h-4 w-4 mr-2" />
                            <span>Nowy kontakt</span>
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Szukaj klientów..."
                            className="w-full pl-10 pr-4 py-2 text-sm border border-black/10 rounded-xl bg-zinc-50 text-zinc-900 focus:ring-2 focus:ring-[#21808D] outline-none transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl border border-black/10 bg-white p-1">
                            <button
                                onClick={() => handleSort('name')}
                                className={`flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${sortBy === 'name'
                                    ? 'bg-zinc-950 text-white shadow-sm'
                                    : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
                                    }`}
                            >
                                <span>Nazwa</span>
                                <ArrowUpDown className={`h-3.5 w-3.5 ml-2 ${sortBy === 'name' ? 'opacity-100' : 'opacity-40'}`} />
                            </button>
                            <button
                                onClick={() => handleSort('status')}
                                className={`flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${sortBy === 'status'
                                    ? 'bg-zinc-950 text-white shadow-sm'
                                    : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
                                    }`}
                            >
                                <span>Status</span>
                                <ArrowUpDown className={`h-3.5 w-3.5 ml-2 ${sortBy === 'status' ? 'opacity-100' : 'opacity-40'}`} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {sortedClients.length > 0 ? (
                <div className="bg-white rounded-2xl overflow-hidden border border-black/10">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-black/5">
                            <thead className="bg-zinc-50/50 border-b border-black/10">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Typ
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Nazwa
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Email
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Telefon
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                        Akcje
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-black/5">
                                {sortedClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {client.type === 'company' ? (
                                                <Building2 className="h-5 w-5 text-gray-400" />
                                            ) : (
                                                <User className="h-5 w-5 text-gray-400" />
                                            )}
                                        </td>
                                        <td
                                            className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-zinc-900 cursor-pointer hover:text-[#21808D] hover:underline"
                                            onClick={() => handleViewDetails(client)}
                                        >
                                            {getClientDisplayName(client)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                                            {client.email}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                                            +{client.countryCode || 48} {client.phone}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${client.status === 'active'
                                                ? 'bg-green-100 text-green-800'
                                                : client.status === 'potential'
                                                    ? 'bg-teal-50 text-teal-800 border border-teal-100/50'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {client.status === 'active' ? 'Aktywny'
                                                    : client.status === 'potential' ? 'Potencjalny'
                                                        : 'Nieaktywny'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                            <ActionButtons
                                                onView={() => handleViewDetails(client)}
                                                onEdit={() => handleEditClient(client)}
                                                onDelete={() => handleDeleteClient(client.id)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                    <Users2 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Brak klientów
                    </h3>
                    <p className="text-gray-500 mb-6">
                        Dodaj swojego pierwszego klienta, aby rozpocząć zarządzanie bazą klientów
                    </p>
                    <Button
                        onClick={handleAddClient}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        <span>Dodaj pierwszego klienta</span>
                    </Button>
                </div>
            )}
        </div>
    );
}
