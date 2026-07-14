import { useState, useMemo } from 'react';
import { format, differenceInDays, min, max, isValid, parseISO } from 'date-fns';
import { Clock, Users, ArrowRight, Edit2, Save, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { Job, JobStage } from '../../models/types';
import { useJobs } from '../../context/JobsContext';
import { useNavigate } from 'react-router-dom';
import { JobTimeline } from './timeline/JobTimeline';

interface JobScheduleTabProps {
    job: Job;
}

export const JobScheduleTab = ({ job }: JobScheduleTabProps) => {
    const { updateJob } = useJobs();
    const navigate = useNavigate();
    const [editingStageId, setEditingStageId] = useState<string | null>(null);
    const [editDates, setEditDates] = useState({ start: '', end: '', assignedTeams: [] as string[] });

    // Job-level dates editor
    const [editingJobDates, setEditingJobDates] = useState(false);
    const [jobDates, setJobDates] = useState({
        start: job.plannedStartDate?.slice(0, 10) || '',
        end: job.plannedEndDate?.slice(0, 10) || ''
    });

    const saveJobDates = () => {
        if (jobDates.start && jobDates.end && new Date(jobDates.start) > new Date(jobDates.end)) {
            alert('Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.');
            return;
        }
        const updates: any = {
            plannedStartDate: jobDates.start ? new Date(jobDates.start).toISOString() : undefined,
            plannedEndDate: jobDates.end ? new Date(jobDates.end).toISOString() : undefined,
        };
        // Propagate to first stage if it has no dates
        if (job.stages && job.stages.length > 0) {
            const firstStage = job.stages[0];
            if (!firstStage.startPlanned && !firstStage.endPlanned && jobDates.start && jobDates.end) {
                updates.stages = job.stages.map((s, idx) =>
                    idx === 0
                        ? { ...s, startPlanned: new Date(jobDates.start).toISOString(), endPlanned: new Date(jobDates.end).toISOString() }
                        : s
                );
            }
        }
        updateJob(job.id, updates);
        setEditingJobDates(false);
    };

    const startEditing = (stage: JobStage) => {
        setEditingStageId(stage.id);
        setEditDates({
            start: stage.startPlanned || '',
            end: stage.endPlanned || '',
            assignedTeams: stage.assignedTeams || []
        });
    };

    const saveStageDates = (stageId: string) => {
        if (!job.stages) return;

        // Validation: Start cannot be after End
        if (editDates.start && editDates.end) {
            const start = new Date(editDates.start);
            const end = new Date(editDates.end);

            if (isValid(start) && isValid(end) && start > end) {
                alert('Data końcowa nie może być wcześniejsza niż data początkowa.');
                return;
            }
        }

        const updatedStages = job.stages.map(s => {
            if (s.id === stageId) {
                return {
                    ...s,
                    startPlanned: editDates.start,
                    endPlanned: editDates.end,
                    assignedTeams: editDates.assignedTeams
                };
            }
            return s;
        });

        // Recalculate Job Globals
        const dates = updatedStages.flatMap(s => [
            s.startPlanned ? new Date(s.startPlanned) : null,
            s.endPlanned ? new Date(s.endPlanned) : null
        ]).filter((d): d is Date => d !== null && isValid(d));

        let newJobStart = job.plannedStartDate;
        let newJobEnd = job.plannedEndDate;

        if (dates.length > 0) {
            newJobStart = min(dates).toISOString();
            newJobEnd = max(dates).toISOString();
        }

        // Collect all unique teams from stages to update job.assignedTeams
        const allTeams = Array.from(new Set(updatedStages.flatMap(s => s.assignedTeams || [])));

        updateJob(job.id, {
            stages: updatedStages,
            plannedStartDate: newJobStart,
            plannedEndDate: newJobEnd,
            assignedTeams: allTeams
        });

        setEditingStageId(null);
    };

    const toggleTeam = (team: string) => {
        setEditDates(prev => {
            const teams = prev.assignedTeams.includes(team)
                ? prev.assignedTeams.filter(t => t !== team)
                : [...prev.assignedTeams, team];
            return { ...prev, assignedTeams: teams };
        });
    };

    const availableTeams = ['Ekipa 1', 'Ekipa 2', 'Ekipa 3', 'Podwykonawcy'];

    const sortedStages = useMemo(() => {
        return [...(job.stages || [])].sort((a, b) => {
            const da = a.startPlanned ? new Date(a.startPlanned).getTime() : 0;
            const db = b.startPlanned ? new Date(b.startPlanned).getTime() : 0;
            return da - db;
        });
    }, [job.stages]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Main Schedule Area */}
                <div className="xl:col-span-2 space-y-6">

                    {/* Job Timeline */}
                    <JobTimeline
                        job={job}
                        onStageClick={(stage) => {
                            startEditing(stage);
                            // Scroll to editor
                            document.getElementById(`stage-${stage.id}`)?.scrollIntoView({ behavior: 'smooth' });
                        }}
                    />

                    {/* Job-level Dates */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-500" />
                                Termin realizacji zlecenia
                            </h3>
                            {!editingJobDates ? (
                                <button
                                    onClick={() => { setEditingJobDates(true); setJobDates({ start: job.plannedStartDate?.slice(0, 10) || '', end: job.plannedEndDate?.slice(0, 10) || '' }); }}
                                    className="text-gray-400 hover:text-blue-600 flex items-center gap-1 text-sm"
                                >
                                    <Edit2 className="w-4 h-4" /> Edytuj
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={saveJobDates} className="text-green-600 hover:text-green-700 flex items-center gap-1 text-sm font-medium"><Save className="w-4 h-4" /> Zapisz</button>
                                    <button onClick={() => setEditingJobDates(false)} className="text-red-500 hover:text-red-600 flex items-center gap-1 text-sm"><X className="w-4 h-4" /> Anuluj</button>
                                </div>
                            )}
                        </div>
                        {editingJobDates ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Od</label>
                                    <input
                                        type="date"
                                        value={jobDates.start}
                                        onChange={e => setJobDates(prev => ({ ...prev, start: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Do</label>
                                    <input
                                        type="date"
                                        value={jobDates.end}
                                        min={jobDates.start || undefined}
                                        onChange={e => setJobDates(prev => ({ ...prev, end: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                                {jobDates.start && jobDates.end && new Date(jobDates.start) > new Date(jobDates.end) && (
                                    <p className="col-span-2 text-xs text-red-600">⚠️ Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.</p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 text-sm text-gray-700">
                                <span className="font-medium text-gray-500">Start:</span>
                                <span className="font-semibold">{job.plannedStartDate ? format(parseISO(job.plannedStartDate), 'dd.MM.yyyy') : <span className="text-gray-400 italic">nie ustawiono</span>}</span>
                                <ArrowRight className="w-4 h-4 text-gray-300" />
                                <span className="font-medium text-gray-500">Koniec:</span>
                                <span className="font-semibold">{job.plannedEndDate ? format(parseISO(job.plannedEndDate), 'dd.MM.yyyy') : <span className="text-gray-400 italic">nie ustawiono</span>}</span>
                                {job.plannedStartDate && job.plannedEndDate && (
                                    <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                        {differenceInDays(new Date(job.plannedEndDate), new Date(job.plannedStartDate)) + 1} dni
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stage List / Editor */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Etapy i Terminy</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 text-gray-500">
                                        <th className="py-2 pl-2">Etap</th>
                                        <th className="py-2">Start</th>
                                        <th className="py-2">Koniec</th>
                                        <th className="py-2">Zespół</th>
                                        <th className="py-2 text-right">Czas trwania</th>
                                        <th className="py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {sortedStages.map(stage => {
                                        const isEditing = editingStageId === stage.id;
                                        return (
                                            <tr key={stage.id} id={`stage-${stage.id}`} className={clsx("group hover:bg-gray-50 transition-colors", isEditing && "bg-blue-50/50")}>
                                                <td className="py-3 pl-2">
                                                    <div className="font-medium text-gray-900">{stage.name}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {stage.type === 'dodatkowy' ? 'Prace dodatkowe' : 'Etap podstawowy'}
                                                    </div>
                                                </td>
                                                <td className="py-3">
                                                    {isEditing ? (
                                                        <input
                                                            type="date"
                                                            className={`p-1 text-sm border rounded ${editDates.start && editDates.end && new Date(editDates.start) > new Date(editDates.end) ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                                            value={editDates.start ? editDates.start.slice(0, 10) : ''}
                                                            onChange={e => setEditDates({ ...editDates, start: e.target.value })}
                                                        />
                                                    ) : (
                                                        stage.startPlanned ? format(parseISO(stage.startPlanned), 'dd.MM.yyyy') : '-'
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    {isEditing ? (
                                                        <input
                                                            type="date"
                                                            className={`p-1 text-sm border rounded ${editDates.start && editDates.end && new Date(editDates.start) > new Date(editDates.end) ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                                            value={editDates.end ? editDates.end.slice(0, 10) : ''}
                                                            onChange={e => setEditDates({ ...editDates, end: e.target.value })}
                                                        />
                                                    ) : (
                                                        stage.endPlanned ? format(parseISO(stage.endPlanned), 'dd.MM.yyyy') : '-'
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    {isEditing ? (
                                                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                            {availableTeams.map(t => (
                                                                <button
                                                                    key={t}
                                                                    onClick={() => toggleTeam(t)}
                                                                    className={`text-xs px-2 py-0.5 rounded transition-colors ${editDates.assignedTeams.includes(t) ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                                                >
                                                                    {t}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1">
                                                            {stage.assignedTeams && stage.assignedTeams.length > 0 ? (
                                                                stage.assignedTeams.map((t, idx) => (
                                                                    <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                                                                        {t}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">-</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 text-right">
                                                    {isEditing && editDates.start && editDates.end && new Date(editDates.start) > new Date(editDates.end) ? (
                                                        <span className="text-red-600 font-bold text-xs">Błąd dat!</span>
                                                    ) : (
                                                        stage.startPlanned && stage.endPlanned
                                                            ? `${differenceInDays(new Date(stage.endPlanned), new Date(stage.startPlanned)) + 1} dni`
                                                            : '-'
                                                    )}
                                                </td>
                                                <td className="py-3 text-right pr-2">
                                                    {isEditing ? (
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => saveStageDates(stage.id)} className="text-green-600 hover:text-green-700">
                                                                <Save className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => setEditingStageId(null)} className="text-red-500 hover:text-red-600">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => startEditing(stage)}
                                                            className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Sidebar: Resources */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Users className="w-5 h-5 mr-2 text-gray-500" />
                            Zasoby i Zespół
                        </h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center">
                                    <Clock className="w-5 h-5 text-gray-400 mr-3" />
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">Planowana pracochłonność</p>
                                        <p className="text-xs text-gray-500">Szacowane godziny pracy</p>
                                    </div>
                                </div>
                                <span className="text-lg font-bold text-gray-900">{job.plannedWorkHours || 0} h</span>
                            </div>

                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-sm font-medium text-gray-900 mb-2">Przypisane zespoły</p>
                                {job.assignedTeams && job.assignedTeams.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {job.assignedTeams.map((team, index) => (
                                            <span key={index} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-700">
                                                {team}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">Brak przypisanych zespołów</p>
                                )}
                            </div>

                            <button
                                onClick={() => navigate(`/calendar?jobId=${job.id}&from=${encodeURIComponent(`/jobs/${job.id}?tab=schedule`)}`)}
                                className="w-full mt-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center"
                            >
                                Zarządzaj w Kalendarzu
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
