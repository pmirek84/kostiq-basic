import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { CalendarEvent, CalendarEventType } from '../../models/calendar';
import { useTiCo } from '../../context/TiCoContext';
import { useJobs } from '../../context/JobsContext';
import { useOffers } from '../../context/OffersContext';
import { useMeasurements } from '../../hooks/useMeasurements';

interface AddEventDialogProps {
    onClose: () => void;
    onSave: (event: Partial<CalendarEvent>) => void;
    onDelete?: (id: string) => void;
    selectedDate: Date;
    initialEvent?: CalendarEvent | null;
}

export default function AddEventDialog({ onClose, onSave, onDelete, selectedDate, initialEvent }: AddEventDialogProps) {
    const [formData, setFormData] = useState({
        title: initialEvent?.title || '',
        subtitle: initialEvent?.subtitle || '',
        type: initialEvent?.type || 'custom' as CalendarEventType,
        team: initialEvent?.team?.join(', ') || '',
        startDate: initialEvent?.start ? initialEvent.start.slice(0, 16) : selectedDate.toISOString().slice(0, 16),
        endDate: initialEvent?.end ? initialEvent.end.slice(0, 16) : new Date(selectedDate.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16),
        relatedId: initialEvent?.relatedId || ''
    });

    const isEditing = !!initialEvent;

    const { employees: ticoEmployees } = useTiCo(); // Use TiCo employees
    const { jobs } = useJobs();
    const { offers } = useOffers();
    const { measurements } = useMeasurements();

    const [teamInput, setTeamInput] = useState('');
    const [measurementContext, setMeasurementContext] = useState<'standalone' | 'offer' | 'job'>('standalone');

    const toggleTeamMember = (member: string) => {
        const currentTeam = formData.team ? formData.team.split(',').map(s => s.trim()).filter(Boolean) : [];
        const newTeam = currentTeam.includes(member)
            ? currentTeam.filter(m => m !== member)
            : [...currentTeam, member];
        setFormData({ ...formData, team: newTeam.join(', ') });
    };

    const addCustomTeamMember = () => {
        if (!teamInput.trim()) return;
        const currentTeam = formData.team ? formData.team.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (!currentTeam.includes(teamInput.trim())) {
            setFormData({ ...formData, team: [...currentTeam, teamInput.trim()].join(', ') });
        }
        setTeamInput('');
    };

    const currentTeamList = formData.team ? formData.team.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Helper to get full name
    const getEmployeeName = (emp: any) => `${emp.firstName} ${emp.lastName}`;
    const availableEmployeeNames = ticoEmployees.map(getEmployeeName);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: initialEvent?.id, // Pass ID if editing
            title: formData.title,
            subtitle: formData.subtitle,
            type: formData.type,
            team: formData.team ? formData.team.split(',').map(s => s.trim()).filter(Boolean) : undefined,
            start: new Date(formData.startDate).toISOString(),
            end: new Date(formData.endDate).toISOString(),
            relatedId: formData.relatedId || (initialEvent?.relatedId || crypto.randomUUID()),
            status: 'planned'
        });
    };

    const handleDelete = () => {
        if (!initialEvent || !onDelete) return;
        if (confirm('Czy na pewno chcesz usunąć to zdarzenie?')) {
            onDelete(initialEvent.id);
        }
    };

    // Auto-fill title based on selection
    const handleRelatedIdChange = (id: string) => {
        let newTitle = formData.title;
        if (formData.type === 'job') {
            const job = jobs.find(j => j.id === id);
            if (job) newTitle = `Zlecenie: ${job.name}`;
        } else if (formData.type === 'offer') {
            const offer = offers.find(o => o.id === id);
            if (offer) newTitle = `Oferta: ${offer.title}`;
        } else if (formData.type === 'measurement') {
            if (measurementContext === 'standalone') {
                const m = measurements.find(m => m.id === id);
                if (m) newTitle = `Pomiar: ${m.clientName}`;
            } else if (measurementContext === 'offer') {
                const o = offers.find(o => o.id === id);
                if (o) newTitle = `Pomiar do oferty: ${o.number}`;
            } else if (measurementContext === 'job') {
                const j = jobs.find(j => j.id === id);
                if (j) newTitle = `Pomiar do zlecenia: ${j.jobCode}`;
            }
        }

        setFormData({ ...formData, relatedId: id, title: newTitle });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {isEditing ? 'Edytuj zdarzenie' : 'Dodaj zdarzenie'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">

                    {/* Event Type Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Typ zdarzenia</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'custom', label: 'Inne / Notatka' },
                                { id: 'job', label: 'Zlecenie' },
                                { id: 'offer', label: 'Oferta' },
                                { id: 'measurement', label: 'Pomiar' }
                            ].map(type => (
                                <label key={type.id} className={`flex items-center justify-center p-2 rounded-md border cursor-pointer text-sm ${formData.type === type.id ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium' : 'border-gray-200 hover:bg-gray-50'}`}>
                                    <input
                                        type="radio"
                                        name="type"
                                        value={type.id}
                                        checked={formData.type === type.id}
                                        onChange={() => setFormData({ ...formData, type: type.id as CalendarEventType, relatedId: '' })}
                                        className="sr-only"
                                    />
                                    {type.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Dynamic Selection Dropdown */}
                    {formData.type === 'job' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Wybierz Zlecenie</label>
                            <select
                                value={formData.relatedId}
                                onChange={(e) => handleRelatedIdChange(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="">-- Wybierz zlecenie --</option>
                                {jobs.map(job => (
                                    <option key={job.id} value={job.id}>{job.jobCode} - {job.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {formData.type === 'offer' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Wybierz Ofertę</label>
                            <select
                                value={formData.relatedId}
                                onChange={(e) => handleRelatedIdChange(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="">-- Wybierz ofertę --</option>
                                {offers.map(offer => (
                                    <option key={offer.id} value={offer.id}>{offer.number} - {offer.title}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {formData.type === 'measurement' && (
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Dotyczy</label>

                            {/* Measurement Context Switcher */}
                            <div className="flex rounded-md shadow-sm" role="group">
                                <button
                                    type="button"
                                    onClick={() => setMeasurementContext('standalone')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-l-lg border ${measurementContext === 'standalone' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                >
                                    Lista pomiarów
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMeasurementContext('offer')}
                                    className={`px-3 py-1.5 text-xs font-medium border-t border-b ${measurementContext === 'offer' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                >
                                    Do Oferty
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMeasurementContext('job')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-r-lg border ${measurementContext === 'job' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                >
                                    Do Zlecenia
                                </button>
                            </div>

                            {/* Context Specific Selects */}
                            {measurementContext === 'standalone' && (
                                <div>
                                    <select
                                        value={formData.relatedId}
                                        onChange={(e) => handleRelatedIdChange(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    >
                                        <option value="">-- Wybierz klienta (pomiar) --</option>
                                        {measurements.map(m => (
                                            <option key={m.id} value={m.id}>{m.clientName} - {m.address}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {measurementContext === 'offer' && (
                                <div>
                                    <select
                                        value={formData.relatedId}
                                        onChange={(e) => handleRelatedIdChange(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    >
                                        <option value="">-- Wybierz ofertę --</option>
                                        {offers.map(offer => (
                                            <option key={offer.id} value={offer.id}>{offer.number} - {offer.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {measurementContext === 'job' && (
                                <div>
                                    <select
                                        value={formData.relatedId}
                                        onChange={(e) => handleRelatedIdChange(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    >
                                        <option value="">-- Wybierz zlecenie --</option>
                                        {jobs.map(job => (
                                            <option key={job.id} value={job.id}>{job.jobCode} - {job.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Basic Fields */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tytuł</label>
                        <input
                            type="text"
                            required
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            placeholder="np. Montaż okien"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Opis / Szczegóły</label>
                        <textarea
                            value={formData.subtitle}
                            onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            rows={3}
                            placeholder="Dodatkowe informacje..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Początek</label>
                            <input
                                type="datetime-local"
                                required
                                value={formData.startDate}
                                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Koniec</label>
                            <input
                                type="datetime-local"
                                required
                                value={formData.endDate}
                                onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Team Selection - Hide for Offer type */}
                    {formData.type !== 'offer' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Przypisany Zespół</label>

                            {/* Selected Team Members */}
                            <div className="flex flex-wrap gap-2 mb-3 min-h-[32px]">
                                {currentTeamList.map(member => (
                                    <span key={member} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {member}
                                        <button
                                            type="button"
                                            onClick={() => toggleTeamMember(member)}
                                            className="ml-1.5 inline-flex flex-shrink-0 h-4 w-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500 focus:outline-none"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                {currentTeamList.length === 0 && <span className="text-gray-400 text-sm italic">Brak przypisanych osób</span>}
                            </div>

                            {/* Available Employees */}
                            <div className="border rounded-md p-3 mb-3 bg-gray-50 max-h-40 overflow-y-auto">
                                <div className="text-xs text-gray-500 mb-2 font-medium">Kliknij, aby dodać pracownika:</div>
                                <div className="flex flex-wrap gap-2">
                                    {availableEmployeeNames.filter(name => !currentTeamList.includes(name)).map(name => (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => toggleTeamMember(name)}
                                            className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
                                        >
                                            + {name}
                                        </button>
                                    ))}
                                    {availableEmployeeNames.length === 0 && <span className="text-xs text-gray-400 italic">Brak zdefiniowanych pracowników</span>}
                                </div>
                            </div>

                            {/* Custom Input */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={teamInput}
                                    onChange={e => setTeamInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTeamMember())}
                                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                                    placeholder="Dodaj inną osobę..."
                                />
                                <button
                                    type="button"
                                    onClick={addCustomTeamMember}
                                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
                                >
                                    Dodaj
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t mt-4">
                        {isEditing && onDelete ? (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                            >
                                Usuń
                            </button>
                        ) : (
                            <div></div>
                        )}

                        <div className="flex space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center"
                            >
                                <Save className="h-4 w-4 mr-2" />
                                {isEditing ? 'Zapisz zmiany' : 'Dodaj'}
                            </button>
                        </div>
                    </div>
                </form >
            </div >
        </div >
    );
}
