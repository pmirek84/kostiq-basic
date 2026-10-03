import { executeImportTimeEntries, executeClearTimeEntries } from '../services/domain/timeTrackingBatchService';
import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { Employee, Subcontractor, TimeEntry, Message, Request, RequestStatus, Settlement, WorkerType, Crew } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { MongoRepository } from '../services/data/MongoRepository';
import type { TiCoRepository } from '../services/data/TiCoRepository';
import { useAuth } from './AuthContext';

export type CreateSettlementInput = {
    workerId: string;
    workerType: WorkerType;
    periodFrom: string;
    periodTo: string;
    timeEntryIds: string[]; // only approved + no settlementId
    notes?: string;
    idempotencyKey?: string;
};

export type CreateContractSettlementInput = {
    contractId: string;
    subcontractorId: string;
    jobId: string;
    stageId?: string;
    amount: number;
    exchangeRate?: number;
    periodFrom: string;
    periodTo: string;
    notes?: string;
    idempotencyKey: string;
};

export type BatchOperationResult = {
    succeeded: number;
    failed: number;
    errors: string[];
};

export type LoadStatus = 'loading' | 'complete' | 'failed';

interface TiCoContextType {
    employees: Employee[];
    subcontractors: Subcontractor[];
    timeEntries: TimeEntry[];
    settlements: Settlement[];
    crews: Crew[];
    messages: Message[];
    requests: Request[];
    isLoading: boolean;
    loadStatus: LoadStatus;
    mutationRevision: number;

    // Crew Actions
    createCrew: (input: { name: string; foremanId: string; memberIds: string[] }) => Promise<void>;
    updateCrew: (id: string, patch: Partial<Omit<Crew, 'id'>>) => Promise<void>;
    deactivateCrew: (id: string) => Promise<void>;

    // Employee Actions
    addEmployee: (emp: Omit<Employee, 'id'>) => Promise<void>;
    updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
    toggleEmployeeStatus: (id: string) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;

    // Subcontractor Actions
    addSubcontractor: (sub: Omit<Subcontractor, 'id'>) => Promise<void>;
    updateSubcontractor: (id: string, updates: Partial<Subcontractor>) => Promise<void>;
    toggleSubcontractorStatus: (id: string) => Promise<void>;

    // Time Entry Actions
    addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'cost' | 'status'> & Partial<Pick<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'cost' | 'status'>>) => Promise<void>;
    updateTimeEntry: (id: string, updates: Partial<TimeEntry>) => Promise<void>;
    deleteTimeEntry: (id: string) => Promise<void>;
    updateTimeEntryStatus: (id: string, status: TimeEntry['status']) => Promise<void>;
    batchUpdate: (ids: string[], updates: Partial<TimeEntry>) => Promise<void>;

    // Settlement Actions
    createSettlement: (input: CreateSettlementInput) => Promise<Settlement>;
    createContractSettlement: (input: CreateContractSettlementInput) => Promise<Settlement>;
    updateSettlement: (id: string, patch: Partial<Pick<Settlement, 'notes' | 'status'>>) => Promise<void>;
    recalculateSettlement: (id: string) => Promise<void>;
    markSettlementExported: (id: string) => Promise<void>;
    getSettlementsByWorker: (workerId: string) => Settlement[];
    getSettlementsByJob: (jobId: string) => Settlement[];
    getSettlementsByContract: (contractId: string) => Settlement[];

    // Aggregations (Synchronous based on loaded state)
    getTimeEntriesByJob: (jobId: string) => TimeEntry[];
    getTimeEntriesByStage: (stageId: string) => TimeEntry[];

    // Messages
    sendMessage: (msg: Omit<Message, 'id' | 'createdAt' | 'read'>) => Promise<void>;
    markMessageAsRead: (id: string) => Promise<void>;

    // Requests
    addRequest: (req: Omit<Request, 'id' | 'createdAt' | 'status'>) => Promise<void>;
    updateRequestStatus: (id: string, status: RequestStatus, comment?: string) => Promise<void>;

    // Legacy / Utils
    importTimeEntries: (entries: TimeEntry[]) => Promise<BatchOperationResult>;
    clearTimeEntries: () => Promise<BatchOperationResult>;
}

export const TiCoContext = createContext<TiCoContextType | undefined>(undefined);

