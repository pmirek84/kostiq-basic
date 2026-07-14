import { useState, useEffect, useMemo } from 'react';
import { useTiCo } from '../../context/TiCoContext';
import type { CalendarEvent } from '../../models/calendar';
import type { Job, Offer, Request } from '../../models/types';
import { useMeasurements, type Measurement } from '../../hooks/useMeasurements';
import { useJobs } from '../../context/JobsContext';
import { useOffers } from '../../context/OffersContext';
import { useClients } from '../../context/ClientsContext';
import { calendarStorage } from '../../services/storage/calendarStorage';
import EventsCalendar from './EventsCalendar';
import CapacityCalendar from './CapacityCalendar';
import TimelineCalendar from './TimelineCalendar';
import CalendarControls, { type CalendarView } from './CalendarControls';
import AddEventDialog from './AddEventDialog';
import TeamSelectionDialog from './TeamSelectionDialog';
import { buildEmployeeDayCapacity, summarizeDayCapacity } from '../../utils/capacity';

type CalendarMode = 'events' | 'capacity' | 'timeline';

export default function AdminCalendar() {
    const [mode, setMode] = useState<CalendarMode>('events');
    const [view, setView] = useState<CalendarView>('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isAddEventOpen, setIsAddEventOpen] = useState(false);
    const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
    const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

    const [teamDialogState, setTeamDialogState] = useState<{
        isOpen: boolean;
        jobId: string;
        stageId: string;
        currentTeams: string[];
        currentStartTime?: string;
        currentLocation?: string;
        currentNotes?: string;
        jobName: string;
        stageName: string;
    }>({
        isOpen: false,
        jobId: '',
        stageId: '',
        currentTeams: [],
        jobName: '',
        stageName: ''
    });

    const { jobs } = useJobs();
    const { offers } = useOffers();
    const { clients } = useClients();
    const { measurements } = useMeasurements();
    // Replacing useTimeTracking with useTiCo
    const { employees: ticoEmployees, requests, crews: ticoCrews } = useTiCo();

    const { updateJobStage } = useJobs();

    const hoursPerDay = 8;



    // DEBUG: temporary logging - Safe here as all hooks are called
    console.log("AdminCalendar Render Stats:", { jobs: jobs.length, employees: ticoEmployees.length, offers: offers.length });

    // Load custom events on mount
    useEffect(() => {
        loadCustomEvents();
    }, []);

    const loadCustomEvents = async () => {
        const events = await calendarStorage.getEvents();
        setCustomEvents(events);
    };

    const handleUpdateStageTeam = (jobId: string, stageId: string, _assignments: string[]) => {
        // Use string comparison to be safe with IDs
        const job = jobs.find(j => j.id.toString() === jobId.toString());
        const stage = job?.stages?.find(s => s.id.toString() === stageId.toString());

        if (job && stage) {
            setTeamDialogState({
                isOpen: true,
                jobId: job.id,
                stageId: stage.id,
                currentTeams: stage.assignedTeams || [],
                currentStartTime: stage.assignedStartTime,
                currentLocation: stage.assignedLocation,
                currentNotes: stage.assignedNotes,
                jobName: job.name,
                stageName: stage.name
            });
        } else {
            console.warn("Job or stage not found for team update:", { jobId, stageId });
        }
    };

    // QUICK-ASSIGN: Open event dialog with pre-selected date
    const handleQuickAssign = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00');
        setCurrentDate(date);
        setIsAddEventOpen(true);
    };

    const handleSaveTeamDetails = async (details: { startTime?: string, location?: string, notes?: string }) => {
        try {
            if (updateJobStage) {
                await updateJobStage(teamDialogState.jobId, teamDialogState.stageId, {
                    // assignedTeams: [], // Keep legacy field as is or clear it? Let's leave it to avoid data loss if reverting.
                    assignedStartTime: details.startTime,
                    assignedLocation: details.location,
                    assignedNotes: details.notes
                });
            }
            // Close dialog
            setTeamDialogState(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error("Failed to update teams:", error);
        }
    };

    // --- DRAG & DROP HANDLER ---
    const handleEventDrop = async (event: CalendarEvent, newDate: Date) => {
        // Only handle stage events
        if (!event.id.startsWith('stage-')) return;

        const stageId = event.id.replace('stage-', '');
        const job = jobs.find(j => j.stages?.some(s => s.id === stageId));
        if (!job) return;

        const stage = job.stages?.find(s => s.id === stageId);
        if (!stage || !stage.startPlanned || !stage.endPlanned) return;

        // Calculate the duration of the stage
        const originalStart = new Date(stage.startPlanned);
        const originalEnd = new Date(stage.endPlanned);
        const durationMs = originalEnd.getTime() - originalStart.getTime();

        // Calculate new dates preserving duration
        const newStart = new Date(newDate);
        newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
        const newEnd = new Date(newStart.getTime() + durationMs);

        // Confirm the move
        const confirmed = window.confirm(
            `Przesunąć etap "${stage.name}" z ${originalStart.toLocaleDateString('pl-PL')} na ${newStart.toLocaleDateString('pl-PL')}?\n` +
            `(Czas trwania: ${Math.ceil(durationMs / (1000 * 60 * 60 * 24))} dni)`
        );

        if (!confirmed) return;

        try {
            await updateJobStage(job.id, stageId, {
                startPlanned: newStart.toISOString(),
                endPlanned: newEnd.toISOString()
            });

            // Recalculate job-level dates (min/max of all stages)
            const updatedStages = (job.stages || []).map(s =>
                s.id === stageId ? { ...s, startPlanned: newStart.toISOString(), endPlanned: newEnd.toISOString() } : s
            );
            const allDates = updatedStages
                .flatMap(s => [s.startPlanned, s.endPlanned].filter(Boolean))
                .map(d => new Date(d!).getTime())
                .filter(t => !isNaN(t));

            if (allDates.length > 0) {
                // Job-level dates are recalculated by updateJobStage → context refresh
            }
        } catch (error) {
            console.error('Failed to move stage:', error);
            alert('Nie udało się przesunąć etapu.');
        }
    };

    const handleEventClick = (event: CalendarEvent) => {
        console.log('Event clicked:', event);
        if (event.type === 'job' && event.relatedId) {
            const job = jobs.find(j => j.id === event.relatedId);
            if (job) {
                // Determine stage - try to get from event ID or properties if we stored it
                // For now, default to the first active stage if no specific stage ID is available
                // If the event ID contains 'stage-', we might parse it, but let's rely on finding the stage

                // Assuming we might attach stageId to the event object in a real implementation (see buildCalendarEvents below)
                // For now, let's just pick the first one to unblock the user.
                const stage = job.stages?.[0]; // Simplification for MVP/Debug

                if (stage) {
                    setTeamDialogState({
                        isOpen: true,
                        jobId: job.id,
                        stageId: stage.id,
                        currentTeams: stage.assignedTeams || [],
                        currentStartTime: stage.assignedStartTime,
                        currentLocation: stage.assignedLocation,
                        currentNotes: stage.assignedNotes,
                        jobName: job.name,
                        stageName: stage.name
                    });
                } else {
                    alert('To zlecenie nie ma zdefiniowanych etapów.');
                }
            }
        }
    };

    // Data Preparation
    const events = useMemo(() => buildCalendarEvents({
        jobs,
        offers,
        measurements,
        requests,
        ticoEmployees,
        clients
    }), [jobs, offers, measurements, requests, ticoEmployees, clients]);

    const capacitySummaries = useMemo(() => {
        if (mode !== 'capacity') return [];
        // DEBUG: Ensure crews are passed
        console.log("Building Capacity with Crews:", ticoCrews.length);

        const capacity = buildEmployeeDayCapacity({
            jobs,
            hoursPerDay,
            employees: ticoEmployees,
            crews: ticoCrews
        });
        return summarizeDayCapacity(capacity, ticoEmployees, ticoCrews);
    }, [jobs, ticoEmployees, ticoCrews, mode, hoursPerDay]);

    return (
        <div className="p-4 bg-white rounded-lg shadow-sm h-full flex flex-col">
            {/* DEBUG BANNER - TEMPORARY */}
            {/* DEBUG INFO - Commented out for production feel */}
            {/* <div className="bg-yellow-50 border border-yellow-200 p-2 mb-4 rounded text-xs text-yellow-800 font-mono overflow-auto max-h-40">
                <div className="flex gap-4 font-bold border-b border-yellow-200 pb-1 mb-1">
                    <span>DEBUG INFO:</span>
                    <span>Jobs: {jobs.length}</span>
                    <span>Employees: {employees.length}</span>
                    <span>Crews: {crews.length}</span>
                    <span>Offers: {offers.length}</span>
                    <span>View: {view}</span>
                    <span className="text-gray-400">|</span>
                    <span>CapDays: {capacitySummaries.length}</span>
                    <span className="text-gray-400">|</span>
                    <span>Range: {capacitySummaries[0]?.date} - {capacitySummaries[capacitySummaries.length-1]?.date}</span>
                    <span className="text-gray-400">|</span>
                    <span>Total Planned Hours: {capacitySummaries.reduce((acc, day) => acc + day.totalPlannedHours, 0).toFixed(1)}</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-400">|</span>
                </div>
                {jobs.map((j, i) => (
                    <div key={j.id}>
                        #{i + 1} {j.jobCode}: Stages: {j.stages?.length}; Range: {j.stages?.[0]?.startPlanned?.slice(0, 10)} to {j.stages?.[0]?.endPlanned?.slice(0, 10)}
                    </div>
                ))}
            </div> */}

            <CalendarControls
                view={view}
                onViewChange={setView}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onAddEvent={() => setIsAddEventOpen(true)}
                mode={mode}
                onModeChange={setMode}
            />

            <div className="flex-1 min-h-0 mt-4 overflow-hidden flex flex-col relative">
                {mode === 'events' ? (
                    <EventsCalendar
                        events={[...customEvents, ...events]}
                        view={view}
                        currentDate={currentDate}
                        onEventClick={handleEventClick}
                        onEventDrop={handleEventDrop}
                        onDateClick={(date) => {
                            setCurrentDate(date);
                        }}
                        onDateChange={setCurrentDate}
                        onAddEvent={async (event) => {
                            try {
                                await calendarStorage.addEvent(event as CalendarEvent);
                                await loadCustomEvents();
                            } catch (error) {
                                console.error('Failed to add custom event:', error);
                            }
                        }}
                    />
                ) : mode === 'capacity' ? (
                    <CapacityCalendar
                        capacitySummaries={capacitySummaries}
                        view={view}
                        currentDate={currentDate}
                        hoursPerDay={hoursPerDay}
                        totalEmployees={ticoEmployees.length}
                        onUpdateStageTeam={handleUpdateStageTeam}
                        onQuickAssign={handleQuickAssign}
                    />
                ) : (
                    <TimelineCalendar
                        currentDate={currentDate}
                        jobs={jobs}
                        crews={ticoCrews}
                    />
                )}
            </div>

            <TeamSelectionDialog
                isOpen={teamDialogState.isOpen}
                onClose={() => setTeamDialogState(prev => ({ ...prev, isOpen: false }))}
                onSaveDetails={handleSaveTeamDetails}
                jobId={teamDialogState.jobId}
                stageId={teamDialogState.stageId}
                initialStartTime={teamDialogState.currentStartTime}
                initialLocation={teamDialogState.currentLocation}
                initialNotes={teamDialogState.currentNotes}
                jobTitle={teamDialogState.jobName}
                stageTitle={teamDialogState.stageName}
            />

            {isAddEventOpen && (
                <AddEventDialog
                    initialEvent={editingEvent}
                    onClose={() => {
                        setIsAddEventOpen(false);
                        setEditingEvent(null);
                    }}
                    onDelete={async (id) => {
                        try {
                            await calendarStorage.deleteEvent(id);
                            await loadCustomEvents();
                            setIsAddEventOpen(false);
                            setEditingEvent(null);
                        } catch (error) {
                            console.error('Failed to delete event:', error);
                            alert('Nie udało się usunąć zdarzenia.');
                        }
                    }}
                    onSave={async (event) => {
                        try {
                            if (event.id) {
                                await calendarStorage.updateEvent(event as CalendarEvent);
                            } else {
                                // Ensure required fields for new event
                                if (event.title && event.start && event.end && event.type) {
                                    await calendarStorage.addEvent(event as CalendarEvent);
                                } else {
                                    console.warn('Missing required fields for event:', event);
                                    alert('Brakuje wymaganych pól (Tytuł, Data, Typ).');
                                    return;
                                }
                            }
                            await loadCustomEvents();
                            setIsAddEventOpen(false);
                            setEditingEvent(null);
                        } catch (error) {
                            console.error('Failed to save event:', error);
                            alert('Nie udało się zapisać zdarzenia. Sprawdź konsolę.');
                        }
                    }}
                    selectedDate={currentDate}
                />
            )}
        </div>
    );
}

function buildCalendarEvents({
    jobs,
    offers,
    measurements,
    requests = [],
    ticoEmployees = [],
    clients = []
}: {
    jobs: Job[],
    offers: Offer[],
    measurements: Measurement[],
    requests?: Request[],
    ticoEmployees?: any[],
    clients?: any[]
}): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    const getClientName = (id: string) => {
        const client = clients.find(c => c.id === id);
        if (!client) return id;
        return client.type === 'company' && client.company
            ? client.company
            : `${client.name || ''} ${client.lastName || ''}`.trim();
    };

    // Jobs
    for (const job of jobs) {
        const start = (job as any).plannedStartDate || job.createdAt;
        const end = (job as any).plannedEndDate || job.createdAt;

        // Main Job Event (if no stages or simple view)
        // Only add if no stages or purely for visualization of the whole project?
        // Let's keep it but maybe distinguish stage events.

        events.push({
            id: `job-${job.id}`,
            type: 'job',
            relatedId: job.id,
            title: job.name,
            subtitle: `Klient: ${getClientName(job.clientId)}`,
            location: job.location,
            start: start,
            end: end,
            team: job.plannedTeam,
            status: job.status === 'done' ? 'done' : job.status as any
        });

        if ((job as any).plannedEndDate && (job as any).plannedEndDate !== (job as any).plannedStartDate) {
            events.push({
                id: `job-end-${job.id}`,
                type: 'job',
                relatedId: job.id,
                title: `ZAKOŃCZENIE: ${job.name}`,
                subtitle: `Klient: ${getClientName(job.clientId)}`,
                location: job.location,
                start: end,
                end: end,
                team: job.plannedTeam,
                status: job.status === 'done' ? 'done' : job.status as any
            });
        }

        // Add Stage Events - THESE ARE THE ONES WE WANT TO EDIT
        if (job.stages) {
            for (const stage of job.stages) {
                if (stage.startPlanned && stage.endPlanned) {
                    events.push({
                        id: `stage-${stage.id}`,
                        relatedId: job.id,
                        stageId: stage.id,
                        type: 'job',
                        title: `${stage.name} (${job.name})`,
                        subtitle: stage.assignedTeams?.join(', ') || 'Brak ekipy',
                        start: stage.startPlanned,
                        end: stage.endPlanned,
                        status: stage.status as any,
                        location: stage.assignedLocation
                    });
                }
            }
        }
    }


    // Offers
    for (const offer of offers) {
        const start = (offer as any).plannedInstallationDate || offer.createdAt;
        const end = (offer as any).validUntil || start;

        events.push({
            id: `offer-${offer.id}`,
            type: 'offer',
            relatedId: offer.id,
            title: `Oferta ${offer.number}`,
            subtitle: `Klient: ${getClientName(offer.clientId)}`,
            location: offer.placeOfInstallation,
            start: start,
            end: end,
            status: 'planned'
        });
    }

    // Measurements
    for (const m of measurements) {
        events.push({
            id: `measure-${m.id}`,
            type: 'measurement',
            relatedId: m.id,
            title: `Pomiar – ${m.clientName}`,
            subtitle: m.address,
            location: m.address,
            start: m.date,
            end: m.date,
            status: m.status === 'completed' ? 'done' : 'planned'
        });
    }

    // KOSTIQ Mobile Requests (Leaves)
    for (const req of requests) {
        if (req.type === 'urlop' && req.status === 'zaakceptowany' && req.dateFrom && req.dateTo) {
            const employee = ticoEmployees.find(e => e.id === req.employeeId);
            const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Pracownik';

            events.push({
                id: `leave-${req.id}`,
                type: 'custom', // Using custom for now, could add 'leave' type
                relatedId: req.id,
                title: `Urlop: ${employeeName}`,
                subtitle: req.description || 'Nieobecność',
                location: 'Brak',
                start: req.dateFrom,
                end: req.dateTo,
                team: [employeeName],
                status: 'done' // Visual style (grayed out usually)
            });
        }
    }

    return events;
}
