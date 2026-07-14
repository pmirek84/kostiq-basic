
import { useState } from 'react';
import type { SiteLogEntry, SiteLogEntryType } from '../../../models/types';
import { Calendar, Cloud, Users, User, FileText, Filter, DollarSign } from 'lucide-react';

interface SiteLogTabProps {
    entries: SiteLogEntry[];
    onAddEntry: (entry: any) => void;
    onConvertToExtraWork?: (entry: SiteLogEntry) => void;
}

export const SiteLogTab = ({ entries = [], onAddEntry, onConvertToExtraWork }: SiteLogTabProps) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [filterType, setFilterType] = useState<SiteLogEntryType | 'all'>('all');
    // const [filterDate, setFilterDate] = useState('');

    const filteredEntries = entries.filter(e => {
        if (filterType !== 'all' && e.type !== filterType) return false;
        return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-900">Dziennik budowy</h3>
                    <div className="flex items-center gap-2 text-sm">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                            className="border-gray-300 rounded-md text-sm"
                        >
                            <option value="all">Wszystkie wpisy</option>
                            <option value="dzienny">Raport dzienny</option>
                            <option value="problem">Problem / Usterka</option>
                            <option value="zmiana_zakresu">Zmiana zakresu</option>
                            <option value="odbiór_częściowy">Odbiór częściowy</option>
                        </select>
                    </div>
                </div>
                <button
                    onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredEntries, null, 2));
                        const downloadAnchorNode = document.createElement('a');
                        downloadAnchorNode.setAttribute("href", dataStr);
                        downloadAnchorNode.setAttribute("download", "dziennik_budowy.json");
                        document.body.appendChild(downloadAnchorNode);
                        downloadAnchorNode.click();
                        downloadAnchorNode.remove();
                    }}
                    className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
                >
                    <FileText className="w-4 h-4" />
                    Eksport JSON
                </button>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                    + Dodaj wpis
                </button>
            </div>

            {filteredEntries.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Brak wpisów w dzienniku</p>
                    <p className="text-sm text-gray-400 mt-1">Dodaj pierwszy raport dzienny lub notatkę</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredEntries.map(entry => (
                        <SiteLogEntryCard key={entry.id} entry={entry} onConvertToExtraWork={onConvertToExtraWork} />
                    ))}
                </div>
            )}

            {isFormOpen && (
                <SiteLogForm onClose={() => setIsFormOpen(false)} onSubmit={onAddEntry} />
            )}
        </div>
    );
};

const SiteLogEntryCard = ({ entry, onConvertToExtraWork }: { entry: SiteLogEntry, onConvertToExtraWork?: (entry: SiteLogEntry) => void }) => {
    const getTypeConfig = (type: SiteLogEntryType) => {
        switch (type) {
            case 'dzienny': return { color: 'bg-green-100 text-green-800', label: 'Raport Dzienny' };
            case 'problem': return { color: 'bg-red-100 text-red-800', label: 'Problem / Awaria' };
            case 'zmiana_zakresu': return { color: 'bg-amber-100 text-amber-800', label: 'Zmiana Zakresu' };
            case 'odbiór_częściowy': return { color: 'bg-blue-100 text-blue-800', label: 'Odbiór Częściowy' };
            default: return { color: 'bg-gray-100 text-gray-800', label: type };
        }
    };

    const config = getTypeConfig(entry.type);

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
                <div className="flex gap-3 items-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${config.color}`}>
                        {config.label}
                    </span>
                    <div className="flex items-center text-sm text-gray-500 gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(entry.date).toLocaleDateString('pl-PL')}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {entry.type === 'zmiana_zakresu' && onConvertToExtraWork && (
                        <button
                            onClick={() => onConvertToExtraWork(entry)}
                            className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1 rounded border border-amber-200 flex items-center gap-1 transition-colors"
                            title="Utwórz pracę dodatkową z tego zgłoszenia"
                        >
                            <DollarSign className="w-3 h-3" />
                            + Praca dodatkowa
                        </button>
                    )}
                    <div className="text-xs text-gray-400">
                        ID: {entry.id.slice(0, 8)}
                    </div>
                </div>
            </div>

            <p className="text-gray-800 whitespace-pre-wrap mb-4">{entry.description}</p>

            <div className="flex gap-6 text-sm text-gray-500 pt-3 border-t border-gray-100">
                {entry.weather && (
                    <div className="flex items-center gap-2">
                        <Cloud className="w-4 h-4" />
                        <span>Pogoda: {entry.weather}</span>
                    </div>
                )}
                {entry.workersPresent !== undefined && (
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>Pracowników: {entry.workersPresent}</span>
                    </div>
                )}
                {entry.clientRepresentative && (
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>Klient: {entry.clientRepresentative}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// Placeholder for Form - implementing next
const SiteLogForm = ({ onClose, onSubmit }: any) => {
    const [formData, setFormData] = useState({
        type: 'dzienny',
        date: new Date().toISOString().split('T')[0],
        description: '',
        weather: '',
        workersPresent: 0,
        clientRepresentative: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                <h3 className="text-lg font-bold mb-4">Nowy wpis do dziennika</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Typ wpisu</label>
                            <select
                                className="w-full border rounded px-3 py-2"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="dzienny">Raport Dzienny</option>
                                <option value="problem">Problem / Awaria</option>
                                <option value="zmiana_zakresu">Zmiana Zakresu</option>
                                <option value="odbiór_częściowy">Odbiór Częściowy</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Data</label>
                            <input
                                type="date"
                                className="w-full border rounded px-3 py-2"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Opis / Przebieg prac</label>
                        <textarea
                            className="w-full border rounded px-3 py-2 h-32"
                            placeholder="Co dzisiaj zostało zrobione? Jakie wystąpiły problemy?"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            required
                        />
                    </div>

                    {/* Conditional fields based on type could go here, but keeping standard for now */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Pogoda</label>
                            <input
                                type="text"
                                className="w-full border rounded px-3 py-2"
                                placeholder="np. Słonecznie, 20°C"
                                value={formData.weather}
                                onChange={e => setFormData({ ...formData, weather: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Liczba pracowników</label>
                            <input
                                type="number"
                                className="w-full border rounded px-3 py-2"
                                value={formData.workersPresent}
                                onChange={e => setFormData({ ...formData, workersPresent: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Anuluj</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Dodaj wpis</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
