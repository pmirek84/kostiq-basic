import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { TiCoProvider, useTiCo } from '../TiCoContext';
import { JobsProvider, useJobs } from '../JobsContext';
import { useTiCoJobsSync } from '../../hooks/useTiCoJobsSync';
import { jobStorage } from '../../services/storage/jobStorage';

vi.mock('../AuthContext', () => ({
    useAuth: () => ({ token: 'mock-token', user: { id: 'admin-1', role: 'admin' } })
}));

vi.mock('../ClientsContext', () => ({
    useClients: () => ({ clients: [] })
}));

vi.mock('../../services/data/MongoRepository', () => {
    return {
        MongoRepository: vi.fn().mockImplementation(function(this: any) {
            this.getEmployees = vi.fn().mockResolvedValue([]);
            this.getSubcontractors = vi.fn().mockResolvedValue([]);
            this.getTimeEntries = vi.fn().mockResolvedValue([]);
            this.getSettlements = vi.fn().mockResolvedValue([]);
            this.getCrews = vi.fn().mockResolvedValue([]);
            this.getMessages = vi.fn().mockResolvedValue([]);
            this.getRequests = vi.fn().mockResolvedValue([]);
            this.createTimeEntry = vi.fn().mockImplementation(async (entry) => ({ ...entry, id: entry.id || 'te-saved-1' }));
            this.updateTimeEntry = vi.fn().mockImplementation(async (id, updates) => ({ id, ...updates }));
            this.deleteTimeEntry = vi.fn().mockResolvedValue(undefined);
            this.createSettlement = vi.fn().mockImplementation(async (s) => s);
            this.batchUpdateTimeEntries = vi.fn().mockImplementation(async (ids: string[], updates: any) => {
                return ids.map((id: string) => ({
                    id,
                    jobId: 'job-1',
                    employeeId: 'emp-1',
                    hours: 4,
                    hourlyRate: 60,
                    cost: 240,
                    workerType: 'employee',
                    activityType: 'work',
                    status: updates.status || 'approved',
                    updatedAt: '2026-10-01T12:00:00.000Z'
                }));
            });
        })
    };
});

describe('Integration: TiCo Mutation Invalidation of Jobs UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(jobStorage, 'getAllJobs').mockResolvedValue([
            {
                id: 'job-1',
                jobCode: 'J-001',
                name: 'Zlecenie Testowe',
                status: 'in_progress',
                clientId: 'c1',
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
                actualLaborHours: 15,
                actualLaborCost: 1500,
                settledLaborCost: 0,
                stages: []
            } as any
        ]);
        vi.spyOn(jobStorage, 'saveJob').mockResolvedValue({} as any);
    });

    it('single TiCo mutation causes exactly one refreshJobs call — without saving Job or entering a refresh loop', async () => {
        const getAllJobsSpy = vi.spyOn(jobStorage, 'getAllJobs');
        const saveJobSpy = vi.spyOn(jobStorage, 'saveJob');

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <JobsProvider>
                <TiCoProvider>
                    {children}
                </TiCoProvider>
            </JobsProvider>
        );

        const { result } = renderHook(() => {
            useTiCoJobsSync();
            const tico = useTiCo();
            const jobs = useJobs();
            return { tico, jobs };
        }, { wrapper });

        // Wait for initial mount loading
        await waitFor(() => {
            expect(result.current.tico.loadStatus).toBe('complete');
            expect(result.current.jobs.jobs.length).toBe(1);
        });

        // On initial mount: JobsProvider called getAllJobs once.
        const mountCalls = getAllJobsSpy.mock.calls.length;
        expect(mountCalls).toBeGreaterThanOrEqual(1);
        expect(result.current.tico.mutationRevision).toBe(0);
        expect(saveJobSpy).not.toHaveBeenCalled();

        // 1. Perform ADD mutation
        await act(async () => {
            await result.current.tico.addTimeEntry({
                id: 'te-1',
                jobId: 'job-1',
                employeeId: 'emp-1',
                date: '2026-10-01',
                hours: 8,
                billingType: 'hourly'
            } as any);
        });

        await waitFor(() => {
            expect(result.current.tico.mutationRevision).toBe(1);
        });

        // Exactly 1 additional getAllJobs call occurred
        expect(getAllJobsSpy).toHaveBeenCalledTimes(mountCalls + 1);
        // Backend recalculates; frontend NEVER writes Job aggregates
        expect(saveJobSpy).not.toHaveBeenCalled();

        // 2. Perform EDIT mutation
        await act(async () => {
            await result.current.tico.updateTimeEntry('te-1', { hours: 10 });
        });

        await waitFor(() => {
            expect(result.current.tico.mutationRevision).toBe(2);
        });

        expect(getAllJobsSpy).toHaveBeenCalledTimes(mountCalls + 2);
        expect(saveJobSpy).not.toHaveBeenCalled();

        // 3. Perform DELETE mutation
        await act(async () => {
            await result.current.tico.deleteTimeEntry('te-1');
        });

        await waitFor(() => {
            expect(result.current.tico.mutationRevision).toBe(3);
        });

        expect(getAllJobsSpy).toHaveBeenCalledTimes(mountCalls + 3);
        expect(saveJobSpy).not.toHaveBeenCalled();

        // Wait 100ms to confirm no runaway debounce/polling loops fire
        await new Promise((r) => setTimeout(r, 100));
        expect(getAllJobsSpy).toHaveBeenCalledTimes(mountCalls + 3);
        expect(saveJobSpy).not.toHaveBeenCalled();
    });

    it('[P2] batchUpdate merges authoritative server-calculated fields into local timeEntries state', async () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <JobsProvider>
                <TiCoProvider>
                    {children}
                </TiCoProvider>
            </JobsProvider>
        );

        const { result } = renderHook(() => ({
            tico: useTiCo(),
            jobs: useJobs()
        }), { wrapper });

        // Wait for initial mount loading
        await waitFor(() => {
            expect(result.current.tico.loadStatus).toBe('complete');
        });

        // 1. Seed a local time entry
        await act(async () => {
            await result.current.tico.addTimeEntry({
                id: 'te-server-calc-1',
                jobId: 'job-1',
                employeeId: 'emp-1',
                hours: 4,
                hourlyRate: 30, // old client state
                cost: 120,       // old client state
                date: '2026-10-01',
                status: 'submitted',
                type: 'work',
                activityType: 'work',
                workerType: 'employee',
                billingType: 'hourly'
            } as any);
        });

        await waitFor(() => {
            expect(result.current.tico.timeEntries.some(t => t.id === 'te-server-calc-1')).toBe(true);
        });

        // 2. Execute batchUpdate with only status in payload
        await act(async () => {
            await result.current.tico.batchUpdate(['te-server-calc-1'], { status: 'approved' });
        });

        // 3. Local state must reflect the server-returned authoritative cost (240) and rate (60)
        await waitFor(() => {
            const updatedEntry = result.current.tico.timeEntries.find(t => t.id === 'te-server-calc-1');
            expect(updatedEntry).toBeDefined();
            expect(updatedEntry?.status).toBe('approved');
            expect(updatedEntry?.cost).toBe(240); // Merged from server-returned document, NOT stale client 120
            expect(updatedEntry?.hourlyRate).toBe(60); // Merged from server-returned document, NOT stale client 30
        });
    });
});
