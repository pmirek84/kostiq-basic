import React, { useState } from 'react';
import { X, Users, UserPlus, Trash2, Save } from 'lucide-react';
import { useJobTeam } from '../../hooks/useJobTeam';
import { useTiCo } from '../../context/TiCoContext';
import { useJobs } from '../../context/JobsContext';

interface TeamSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    // We still update stage details (start/location/notes) via parent, 
    // but assignments are handled internally.
    onSaveDetails: (details: { startTime?: string, location?: string, notes?: string }) => void;

    jobId: string;
    stageId: string;

    initialStartTime?: string;
    initialLocation?: string;
    initialNotes?: string;
    jobTitle: string;
    stageTitle: string;
}

export default function TeamSelectionDialog({
    isOpen,
    onClose,
    onSaveDetails,
    jobId,
    stageId,
    initialStartTime,
    initialLocation,
    initialNotes,
    jobTitle,
    stageTitle
}: TeamSelectionDialogProps) {
    const {
        employeeAssignments,
        addEmployeeAssignment,
        removeEmployeeAssignment,
        employees,
        getEmployee
    } = useJobTeam(jobId);

    const { crews, requests } = useTiCo();
    const { jobs } = useJobs();

    const [startTime, setStartTime] = useState(initialStartTime || '07:00');
    const [location, setLocation] = useState(initialLocation || '');
    const [notes, setNotes] = useState(initialNotes || '');

    // Local state for "Add Mode"
    const [viewMode, setViewMode] = useState<'list' | 'add_crew' | 'add_employee'>('list');
    const [selectedCrewId, setSelectedCrewId] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [hours, setHours] = useState(8);

    if (!isOpen) return null;

    // Find the current job and stage to get date range
    const currentJob = jobs.find(j => j.id === jobId);
    const currentStage = currentJob?.stages?.find(s => s.id === stageId);
    const stageStart = currentStage?.startPlanned?.slice(0, 10);
    const stageEnd = currentStage?.endPlanned?.slice(0, 10);

    // --- CONFLICT DETECTION ---
    const checkConflicts = (employeeIds: string[]): string[] => {
        const warnings: string[] = [];

        for (const empId of employeeIds) {
            const emp = getEmployee(empId);
            const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Pracownik';

            // 1. Check leave conflicts
            if (stageStart && stageEnd) {
                const leaveConflicts = requests.filter(req =>
                    req.type === 'urlop' &&
                    req.status === 'zaakceptowany' &&
                    req.employeeId === empId &&
                    req.dateFrom && req.dateTo &&
                    req.dateFrom.slice(0, 10) <= stageEnd &&
                    req.dateTo.slice(0, 10) >= stageStart
                );
                for (const leave of leaveConflicts) {
                    warnings.push(
                        `⚠️ ${empName} ma zatwierdzony URLOP (${leave.dateFrom?.slice(0, 10)} – ${leave.dateTo?.slice(0, 10)})`
                    );
                }
            }

            // 2. Check double-booking (same employee assigned to another stage in the same period)
            if (stageStart && stageEnd) {
                for (const otherJob of jobs) {
                    for (const otherStage of (otherJob.stages || [])) {
                        if (otherStage.id === stageId) continue; // Skip current stage
                        if (!otherStage.startPlanned || !otherStage.endPlanned) continue;

                        const otherStart = otherStage.startPlanned.slice(0, 10);
                        const otherEnd = otherStage.endPlanned.slice(0, 10);

                        // Check date overlap
                        if (otherStart <= stageEnd && otherEnd >= stageStart) {
                            // Check if this employee is assigned there
                            // Use employeeAssignments from useJobTeam for current job
                            // For other jobs, check assignedTeams (crew-level)
                            if (otherJob.id === jobId) {
                                const otherAssigns = employeeAssignments.filter(a => a.stageId === otherStage.id && a.employeeId === empId);
                                if (otherAssigns.length > 0) {
                                    warnings.push(
                                        `⚠️ ${empName} jest już przypisany do "${otherStage.name}" (${otherStart} – ${otherEnd}) w tym samym zleceniu`
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        return warnings;
    };

    // Filter assignments for THIS stage
    const stageAssignments = employeeAssignments.filter(a => a.stageId === stageId);

    const handleSaveDetails = (e: React.FormEvent) => {
        e.preventDefault();
        onSaveDetails({
            startTime,
            location,
            notes
        });
    };

    const handleAddCrew = () => {
        if (!selectedCrewId) return;
        const crew = crews.find(c => c.id === selectedCrewId);
        if (crew) {
            const memberIds = Array.from(new Set([...crew.memberIds, crew.foremanId]));

            // Check for conflicts before adding
            const warnings = checkConflicts(memberIds);
            if (warnings.length > 0) {
                const proceed = window.confirm(
                    `Wykryto konflikty przy przypisywaniu ekipy "${crew.name}":\n\n` +
                    warnings.join('\n') + '\n\n' +
                    'Czy mimo to chcesz przypisać tę ekipę?'
                );
                if (!proceed) return;
            }

            memberIds.forEach(empId => {
                const exists = stageAssignments.some(a => a.employeeId === empId);
                if (!exists) {
                    addEmployeeAssignment(empId, hours, stageId);
                }
            });
        }
        setViewMode('list');
        setSelectedCrewId('');
    };

    const handleAddEmployee = () => {
        if (!selectedEmployeeId) return;
        const exists = stageAssignments.some(a => a.employeeId === selectedEmployeeId);
        if (!exists) {
            // Check for conflicts
            const warnings = checkConflicts([selectedEmployeeId]);
            if (warnings.length > 0) {
                const proceed = window.confirm(
                    `Wykryto konflikty:\n\n` +
                    warnings.join('\n') + '\n\n' +
                    'Czy mimo to chcesz przypisać tego pracownika?'
                );
                if (!proceed) return;
            }
            addEmployeeAssignment(selectedEmployeeId, hours, stageId);
        }
        setViewMode('list');
        setSelectedEmployeeId('');
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
                    <div>
                        <h3 className="font-semibold text-gray-900 flex items-center">
                            <Users className="w-5 h-5 mr-2 text-blue-600" />
                            Planowanie Realizacji
                        </h3>
                        <div className="text-xs text-gray-500 mt-1">
                            {jobTitle} • {stageTitle}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* 1. Stage Details Form (startTime, etc) */}
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
                        <h4 className="text-sm font-semibold text-blue-900">Szczegóły operacyjne</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Godzina startu</label>
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Lokalizacja (opcjonalnie)</label>
                                <input
                                    type="text"
                                    value={location}
                                    onChange={e => setLocation(e.target.value)}
                                    placeholder="Domyślna zlecenia"
                                    className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Uwagi dla zespołu</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Uwagi, kod do domofonu..."
                                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* 2. Team Assignments */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-semibold text-gray-900">Przypisany Zespół</h4>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewMode('add_employee')}
                                    className={`text-xs flex items-center px-2 py-1 rounded border transition-colors ${viewMode === 'add_employee' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <UserPlus className="w-3 h-3 mr-1" />
                                    Pracownik
                                </button>
                                <button
                                    onClick={() => setViewMode('add_crew')}
                                    className={`text-xs flex items-center px-2 py-1 rounded border transition-colors ${viewMode === 'add_crew' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Users className="w-3 h-3 mr-1" />
                                    Cała Ekipa
                                </button>
                            </div>
                        </div>

                        {/* Add Forms */}
                        {viewMode === 'add_crew' && (
                            <div className="bg-green-50 p-3 rounded-md border border-green-100 mb-4 animate-in fade-in slide-in-from-top-2">
                                <div className="text-xs font-medium text-green-800 mb-2">Dodaj całą ekipę</div>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-[10px] text-green-700 mb-1">Wybierz ekipę</label>
                                        <select
                                            value={selectedCrewId}
                                            onChange={e => setSelectedCrewId(e.target.value)}
                                            className="w-full text-sm border-green-300 rounded focus:ring-green-500 focus:border-green-500"
                                        >
                                            <option value="">-- Wybierz --</option>
                                            {crews.map(c => (
                                                <option key={c.id} value={c.id}>{c.name} ({c.memberIds.length + 1} os.)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-[10px] text-green-700 mb-1">Godziny/os</label>
                                        <input
                                            type="number"
                                            value={hours}
                                            onChange={e => setHours(parseFloat(e.target.value))}
                                            className="w-full text-sm border-green-300 rounded focus:ring-green-500 focus:border-green-500"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddCrew}
                                        disabled={!selectedCrewId}
                                        className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                                    >
                                        Dodaj
                                    </button>
                                </div>
                            </div>
                        )}

                        {viewMode === 'add_employee' && (
                            <div className="bg-indigo-50 p-3 rounded-md border border-indigo-100 mb-4 animate-in fade-in slide-in-from-top-2">
                                <div className="text-xs font-medium text-indigo-800 mb-2">Dodaj pracownika</div>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-[10px] text-indigo-700 mb-1">Wybierz pracownika</label>
                                        <select
                                            value={selectedEmployeeId}
                                            onChange={e => setSelectedEmployeeId(e.target.value)}
                                            className="w-full text-sm border-indigo-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                        >
                                            <option value="">-- Wybierz --</option>
                                            {employees.filter(e => e.isActive && !stageAssignments.some(a => a.employeeId === e.id)).map(e => (
                                                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-[10px] text-indigo-700 mb-1">Godziny</label>
                                        <input
                                            type="number"
                                            value={hours}
                                            onChange={e => setHours(parseFloat(e.target.value))}
                                            className="w-full text-sm border-indigo-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddEmployee}
                                        disabled={!selectedEmployeeId}
                                        className="bg-indigo-600 text-white px-3 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        Dodaj
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="border rounded-md overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pracownik</th>
                                        <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Plan (h)</th>
                                        <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {stageAssignments.length > 0 ? (
                                        stageAssignments.map(assign => {
                                            const emp = getEmployee(assign.employeeId);
                                            return (
                                                <tr key={assign.id}>
                                                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                                        {emp ? `${emp.firstName} ${emp.lastName}` : 'Nieznany'}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right">
                                                        {assign.plannedHours} h
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm">
                                                        <button
                                                            onClick={() => removeEmployeeAssignment(assign.id)}
                                                            className="text-red-400 hover:text-red-900 transition-colors"
                                                            title="Usuń przypisanie"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={3} className="px-3 py-4 text-center text-sm text-gray-400 italic">
                                                Brak przypisanych pracowników. Dodaj ekipę lub osobę powyżej.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center bg-gray-50 px-4 py-3 border-t">
                    <span className="text-xs text-gray-500">
                        Suma godzin: {stageAssignments.reduce((sum, a) => sum + a.plannedHours, 0)}h
                    </span>
                    <button
                        onClick={handleSaveDetails}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center shadow-sm"
                    >
                        <Save className="w-4 h-4 mr-1.5" />
                        Zapisz szczegóły i zamknij
                    </button>
                </div>
            </div>
        </div>
    );
}
