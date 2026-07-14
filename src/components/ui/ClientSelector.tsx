import { useState, useRef, useEffect } from 'react';
import { useClients } from '../../context/ClientsContext';
import { Check, ChevronsUpDown, Plus, User, Building2, X, Loader2 } from 'lucide-react';
import { Button } from './Button';
import type { Client } from '../../models/types';

interface ClientSelectorProps {
    value: string; // clientId
    onChange: (clientId: string) => void;
}

// ─── Quick New Client Modal ───────────────────────────────────────────────────
function NewClientModal({
    initialName,
    onSave,
    onCancel,
}: {
    initialName: string;
    onSave: (clientId: string) => void;
    onCancel: () => void;
}) {
    const { addClient } = useClients();
    const [type, setType] = useState<'person' | 'company'>('person');
    const [name, setName] = useState(initialName);
    const [lastName, setLastName] = useState('');
    const [company, setCompany] = useState(type === 'company' ? initialName : '');
    const [nip, setNip] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (type === 'person' && !name.trim()) { setError('Imię jest wymagane'); return; }
        if (type === 'company' && !company.trim()) { setError('Nazwa firmy jest wymagana'); return; }
        setSaving(true);
        try {
            const newClient: Client = {
                id: crypto.randomUUID(),
                type,
                name: type === 'company' ? company.trim() : name.trim(),
                lastName: type === 'person' ? lastName.trim() : '',
                company: type === 'company' ? company.trim() : '',
                nip: nip.trim(),
                phone: phone.trim(),
                email: email.trim(),
                notes: '',
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                addresses: [],
            } as any;
            await addClient(newClient);
            onSave(newClient.id);
        } catch (e: any) {
            setError('Błąd zapisu: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white">
                    <div className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-[#21808D]" />
                        <h3 className="font-bold text-gray-900">Nowy klient</h3>
                    </div>
                    <button onClick={onCancel} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Type toggle */}
                <div className="px-6 pt-5 pb-2">
                    <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-4">
                        <button
                            type="button"
                            onClick={() => setType('person')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${type === 'person' ? 'bg-[#21808D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <User className="w-4 h-4" /> Osoba prywatna
                        </button>
                        <button
                            type="button"
                            onClick={() => setType('company')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${type === 'company' ? 'bg-[#21808D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Building2 className="w-4 h-4" /> Firma
                        </button>
                    </div>

                    <div className="space-y-3">
                        {type === 'person' ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Imię *</label>
                                    <input value={name} onChange={e => setName(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 focus:outline-none"
                                        placeholder="Jan" autoFocus />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Nazwisko</label>
                                    <input value={lastName} onChange={e => setLastName(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 focus:outline-none"
                                        placeholder="Kowalski" />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Nazwa firmy *</label>
                                    <input value={company} onChange={e => setCompany(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 focus:outline-none"
                                        placeholder="Budex Sp. z o.o." autoFocus />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">NIP</label>
                                    <input value={nip} onChange={e => setNip(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 focus:outline-none"
                                        placeholder="1234567890" />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Telefon</label>
                                <input value={phone} onChange={e => setPhone(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 focus:outline-none"
                                    placeholder="+48 600 000 000" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Email</label>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 focus:outline-none"
                                    placeholder="email@firma.pl" />
                            </div>
                        </div>

                        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                        Anuluj
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2 bg-[#21808D] text-white text-sm font-semibold rounded-xl hover:bg-[#1a646e] transition-colors flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Zapisz i wybierz
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── ClientSelector ───────────────────────────────────────────────────────────
export function ClientSelector({ value, onChange }: ClientSelectorProps) {
    const { clients } = useClients();
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const selectedClient = clients.find((client) => client.id === value);

    const displayName = selectedClient
        ? (selectedClient.type === 'company' && selectedClient.company
            ? selectedClient.company
            : `${selectedClient.name} ${selectedClient.lastName}`)
        : (value || 'Wybierz klienta...');

    const filteredClients = clients.filter((client) =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.nip && client.nip.includes(searchTerm)) ||
        (client.company && client.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (client.lastName && client.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (clientId: string) => {
        onChange(clientId);
        setOpen(false);
        setSearchTerm('');
    };

    const handleNewClientSaved = (clientId: string) => {
        setShowNewModal(false);
        setOpen(false);
        onChange(clientId);
    };

    return (
        <>
            <div className="relative" ref={wrapperRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Klient</label>
                <Button
                    variant="secondary"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal text-left"
                    onClick={() => setOpen(!open)}
                >
                    <span className="truncate block">{displayName}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>

                {open && (
                    <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                        {/* Search */}
                        <div className="sticky top-0 bg-white p-2 border-b">
                            <input
                                type="text"
                                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#21808D]"
                                placeholder="Szukaj lub wpisz..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                            />
                        </div>

                        {/* "Use typed" quick option */}
                        {searchTerm && !filteredClients.some(c =>
                            (c.company || `${c.name} ${c.lastName}`).toLowerCase() === searchTerm.toLowerCase()
                        ) && (
                                <div
                                    className="relative cursor-pointer select-none py-2 pl-4 pr-4 text-blue-600 hover:bg-blue-50 font-medium text-sm"
                                    onClick={() => handleSelect(searchTerm)}
                                >
                                    Użyj wpisanego: „{searchTerm}"
                                </div>
                            )}

                        {/* Client list */}
                        {filteredClients.length === 0 && !searchTerm ? (
                            <div className="py-2 px-4 text-gray-500 text-sm">Brak klientów.</div>
                        ) : (
                            filteredClients.map((client) => (
                                <div
                                    key={client.id}
                                    className={`relative cursor-pointer select-none py-2 pl-10 pr-4 ${selectedClient?.id === client.id
                                            ? 'bg-teal-50 text-teal-900'
                                            : 'text-gray-900 hover:bg-gray-100'
                                        }`}
                                    onClick={() => handleSelect(client.id)}
                                >
                                    <span className={`block truncate ${selectedClient?.id === client.id ? 'font-medium' : 'font-normal'}`}>
                                        {client.type === 'company' && client.company
                                            ? client.company
                                            : `${client.name} ${client.lastName}`}
                                    </span>
                                    {selectedClient?.id === client.id && (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-teal-600">
                                            <Check className="h-5 w-5" aria-hidden="true" />
                                        </span>
                                    )}
                                    {client.nip && <span className="block text-xs text-gray-400">NIP: {client.nip}</span>}
                                </div>
                            ))
                        )}

                        {/* ─── + Nowy klient ─── */}
                        <div className="sticky bottom-0 border-t border-gray-100 bg-white">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setShowNewModal(true); setOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#21808D] hover:bg-teal-50 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Nowy klient
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* New client modal */}
            {showNewModal && (
                <NewClientModal
                    initialName={searchTerm}
                    onSave={handleNewClientSaved}
                    onCancel={() => setShowNewModal(false)}
                />
            )}
        </>
    );
}
