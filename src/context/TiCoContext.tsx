import { executeImportTimeEntries, executeClearTimeEntries } from '../services/domain/timeTrackingBatchService';
import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { Employee, Subcontractor, TimeEntry, Message, Request, RequestStatus, Settlement, WorkerType, Crew } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { MockRepository } from '../services/data/MockRepository';
import { MongoRepository } from '../services/data/MongoRepository';
import type { TiCoRepository } from '../services/data/TiCoRepository';
import { useAuth } from './AuthContext';

// Flag to switch between adapters
const USE_MONGO = true;

export type CreateSettlementInput = {
    workerId: string;
    workerType: WorkerType;
    periodFrom: string;
    periodTo: string;
    timeEntryIds: string[]; // only approved + no settlementId
    notes?: string;
};

export type CreateContractSettlementInput = {
    contractId: string;
    subcontractorId: string;
    jobId: string;
    stageId?: string;
    amount: number;
    periodFrom: string;
    periodTo: string;
    notes?: string;
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
    addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'cost' | 'status'>) => Promise<void>;
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
    // Repository Instance
    const repository: TiCoRepository = useMemo(() => {
        return USE_MONGO ? new MongoRepository() : new MockRepository();
    }, []);

    const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
    const isLoading = loadStatus === 'loading';
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
    const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [crews, setCrews] = useState<Crew[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [requests, setRequests] = useState<Request[]>([]);

    const { token } = useAuth();

    // Load Initial Data
    useEffect(() => {
        // Don't load if no token (not logged in)
        if (USE_MONGO && !token) {
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

                // In USE_MONGO mode, NEVER auto-seed client side upon empty state
                const shouldSeed = !USE_MONGO && emps.length === 0;

                if (shouldSeed) {
                    console.log("[TiCoContext] No employees found (mock mode) — seeding default employees...");

                    const JAN_ID = uuidv4();
                    const PIOTR_ID = uuidv4();
                    const ADAM_ID = uuidv4();
                    const TOMEK_ID = uuidv4();
                    const CREW_1_ID = uuidv4();

                    const seedEmps: Employee[] = [
                        { id: JAN_ID, type: 'employee', firstName: 'Jan', lastName: 'Kowalski', role: 'foreman', isActive: true, hourlyRate: 45, defaultHourlyRate: 45, dailyRate: 350, projectRate: 1500, currency: 'PLN', crewId: CREW_1_ID },
                        { id: PIOTR_ID, type: 'employee', firstName: 'Piotr', lastName: 'Nowak', role: 'worker', isActive: true, hourlyRate: 35, defaultHourlyRate: 35, dailyRate: 280, projectRate: 1200, currency: 'PLN', crewId: CREW_1_ID },
                        { id: ADAM_ID, type: 'employee', firstName: 'Adam', lastName: 'Wiśniewski', role: 'worker', isActive: true, hourlyRate: 32, defaultHourlyRate: 32, dailyRate: 250, projectRate: 1000, currency: 'PLN', crewId: CREW_1_ID },
                        { id: TOMEK_ID, type: 'employee', firstName: 'Tomasz', lastName: 'Wójcik', role: 'worker', isActive: true, hourlyRate: 30, defaultHourlyRate: 30, dailyRate: 240, projectRate: 900, currency: 'PLN' }
                    ];

                    const seedCrews: Crew[] = [
                        { id: CREW_1_ID, name: 'Ekipa 1 (Jan)', foremanId: JAN_ID, memberIds: [PIOTR_ID, ADAM_ID], active: true }
                    ];

                    try {
                        for (const e of seedEmps) await repository.createEmployee(e);
                        for (const c of seedCrews) await repository.createCrew(c);
                        emps = seedEmps;
                        crewList = seedCrews;
                    } catch (seedErr) {
                        console.error("[TiCoContext] Failed to seed default data:", seedErr);
                    }
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
    const addTimeEntry = async (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'cost' | 'status'>) => {
        let cost = 0;
        if (entry.billingType === 'hourly') {
            cost = entry.hours * (entry.hourlyRate || 0);
        } else {
            cost = (entry.rate || 0) * (1);
        }

        // FIX #5: Snapshot employeeName — ensures historical records retain name after soft-delete
        let employeeName = (entry as any).employeeName;
        if (!employeeName && entry.employeeId) {
            const emp = employees.find(e => e.id === entry.employeeId);
            if (emp) employeeName = `${emp.firstName} ${emp.lastName}`;
        }

        const newEntry: TimeEntry = {
            ...entry,
            ...(employeeName ? { employeeName } : {}),
            id: uuidv4(),
            status: 'approved',
            cost,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await repository.createTimeEntry(newEntry);
        setTimeEntries(prev => [...prev, newEntry]);
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
        await repository.updateTimeEntry(id, finalUpdates);

        setTimeEntries(prev => prev.map(t => t.id === id ? { ...t, ...finalUpdates } : t));
    };

    const deleteTimeEntry = async (id: string) => {
        await repository.deleteTimeEntry(id);
        setTimeEntries(prev => prev.filter(t => t.id !== id));
    };

    const updateTimeEntryStatus = async (id: string, status: TimeEntry['status']) => {
        await updateTimeEntry(id, { status });
    };

    const batchUpdate = async (ids: string[], updates: Partial<TimeEntry>) => {
        await repository.batchUpdateTimeEntries(ids, updates);
        setTimeEntries(prev => prev.map(t => ids.includes(t.id) ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
    };

    // --- Settlement Handlers ---
    const createSettlement = async (input: CreateSettlementInput): Promise<Settlement> => {
        const candidates = timeEntries.filter(t =>
            input.timeEntryIds.includes(t.id) &&
            t.status === 'approved' &&
            !t.settlementId
        );

        // OVERTIME LOGIC: Group entries by date
        const dailyHoursMap = new Map<string, number>();
        candidates.forEach(t => {
            const current = dailyHoursMap.get(t.date) || 0;
            dailyHoursMap.set(t.date, current + t.hours);
        });

        let overtimeHours = 0;
        let overtimePay = 0;
        let baseAmount = candidates.reduce((sum, t) => sum + t.cost, 0);

        const firstHourlyRate = candidates.find(c => c.hourlyRate)?.hourlyRate || 0;

        dailyHoursMap.forEach((hours) => {
            if (hours > 8) {
                const dailyOvertime = hours - 8;
                overtimeHours += dailyOvertime;
                overtimePay += dailyOvertime * firstHourlyRate * 0.5; // Additional 50%
            }
        });

        const grossAmount = baseAmount + overtimePay;

        // ADVANCE DEDUCTIONS: Approved zaliczka requests for this worker in this period
        const relevantAdvances = requests.filter(r =>
            r.employeeId === input.workerId &&
            r.type === 'zaliczka' &&
            r.status === 'zaakceptowany' &&
            !r.settlementId
        );
        const advanceDeductions = relevantAdvances.reduce((sum, r) => sum + (r.amount || 0), 0);
        const totalAmount = grossAmount - advanceDeductions;

        let workerName = 'Nieznany';
        if (input.workerType === 'employee') {
            const emp = employees.find(e => e.id === input.workerId);
            if (emp) workerName = `${emp.firstName} ${emp.lastName}`;
        } else {
            const sub = subcontractors.find(s => s.id === input.workerId);
            if (sub) workerName = sub.name;
        }

        const newSettlement: Settlement = {
            id: uuidv4(),
            workerId: input.workerId,
            workerType: input.workerType,
            workerName,
            periodFrom: input.periodFrom,
            periodTo: input.periodTo,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timeEntryIds: candidates.map(c => c.id),
            totalHours: candidates.reduce((sum, t) => sum + t.hours, 0),
            totalAmount,
            grossAmount,
            overtimeHours,
            overtimePay,
            advanceDeductions,
            currency: 'PLN',
            status: 'open',
            notes: input.notes,
            type: 'hourly'
        };

        const settledIds = new Set(candidates.map(c => c.id));
        const advanceIds = relevantAdvances.map(a => a.id);

        // 1. Create Settlement
        await repository.createSettlement(newSettlement);
        // 2. Batch Update Time Entries
        await repository.batchUpdateTimeEntries(input.timeEntryIds, { settlementId: newSettlement.id });
        // 3. Link Advances
        for (const advId of advanceIds) {
            await repository.updateRequest(advId, { settlementId: newSettlement.id });
        }

        // Update Local State
        setSettlements(prev => [...prev, newSettlement]);
        setTimeEntries(prev => prev.map(t =>
            settledIds.has(t.id) ? { ...t, settlementId: newSettlement.id } : t
        ));
        setRequests(prev => prev.map(r =>
            advanceIds.includes(r.id) ? { ...r, settlementId: newSettlement.id } : r
        ));

        return newSettlement;
    };

    const createContractSettlement = async (input: CreateContractSettlementInput): Promise<Settlement> => {
        const sub = subcontractors.find(s => s.id === input.subcontractorId);
        const workerName = sub ? sub.name : 'Unknown';

        const newSettlement: Settlement = {
            id: uuidv4(),
            workerId: input.subcontractorId,
            workerType: 'subcontractor',
            workerName,
            periodFrom: input.periodFrom,
            periodTo: input.periodTo,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timeEntryIds: [], // Linked to contract, not time entries
            totalHours: 0,    // Contract based
            totalAmount: input.amount,
            currency: 'PLN',
            status: 'open',
            notes: input.notes,
            type: 'contract',
            contractId: input.contractId,
            jobId: input.jobId,
            stageId: input?.stageId || undefined,
            grossAmount: input.amount,
            overtimeHours: 0,
            overtimePay: 0,
            advanceDeductions: 0
        };

        await repository.createSettlement(newSettlement);
        setSettlements(prev => [...prev, newSettlement]);

        return newSettlement;
    };

    const updateSettlement = async (id: string, patch: Partial<Pick<Settlement, 'notes' | 'status'>>) => {
        await repository.updateSettlement(id, patch);
        setSettlements(prev => prev.map(s => s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s));
    };

    const recalculateSettlement = async (id: string) => {
        const settlement = settlements.find(s => s.id === id);
        if (!settlement) return;

        const linkedEntries = timeEntries.filter(t => settlement.timeEntryIds.includes(t.id));
        const totalHours = linkedEntries.reduce((sum, t) => sum + t.hours, 0);
        const baseAmount = linkedEntries.reduce((sum, t) => sum + t.cost, 0);

        const dailyHoursMap = new Map<string, number>();
        linkedEntries.forEach(t => {
            const current = dailyHoursMap.get(t.date) || 0;
            dailyHoursMap.set(t.date, current + t.hours);
        });

        let overtimeHours = 0;
        let overtimePay = 0;
        const firstHourlyRate = linkedEntries.find(c => c.hourlyRate)?.hourlyRate || 0;

        dailyHoursMap.forEach((hours) => {
            if (hours > 8) {
                const dailyOvertime = hours - 8;
                overtimeHours += dailyOvertime;
                overtimePay += dailyOvertime * firstHourlyRate * 0.5;
            }
        });

        const grossAmount = baseAmount + overtimePay;
        const advanceDeductions = settlement.advanceDeductions || 0;
        const totalAmount = grossAmount - advanceDeductions;

        const updates = {
            totalHours,
            totalAmount,
            grossAmount,
            overtimePay,
            overtimeHours,
            updatedAt: new Date().toISOString()
        };
        await repository.updateSettlement(id, updates);
        setSettlements(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
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
        }
        return result;
    };

    const clearTimeEntries = async (): Promise<BatchOperationResult> => {
        const { result, deletedIds } = await executeClearTimeEntries(timeEntries, repository);
        if (deletedIds.size > 0) {
            setTimeEntries(prev => prev.filter(e => !deletedIds.has(e.id)));
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