export const TiCoProvider = ({ children }: { children: ReactNode }) => {
    // Repository Instance: strictly MongoDB as sole source of truth
    const repository: TiCoRepository = useMemo(() => new MongoRepository(), []);

    const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
    const isLoading = loadStatus === 'loading';
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
    const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [crews, setCrews] = useState<Crew[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [requests, setRequests] = useState<Request[]>([]);
    const [mutationRevision, setMutationRevision] = useState(0);

    const { token } = useAuth();

    // Load Initial Data
    useEffect(() => {
        // Don't load if no token (not logged in)
        if (!token) {
            setLoadStatus('complete');
            return;
        }
        const loadData = async () => {
            setLoadStatus('loading');
            try {
                let fetchFailed = false;
                // Fetch each collection independently, tracking failures
                const safe = async <T,>(fn: () => Promise<T[]>, fallback: T[] = []): Promise<T[]> => {
                    try { return await fn(); }
                    catch (e) { 
                        console.warn('[TiCoContext] Collection fetch failed:', e); 
                        fetchFailed = true;
                        return fallback; 
                    }
                };

                let [emps, subs, times, sets, crewList, msgs, reqs] = await Promise.all([
                    safe(() => repository.getEmployees()),
                    safe(() => repository.getSubcontractors()),
                    safe(() => repository.getTimeEntries()),
                    safe(() => repository.getSettlements()),
                    safe(() => repository.getCrews()),
                    safe(() => repository.getMessages()),
                    safe(() => repository.getRequests()),
                ]);

                if (fetchFailed) {
                    console.error('[TiCoContext] Data fetch encountered errors - marking loadStatus as failed');
                    setLoadStatus('failed');
                    return;
                }

                setEmployees(emps);
                setSubcontractors(subs);
                setTimeEntries(times);
                setSettlements(sets);
                setCrews(crewList);
                setMessages(msgs);
                setRequests(reqs);
                setLoadStatus('complete');
            } catch (error) {
                console.error("Failed to load TiCo data:", error);
                setLoadStatus('failed');
            }
        };
        loadData();
    }, [repository, token]);

    // --- Employee Handlers ---
    const addEmployee = async (emp: Omit<Employee, 'id'>) => {
        const newEmp = { ...emp, id: uuidv4() };
        await repository.createEmployee(newEmp);
        setEmployees(prev => [...prev, newEmp]);
    };
    const updateEmployee = async (id: string, updates: Partial<Employee>) => {
        await repository.updateEmployee(id, updates);
        setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    };
    const toggleEmployeeStatus = async (id: string) => {
        const emp = employees.find(e => e.id === id);
        if (!emp) return;
        await updateEmployee(id, { isActive: !emp.isActive });
    };
    const deleteEmployee = async (id: string) => {
        await repository.deleteEmployee(id);
        setEmployees(prev => prev.filter(e => e.id !== id));
    };

    // --- Subcontractor Handlers ---
    const addSubcontractor = async (sub: Omit<Subcontractor, 'id'>) => {
        const newSub = { ...sub, id: uuidv4() };
        await repository.createSubcontractor(newSub);
        setSubcontractors(prev => [...prev, newSub]);
    };
    const updateSubcontractor = async (id: string, updates: Partial<Subcontractor>) => {
        await repository.updateSubcontractor(id, updates);
        setSubcontractors(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };
    const toggleSubcontractorStatus = async (id: string) => {
        const sub = subcontractors.find(s => s.id === id);
        if (!sub) return;
        await updateSubcontractor(id, { isActive: !sub.isActive });
    };

    // --- Crew Handlers ---
    const createCrew = async (input: { name: string; foremanId: string; memberIds: string[] }) => {
        const newCrew: Crew = {
            id: uuidv4(),
            name: input.name,
            foremanId: input.foremanId,
            memberIds: input.memberIds,
            active: true
        };
        await repository.createCrew(newCrew);
        setCrews(prev => [...prev, newCrew]);

        // Sync workers - assign crewId
        const idsToUpdate = new Set([...input.memberIds, input.foremanId]);

        // Optimistic update local
        setEmployees(prev => prev.map(e => idsToUpdate.has(e.id) ? { ...e, crewId: newCrew.id } : e));
        setSubcontractors(prev => prev.map(s => idsToUpdate.has(s.id) ? { ...s, crewId: newCrew.id } : s));

        for (const id of idsToUpdate) {
            if (employees.some(e => e.id === id)) {
                await repository.updateEmployee(id, { crewId: newCrew.id });
            } else if (subcontractors.some(s => s.id === id)) {
                await repository.updateSubcontractor(id, { crewId: newCrew.id });
            }
        }
    };

    const updateCrew = async (id: string, patch: Partial<Omit<Crew, 'id'>>) => {
        const crew = crews.find(c => c.id === id);
        if (!crew) return;

        await repository.updateCrew(id, patch);
        setCrews(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

        if (patch.memberIds) {
            const oldSet = new Set(crew.memberIds);
            const newSet = new Set(patch.memberIds);

            const removed = [...oldSet].filter(x => !newSet.has(x));
            const added = [...newSet].filter(x => !oldSet.has(x));

            const removedSet = new Set(removed);
            const addedSet = new Set(added);

            if (removed.length > 0) {
                setEmployees(prev => prev.map(e => removedSet.has(e.id) && e.crewId === id ? { ...e, crewId: null } : e));
                setSubcontractors(prev => prev.map(s => removedSet.has(s.id) && s.crewId === id ? { ...s, crewId: null } : s));
            }
            if (added.length > 0) {
                setEmployees(prev => prev.map(e => addedSet.has(e.id) ? { ...e, crewId: id } : e));
                setSubcontractors(prev => prev.map(s => addedSet.has(s.id) ? { ...s, crewId: id } : s));
            }

            for (const uid of removed) {
                if (employees.some(e => e.id === uid)) await repository.updateEmployee(uid, { crewId: null });
                else await repository.updateSubcontractor(uid, { crewId: null });
            }
            for (const uid of added) {
                if (employees.some(e => e.id === uid)) await repository.updateEmployee(uid, { crewId: id });
                else await repository.updateSubcontractor(uid, { crewId: id });
            }
        }
    };

    const deactivateCrew = async (id: string) => {
        await updateCrew(id, { active: false });
    };

    // --- Time Entry Handlers ---
    const addTimeEntry = async (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'cost' | 'status'> & Partial<Pick<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'cost' | 'status'>>) => {
        // FIX #5: Snapshot employeeName - ensures historical records retain name after soft-delete
        let employeeName = (entry as any).employeeName;
        if (!employeeName && entry.employeeId) {
            const emp = employees.find(e => e.id === entry.employeeId);
            if (emp) employeeName = emp.firstName + ' ' + emp.lastName;
        }

        // Estimate client-side fallback cost (server authoritative calculation will normalize on persist)
        let fallbackCost = entry.cost;
        if (fallbackCost === undefined) {
            if (entry.billingType === 'hourly') {
                fallbackCost = entry.hours * (entry.hourlyRate || 0);
            } else if (entry.billingType === 'daily') {
                const emp = employees.find(e => e.id === entry.employeeId);
                const dailyRate = emp?.dailyRate || entry.hourlyRate || 0;
                fallbackCost = entry.hours * dailyRate;
            } else if (entry.billingType === 'project') {
                const emp = employees.find(e => e.id === entry.employeeId);
                fallbackCost = emp?.projectRate || entry.hourlyRate || 0;
            } else {
                fallbackCost = (entry.rate || 0) * (entry.quantity || 1);
            }
        }

        const candidateEntry: TimeEntry = {
            ...entry,
            ...(employeeName ? { employeeName } : {}),
            id: entry.id || uuidv4(),
            status: entry.status || 'submitted',
            cost: fallbackCost,
            createdAt: entry.createdAt || new Date().toISOString(),
            updatedAt: entry.updatedAt || new Date().toISOString()
        };

        const savedEntry = await repository.createTimeEntry(candidateEntry);
        // Canonical record returned by backend repository is stored into local state.
        // This guarantees UI and aggregations reflect server-normalized dates, statuses, snapshot rates, and costs.
        const finalEntry = (savedEntry && typeof savedEntry === 'object' && savedEntry.id)
            ? { ...candidateEntry, ...savedEntry }
            : candidateEntry;

        setTimeEntries(prev => [...prev, finalEntry]);
        setMutationRevision(prev => prev + 1);
    };

    const updateTimeEntry = async (id: string, updates: Partial<TimeEntry>) => {
        const current = timeEntries.find(t => t.id === id);
        if (!current) return;

        let cost = current.cost;
        const potential = { ...current, ...updates };

        if (updates.hours !== undefined || updates.hourlyRate !== undefined || updates.billingType !== undefined) {
            if (potential.billingType === 'hourly') {
                cost = (potential.hours || 0) * (potential.hourlyRate || 0);
            }
        }

        const finalUpdates = { ...updates, cost, updatedAt: new Date().toISOString() };
        const savedUpdates = await repository.updateTimeEntry(id, finalUpdates);

        const merged = (savedUpdates && typeof savedUpdates === 'object' && savedUpdates.id)
            ? { ...current, ...finalUpdates, ...savedUpdates }
            : { ...current, ...finalUpdates };

        setTimeEntries(prev => prev.map(t => t.id === id ? merged : t));
        setMutationRevision(prev => prev + 1);
    };

    const deleteTimeEntry = async (id: string) => {
        await repository.deleteTimeEntry(id);
        setTimeEntries(prev => prev.filter(t => t.id !== id));
        setMutationRevision(prev => prev + 1);
    };

    const updateTimeEntryStatus = async (id: string, status: TimeEntry['status']) => {
        await updateTimeEntry(id, { status });
    };

    const batchUpdate = async (ids: string[], updates: Partial<TimeEntry>) => {
        const updated = await repository.batchUpdateTimeEntries(ids, updates);
        if (Array.isArray(updated) && updated.length > 0) {
            const map = new Map(updated.map(t => [t.id, t]));
            setTimeEntries(prev => prev.map(t => map.get(t.id) || t));
        } else {
            setTimeEntries(prev => prev.map(t => ids.includes(t.id) ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
        }
        setMutationRevision(prev => prev + 1);
    };

    // --- Settlement Handlers ---
    const createSettlement = async (input: CreateSettlementInput): Promise<Settlement> => {
        if (typeof repository.createSettlementAtomic !== 'function') {
            throw new Error('Konfiguracja repozytorium nie wspiera transakcyjnego zapisu rozliczeń (createSettlementAtomic).');
        }

        const relevantAdvances = input.workerType === 'employee'
            ? requests.filter(r =>
                r.employeeId === input.workerId &&
                r.type === 'zaliczka' &&
                r.status === 'zaakceptowany' &&
                !r.settlementId
            )
            : [];

        const idempotencyKey = input.idempotencyKey || uuidv4();
        const result = await repository.createSettlementAtomic({
            workerId: input.workerId,
            workerType: input.workerType,
            periodFrom: input.periodFrom,
            periodTo: input.periodTo,
            timeEntryIds: input.timeEntryIds,
            advanceIds: relevantAdvances.map(r => r.id),
            notes: input.notes,
            idempotencyKey
        });

        const newSettlement = result.settlement;
        const settledIds = new Set(result.updatedTimeEntryIds || input.timeEntryIds);
        const settledAdvanceIds = new Set(result.updatedAdvanceIds || relevantAdvances.map(r => r.id));

        setSettlements(prev => [...prev, newSettlement]);
        setTimeEntries(prev => prev.map(t => settledIds.has(t.id) ? { ...t, settlementId: newSettlement.id } : t));
        setRequests(prev => prev.map(r => settledAdvanceIds.has(r.id) ? { ...r, settlementId: newSettlement.id } : r));
        setMutationRevision(prev => prev + 1);

        return newSettlement;
    };

    const createContractSettlement = async (input: CreateContractSettlementInput): Promise<Settlement> => {
        // [P1 FIX] Contract settlements use domain transactional endpoint with mandatory idempotency
        if (!input.idempotencyKey || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim() === '') {
            throw new Error('idempotencyKey jest wymagany dla createContractSettlement.');
        }
        const atomicResult = await repository.createSettlementAtomic({
            workerId: input.subcontractorId,
            workerType: 'subcontractor',
            periodFrom: input.periodFrom,
            periodTo: input.periodTo,
            timeEntryIds: [],
            advanceIds: [],
            type: 'contract',
            contractId: input.contractId,
            jobId: input.jobId,
            stageId: input.stageId || undefined,
            amount: input.amount,
            exchangeRate: input.exchangeRate,
            notes: input.notes,
            idempotencyKey: input.idempotencyKey.trim()
        });

        const newSettlement = atomicResult.settlement;
        setSettlements(prev => [...prev, newSettlement]);
        setMutationRevision(prev => prev + 1);

        return newSettlement;
    };

    const updateSettlement = async (id: string, patch: Partial<Pick<Settlement, 'notes' | 'status'>>) => {
        await repository.updateSettlement(id, patch);
        setSettlements(prev => prev.map(s => s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s));
        setMutationRevision(prev => prev + 1);
    };

    const recalculateSettlement = async (id: string) => {
        // [P1 FIX] Authoritative server-side settlement recalculation based on actual DB records
        const updated = await repository.recalculateSettlement(id);
        setSettlements(prev => prev.map(s => s.id === id ? updated : s));
        setMutationRevision(prev => prev + 1);
    };

    const markSettlementExported = async (id: string) => {
        await updateSettlement(id, { status: 'exported' });
    };

    const getSettlementsByWorker = (workerId: string) => settlements.filter(s => s.workerId === workerId);

    const getSettlementsByJob = (jobId: string) => {
        const jobEntryIds = new Set(timeEntries.filter(t => t.jobId === jobId).map(t => t.id));
        const hourlyMatches = settlements.filter(s => s.timeEntryIds.some(tid => jobEntryIds.has(tid)));
        const contractMatches = settlements.filter(s => s.type === 'contract' && s.jobId === jobId);
        return [...hourlyMatches, ...contractMatches];
    };

    const getSettlementsByContract = (contractId: string) => settlements.filter(s => s.contractId === contractId);

    // --- Message Handlers ---
    const sendMessage = async (msg: Omit<Message, 'id' | 'createdAt' | 'read'>) => {
        const newMsg = {
            ...msg,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            read: false
        };
        await repository.createMessage(newMsg);
        setMessages(prev => [...prev, newMsg]);
    };
    const markMessageAsRead = async (id: string) => {
        await repository.updateMessage(id, { read: true });
        setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
    };

    // --- Request Handlers ---
    const addRequest = async (req: Omit<Request, 'id' | 'createdAt' | 'status'>) => {
        const newReq = {
            ...req,
            id: uuidv4(),
            status: 'oczekujący' as RequestStatus,
            createdAt: new Date().toISOString()
        };
        await repository.createRequest(newReq);
        setRequests(prev => [...prev, newReq]);
    };
    const updateRequestStatus = async (id: string, status: RequestStatus, comment?: string) => {
        await repository.updateRequest(id, { status, comment });
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status, comment } : r));
    };

    // --- Aggregations (Sync) ---
    const getTimeEntriesByJob = (jobId: string) => timeEntries.filter(t => t.jobId === jobId);
    const getTimeEntriesByStage = (stageId: string) => timeEntries.filter(t => t.stageId === stageId);

    // --- Legacy / Utils ---
            const importTimeEntries = async (entries: TimeEntry[]): Promise<BatchOperationResult> => {
        const { result, savedEntries } = await executeImportTimeEntries(entries, timeEntries, repository);
        if (savedEntries.length > 0) {
            // Upsert / merge in local state by ID to prevent duplicate UI items
            setTimeEntries(prev => {
                const map = new Map(prev.map(e => [e.id, e]));
                for (const s of savedEntries) {
                    map.set(s.id, s);
                }
                return Array.from(map.values());
            });
            setMutationRevision(prev => prev + 1);
        }
        return result;
    };

    const clearTimeEntries = async (): Promise<BatchOperationResult> => {
        const { result, deletedIds } = await executeClearTimeEntries(timeEntries, repository);
        if (deletedIds.size > 0) {
            setTimeEntries(prev => prev.filter(e => !deletedIds.has(e.id)));
            setMutationRevision(prev => prev + 1);
        }
        return result;
    };

    return (
        <TiCoContext.Provider value={{
            employees,
            subcontractors,
            timeEntries,
            settlements,
            crews,
            messages,
            requests,
            isLoading,
            loadStatus,
            mutationRevision,

            

            addEmployee,
            updateEmployee,
            toggleEmployeeStatus,
            deleteEmployee,

            addSubcontractor,
            updateSubcontractor,
            toggleSubcontractorStatus,

            createCrew,
            updateCrew,
            deactivateCrew,

            addTimeEntry,
            updateTimeEntry,
            deleteTimeEntry,
            updateTimeEntryStatus,
            batchUpdate,

            createSettlement,
            updateSettlement,
            recalculateSettlement,
            markSettlementExported,
            createContractSettlement,
            getSettlementsByWorker,
            getSettlementsByJob,
            getSettlementsByContract,

            getTimeEntriesByJob,
            getTimeEntriesByStage,
            sendMessage,
            markMessageAsRead,
            addRequest,
            updateRequestStatus,

            importTimeEntries,
            clearTimeEntries
        }}>
            {children}
        </TiCoContext.Provider>
    );
};

export const useTiCo = () => {
    const context = useContext(TiCoContext);
    if (!context) throw new Error('useTiCo must be used within TiCoProvider');
    return context;
};
