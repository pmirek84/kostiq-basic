import type { Employee, Subcontractor, TimeEntry, Settlement, Crew, Message, Request } from '../../models/types';

export interface TiCoRepository {
    // Employees
    getEmployees(): Promise<Employee[]>;
    createEmployee(employee: Employee): Promise<Employee>;
    updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee>;
    deleteEmployee(id: string): Promise<void>;

    // Subcontractors
    getSubcontractors(): Promise<Subcontractor[]>;
    createSubcontractor(subcontractor: Subcontractor): Promise<Subcontractor>;
    updateSubcontractor(id: string, updates: Partial<Subcontractor>): Promise<Subcontractor>;
    deleteSubcontractor(id: string): Promise<void>;

    // Crews
    getCrews(): Promise<Crew[]>;
    createCrew(crew: Crew): Promise<Crew>;
    updateCrew(id: string, updates: Partial<Crew>): Promise<Crew>;

    // TimeEntries
    getTimeEntries(): Promise<TimeEntry[]>;
    createTimeEntry(entry: TimeEntry): Promise<TimeEntry>;
    updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry>;
    deleteTimeEntry(id: string): Promise<void>;
    batchUpdateTimeEntries(ids: string[], updates: Partial<TimeEntry>): Promise<void>;
    batchImportTimeEntries?(entries: TimeEntry[]): Promise<{ succeeded: number; failed: number; errors: string[] }>;

    // Settlements
    getSettlements(): Promise<Settlement[]>;
    createSettlement(settlement: Settlement): Promise<Settlement>;
    updateSettlement(id: string, updates: Partial<Settlement>): Promise<Settlement>;

    // Messages & Requests
    getMessages(): Promise<Message[]>;
    createMessage(message: Message): Promise<Message>;
    updateMessage(id: string, updates: Partial<Message>): Promise<Message>;

    getRequests(): Promise<Request[]>;
    createRequest(request: Request): Promise<Request>;
    updateRequest(id: string, updates: Partial<Request>): Promise<Request>;
}
