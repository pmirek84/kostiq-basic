import { useMemo } from 'react';
import { Clock, TrendingUp } from 'lucide-react';
import type { Job } from '../../models/types';
import { useTiCo } from '../../context/TiCoContext';
import { summarizeTimeForJob } from '../../utils/timeAnalytics';

interface JobTimeAndCostPanelProps {
    job: Job;
    laborHourlyRate: number;
}

export default function JobTimeAndCostPanel({ job, laborHourlyRate }: JobTimeAndCostPanelProps) {
    const { timeEntries, employees } = useTiCo();

    const summary = useMemo(() => {
        if (!job.id) return null;

        const mappedEntries: any[] = timeEntries
            .filter(e => e.jobId === job.id)
            .map(e => {
                const emp = employees.find(emp => emp.id === e.employeeId);
                return {
                    id: e.id.toString(),
                    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Nieznany',
                    jobCode: job.jobCode || job.name,
                    date: e.date,
                    hours: e.hours,
                    type: e.type === 'drive' ? 'drive' : 'work', // Map TiCo type to simple 'work'/'drive'
                    approved: e.status === 'approved'
                };
            });

        return summarizeTimeForJob(job.jobCode || job.name, mappedEntries);
    }, [job.id, job.jobCode, job.name, timeEntries, employees]);

    if (!summary || summary.totalHours === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-500">
                    Brak danych z KOSTIQ dla tego zlecenia.
                </p>
            </div>
        );
    }

    const plannedHours = job.plannedWorkHours ?? null;
    const plannedCost = job.laborPlannedNet ?? (plannedHours !== null ? plannedHours * laborHourlyRate : null);

    const actualWorkHours = summary.totalWorkHours;
    const actualDriveHours = summary.totalDriveHours;
    const actualTotalHours = summary.totalHours;
    const actualLaborCost = actualWorkHours * laborHourlyRate; // Usually we pay for work hours, maybe drive too depending on policy

    const diffHours = plannedHours !== null ? actualWorkHours - plannedHours : null;
    const diffCost = plannedCost !== null ? actualLaborCost - plannedCost : null;

    return (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                        Czas pracy i koszt robocizny (Plan vs Real)
                    </h3>
                </div>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <TrendingUp className="h-4 w-4" />
                    <span>Kod zlecenia: <span className="font-mono font-medium">{job.jobCode}</span></span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Plan */}
                <div className="bg-gray-50 rounded-md p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Plan (z oferty)</h4>
                    <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Planowane roboczogodziny:</dt>
                            <dd className="font-medium text-gray-900">
                                {plannedHours !== null ? `${plannedHours.toFixed(2)} h` : 'brak'}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Planowany koszt robocizny:</dt>
                            <dd className="font-medium text-gray-900">
                                {plannedCost !== null ? `${plannedCost.toFixed(2)} PLN` : 'brak'}
                            </dd>
                        </div>
                        {job.plannedTeam && job.plannedTeam.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                                <dt className="text-gray-500 mb-1">Planowany skład ekipy:</dt>
                                <dd className="font-medium text-gray-900 text-xs">
                                    {job.plannedTeam.join(', ')}
                                </dd>
                            </div>
                        )}
                    </dl>
                </div>

                {/* Real */}
                <div className="bg-gray-50 rounded-md p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Real (KOSTIQ)</h4>
                    <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Praca na montażu:</dt>
                            <dd className="font-medium text-orange-600">
                                {actualWorkHours.toFixed(2)} h
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Dojazdy:</dt>
                            <dd className="font-medium text-gray-500">
                                {actualDriveHours.toFixed(2)} h
                            </dd>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                            <dt className="text-gray-500">Łącznie:</dt>
                            <dd className="font-medium text-gray-900">
                                {actualTotalHours.toFixed(2)} h
                            </dd>
                        </div>
                        <div className="flex justify-between pt-2 mt-2 border-t border-gray-200">
                            <dt className="text-gray-500">Realny koszt (praca):</dt>
                            <dd className="font-bold text-blue-700">
                                {actualLaborCost.toFixed(2)} PLN
                            </dd>
                        </div>
                    </dl>
                </div>

                {/* Variances */}
                <div className="bg-gray-50 rounded-md p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Odchyłki</h4>
                    {plannedHours === null ? (
                        <p className="text-sm text-gray-500 italic">
                            Zlecenie nie posiadało planu - brak możliwości porównania.
                        </p>
                    ) : (
                        <dl className="space-y-1 text-sm">
                            <div className="flex justify-between items-center">
                                <dt className="text-gray-500">Różnica godzin (Real - Plan):</dt>
                                <dd
                                    className={
                                        'font-bold ' +
                                        (diffHours! > 0 ? 'text-red-600' : diffHours! < -0.1 ? 'text-green-600' : 'text-gray-900')
                                    }
                                >
                                    {diffHours! > 0 ? '+' : ''}{diffHours!.toFixed(2)} h
                                </dd>
                            </div>
                            {diffCost !== null && (
                                <div className="flex justify-between items-center pt-2">
                                    <dt className="text-gray-500">Różnica kosztu:</dt>
                                    <dd
                                        className={
                                            'font-bold ' +
                                            (diffCost > 0 ? 'text-red-600' : diffCost < -0.1 ? 'text-green-600' : 'text-gray-900')
                                        }
                                    >
                                        {diffCost > 0 ? '+' : ''}{diffCost.toFixed(2)} PLN
                                    </dd>
                                </div>
                            )}
                        </dl>
                    )}
                </div>
            </div>

            {/* Employee Breakdown */}
            <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Szczegóły - pracownicy</h4>
                {summary.entriesByEmployee.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                        Brak wpisów czasu pracy dla tego zlecenia.
                    </p>
                ) : (
                    <div className="overflow-x-auto border rounded-md">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr className="text-left text-gray-500">
                                    <th className="py-2 px-3 font-medium">Pracownik</th>
                                    <th className="py-2 px-3 font-medium text-right">Praca (h)</th>
                                    <th className="py-2 px-3 font-medium text-right">Dojazd (h)</th>
                                    <th className="py-2 px-3 font-medium text-right">Łącznie (h)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {summary.entriesByEmployee.map(e => (
                                    <tr key={e.employeeName}>
                                        <td className="py-2 px-3 font-medium text-gray-900">{e.employeeName}</td>
                                        <td className="py-2 px-3 text-right">{e.workHours.toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right text-gray-500">{e.driveHours.toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-medium">{e.totalHours.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
