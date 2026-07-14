import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, HardHat, Plus, Trash2, Shield } from 'lucide-react';
import { useJobTeam } from '../../hooks/useJobTeam';

interface JobTeamTabProps {
    jobId: string;
}

export const JobTeamTab = ({ jobId }: JobTeamTabProps) => {
    const navigate = useNavigate();
    const {
        job,
        employeeAssignments,
        subcontractorAssignments,
        employees,
        subcontractors,
        crews,
        addEmployeeAssignment,
        removeEmployeeAssignment,
        addSubcontractorAssignment,
        removeSubcontractorAssignment,
        addCrewAssignment,
        getEmployee,
        getSubcontractor,
        stats
    } = useJobTeam(jobId);

    // Modal States
    const [showAddEmp, setShowAddEmp] = useState(false);
    const [showAddSub, setShowAddSub] = useState(false);
    const [showAddCrew, setShowAddCrew] = useState(false);

    // Form States
    const [empForm, setEmpForm] = useState({ employeeId: '', hours: 8, stageId: '' });
    const [subForm, setSubForm] = useState({ subcontractorId: '', budget: 0, scope: '', stageId: '' });
    const [crewForm, setCrewForm] = useState({ crewId: '', hours: 8, stageId: '' });
    const [empError, setEmpError] = useState('');
    const [crewError, setCrewError] = useState('');

    if (!job) return <div>Wczytywanie...</div>;

    const handleAddEmployee = () => {
        if (!empForm.employeeId) { setEmpError('Wybierz pracownika'); return; }
        if (empForm.hours <= 0) { setEmpError('Podaj planowane godziny (> 0)'); return; }
        setEmpError('');
        addEmployeeAssignment(empForm.employeeId, empForm.hours, empForm.stageId || undefined);
        setShowAddEmp(false);
        setEmpForm({ employeeId: '', hours: 8, stageId: '' });
    };

    const handleAddSub = () => {
        if (!subForm.subcontractorId || subForm.budget <= 0) return;
        addSubcontractorAssignment(subForm.subcontractorId, subForm.budget, subForm.scope, subForm.stageId || undefined);
        setShowAddSub(false);
        setSubForm({ subcontractorId: '', budget: 0, scope: '', stageId: '' });
    };

    const fmt = (amount: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);

    return (
        <div className="space-y-6">

            {/* Header / Stats */}
            <div className="flex justify-end mb-2">
                <button
                    onClick={() => navigate(`/tico?from=${encodeURIComponent(`/jobs/${jobId}?tab=team`)}`)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center font-medium bg-transparent border-0 cursor-pointer"
                >
                    Przejdź do głównego modułu TiCo (Rozliczenia) &rarr;
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Budget from Offer */}
                <div className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-100">
                    <p className="text-sm text-blue-600 font-medium">Budżet Robocizny (Oferta)</p>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-gray-900">
                            {fmt(job.laborBudget?.totalPlannedNet ?? job.plannedLaborCost ?? 0)}
                        </span>
                        <span className="text-xs text-blue-500">
                            {job.plannedLaborHours ?? 0} h (szac.)
                        </span>
                    </div>
                </div>

                {/* Assigned Plan */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Zaplanowano (Zespół)</p>
                    <div className="flex flex-col">
                        <span className="text-2xl font-bold text-gray-900">
                            {fmt(stats.totalEmployeeCost + stats.totalSubcontractorCost)}
                        </span>
                        <span className="text-xs text-gray-400">
                            {stats.totalHours} h przypisanych
                        </span>
                    </div>
                </div>

                {/* Actuals from KOSTIQ Mobile */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Rzeczywiste (KOSTIQ)</p>
                    <div className="flex flex-col">
                        <span className={`text-2xl font-bold ${(job.actualLaborCost || 0) > (job.laborBudget?.totalPlannedNet || 0) ? 'text-red-600' : 'text-green-600'}`}>
                            {fmt(job.actualLaborCost || 0)}
                        </span>
                        <span className="text-xs text-gray-400">
                            {job.actualLaborHours || 0} h
                        </span>
                    </div>
                </div>

                {/* Workers Active */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Liczba Pracowników</p>
                    <p className="text-2xl font-bold text-gray-900">{employeeAssignments.length + subcontractorAssignments.length}</p>
                </div>
            </div>

            {/* Crews Section */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <Shield className="w-5 h-5 mr-2 text-emerald-600" />
                        Brygady
                    </h3>
                    <button
                        onClick={() => setShowAddCrew(true)}
                        className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 flex items-center"
                    >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Przypisz brygadę
                    </button>
                </div>
                {crews.filter(c => c.active).length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Brak dostępnych brygad. Utwórz brygady w module TiCo.</p>
                ) : (() => {
                    // Unique crew IDs currently assigned
                    const assignedCrewIds = new Set(
                        employeeAssignments.filter(a => (a as any).crewId).map(a => (a as any).crewId)
                    );
                    const assignedCrews = crews.filter(c => assignedCrewIds.has(c.id));
                    return assignedCrews.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Brak przypisanych brygad. Kliknij "Przypisz brygadę" aby dodać.</p>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {assignedCrews.map(crew => {
                                const members = crew.memberIds.map(id => getEmployee(id)).filter(Boolean);
                                return (
                                    <div key={crew.id} className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 min-w-[180px]">
                                        <p className="font-semibold text-emerald-800 text-sm mb-1">{crew.name}</p>
                                        <p className="text-xs text-gray-500">{members.length} osób</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {members.map(m => m && (
                                                <span key={m.id} className="text-xs bg-white border border-emerald-200 rounded px-1.5 py-0.5 text-gray-700">
                                                    {m.firstName} {m.lastName}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Employees Column */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <Users className="w-5 h-5 mr-2 text-indigo-600" />
                            Pracownicy
                        </h3>
                        <button
                            onClick={() => setShowAddEmp(true)}
                            className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-md hover:bg-indigo-100 flex items-center"
                        >
                            <UserPlus className="w-4 h-4 mr-1.5" />
                            Dodaj
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="py-2 pl-3 rounded-l-md font-medium">Pracownik</th>
                                    <th className="py-2 font-medium text-right">Godziny (Plan)</th>
                                    <th className="py-2 font-medium text-right">Koszt (Plan)</th>
                                    <th className="py-2 pr-2 rounded-r-md"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {employeeAssignments.map(assign => {
                                    const employee = getEmployee(assign.employeeId);
                                    if (!employee) return null;
                                    return (
                                        <tr key={assign.id}>
                                            <td className="py-3 pl-3">
                                                <div className="font-medium text-gray-900">{employee.firstName} {employee.lastName}</div>
                                                <div className="text-xs text-gray-500">{employee.role}</div>
                                                {assign.stageId && (
                                                    <div className="text-xs text-indigo-500 mt-0.5">
                                                        Etap: {job.stages?.find(s => s.id === assign.stageId)?.name || '...'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 text-right">{assign.plannedHours} h</td>
                                            <td className="py-3 text-right">{fmt(assign.plannedCost)}</td>
                                            <td className="py-3 pr-2 text-right">
                                                <button onClick={() => removeEmployeeAssignment(assign.id)} className="text-red-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {employeeAssignments.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-4 text-center text-gray-400 italic">Brak przypisanych pracowników</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Subcontractors Column */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <HardHat className="w-5 h-5 mr-2 text-amber-600" />
                            Podwykonawcy
                        </h3>
                        <button
                            onClick={() => setShowAddSub(true)}
                            className="text-sm bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md hover:bg-amber-100 flex items-center"
                        >
                            <Plus className="w-4 h-4 mr-1.5" />
                            Dodaj
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="py-2 pl-3 rounded-l-md font-medium">Firma</th>
                                    <th className="py-2 font-medium">Zakres</th>
                                    <th className="py-2 font-medium text-right">Budżet</th>
                                    <th className="py-2 pr-2 rounded-r-md"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {subcontractorAssignments.map(assign => {
                                    const sub = getSubcontractor(assign.subcontractorId);
                                    if (!sub) return null;
                                    return (
                                        <tr key={assign.id}>
                                            <td className="py-3 pl-3">
                                                <div className="font-medium text-gray-900">{sub.name}</div>
                                                <div className="text-xs text-gray-500">{sub.specialization}</div>
                                            </td>
                                            <td className="py-3 text-gray-600 truncate max-w-[150px]" title={assign.scopeDescription}>
                                                {assign.scopeDescription}
                                            </td>
                                            <td className="py-3 text-right">{fmt(assign.plannedBudget)}</td>
                                            <td className="py-3 pr-2 text-right">
                                                <button onClick={() => removeSubcontractorAssignment(assign.id)} className="text-red-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {subcontractorAssignments.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-4 text-center text-gray-400 italic">Brak podwykonawców</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- Modals --- */}

            {/* Add Employee Modal */}
            {showAddEmp && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
                        <h3 className="text-lg font-bold mb-4">Przypisz pracownika</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Pracownik</label>
                                {employees.length === 0 ? (
                                    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                                        ⚠️ Brak załadowanych pracowników. Upewnij się, że moduł TiCo jest zsynchronizowany.
                                    </div>
                                ) : (
                                    <select
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        value={empForm.employeeId}
                                        onChange={e => setEmpForm({ ...empForm, employeeId: e.target.value })}
                                    >
                                        <option value="">Wybierz...</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>
                                                {e.firstName} {e.lastName} ({e.role}){!e.isActive ? ' — nieaktywny' : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Etap (opcjonalnie)</label>
                                <select
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={empForm.stageId}
                                    onChange={e => setEmpForm({ ...empForm, stageId: e.target.value })}
                                >
                                    <option value="">-- Całe zlecenie --</option>
                                    {job.stages?.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Planowane godziny</label>
                                <input
                                    type="number"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={empForm.hours}
                                    onChange={e => setEmpForm({ ...empForm, hours: parseFloat(e.target.value) })}
                                />
                            </div>
                            {empForm.employeeId && (
                                <div className="text-sm text-gray-500 bg-gray-50 p-2 rounded">
                                    Stawka: {employees.find(e => e.id === empForm.employeeId)?.hourlyRate} PLN/h
                                    <br />
                                    Est. Koszt: {fmt((employees.find(e => e.id === empForm.employeeId)?.hourlyRate || 0) * empForm.hours)}
                                </div>
                            )}
                            {empError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                                    ⚠️ {empError}
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => { setShowAddEmp(false); setEmpError(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                <button onClick={handleAddEmployee} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">Dodaj</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Subcontractor Modal */}
            {showAddSub && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
                        <h3 className="text-lg font-bold mb-4">Dodaj podwykonawcę</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Firma / Wykonawca</label>
                                <select
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={subForm.subcontractorId}
                                    onChange={e => setSubForm({ ...subForm, subcontractorId: e.target.value })}
                                >
                                    <option value="">Wybierz...</option>
                                    {subcontractors.filter(s => s.isActive).map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.specialization})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Opis zakresu</label>
                                <input
                                    type="text"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={subForm.scope}
                                    onChange={e => setSubForm({ ...subForm, scope: e.target.value })}
                                    placeholder="np. Montaż fasady - etap 1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Budżet (Netto)</label>
                                <input
                                    type="number"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={subForm.budget}
                                    onChange={e => setSubForm({ ...subForm, budget: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setShowAddSub(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                <button onClick={handleAddSub} className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700">Dodaj</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Crew Modal */}
            {showAddCrew && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-emerald-600" />
                            Przypisz brygadę
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Brygada</label>
                                <select
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
                                    value={crewForm.crewId}
                                    onChange={e => { setCrewForm({ ...crewForm, crewId: e.target.value }); setCrewError(''); }}
                                >
                                    <option value="">Wybierz brygadę...</option>
                                    {crews.filter(c => c.active).map(c => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.memberIds.length} os.)</option>
                                    ))}
                                </select>
                            </div>
                            {crewForm.crewId && (() => {
                                const crew = crews.find(c => c.id === crewForm.crewId);
                                const members = crew?.memberIds.map(id => getEmployee(id)).filter(Boolean) ?? [];
                                const alreadyIn = members.filter(m => m && (job.employeeAssignments || []).some(a => a.employeeId === m.id));
                                return (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm">
                                        <p className="font-medium text-emerald-800 mb-2">Członkowie brygady</p>
                                        {members.map(m => m && (
                                            <div key={m.id} className="flex items-center justify-between py-0.5">
                                                <span className="text-gray-700">{m.firstName} {m.lastName}</span>
                                                {alreadyIn.some(a => a?.id === m.id) && (
                                                    <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">już przypisany</span>
                                                )}
                                            </div>
                                        ))}
                                        {alreadyIn.length > 0 && alreadyIn.length === members.length && (
                                            <p className="text-amber-700 text-xs mt-2">⚠️ Wszyscy członkowie są już przypisani do tego zlecenia.</p>
                                        )}
                                    </div>
                                );
                            })()}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Planowane godziny (na osobę)</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
                                    value={crewForm.hours}
                                    onChange={e => setCrewForm({ ...crewForm, hours: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Etap (opcjonalnie)</label>
                                <select
                                    className="w-full border-gray-300 rounded-md shadow-sm sm:text-sm"
                                    value={crewForm.stageId}
                                    onChange={e => setCrewForm({ ...crewForm, stageId: e.target.value })}
                                >
                                    <option value="">Cały projekt</option>
                                    {(job.stages || []).map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            {crewError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">⚠️ {crewError}</div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => { setShowAddCrew(false); setCrewError(''); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Anuluj</button>
                                <button
                                    onClick={() => {
                                        if (!crewForm.crewId) { setCrewError('Wybierz brygadę'); return; }
                                        if (crewForm.hours <= 0) { setCrewError('Podaj planowane godziny (> 0)'); return; }
                                        addCrewAssignment(crewForm.crewId, crewForm.hours, crewForm.stageId || undefined);
                                        setShowAddCrew(false);
                                        setCrewForm({ crewId: '', hours: 8, stageId: '' });
                                        setCrewError('');
                                    }}
                                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                >
                                    Przypisz brygadę
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
