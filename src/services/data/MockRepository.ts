import type { TiCoRepository } from './TiCoRepository';
import type { Employee, Subcontractor, TimeEntry, Settlement, Crew, Message, Request } from '../../models/types';
import { mockEmployees } from '../../data/mockEmployees';
import { mockSubcontractors } from '../../data/mockSubcontractors';
import { mockTimeEntries } from '../../data/mockTimeEntries';
import { settlementStorage } from '../storage/settlementStorage';

// In-memory storage for the session
let employees = [...mockEmployees];
let subcontractors = [...mockSubcontractors];
let timeEntries = [...mockTimeEntries];
// let settlements: Settlement[] = []; // Removed in favor of settlementStorage
let crews: Crew[] = [];
let messages: Message[] = [
    { id: '1', fromId: 'emp1', toId: 'system', subject: 'Pytanie o grafik', content: 'Czy mogę prosić o zmianę zmiany w czwartek?', read: false, createdAt: new Date().toISOString(), type: 'message' },
    { id: '2', fromId: 'system', toId: 'all', subject: 'Spotkanie zespołu', content: 'Zapraszam na spotkanie w piątek o 10:00.', read: true, createdAt: new Date().toISOString(), type: 'memo' }
];
let requests: Request[] = [
    { id: '1', employeeId: 'emp1', type: 'urlop', status: 'oczekujący', dateFrom: '2026-02-01', dateTo: '2026-02-05', description: 'Wyjazd z rodziną', createdAt: new Date().toISOString() },
    { id: '2', employeeId: 'emp2', type: 'zaliczka', status: 'oczekujący', amount: 500, description: 'Zaliczka na materiały', createdAt: new Date().toISOString() }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockRepository implements TiCoRepository {

    async getEmployees(): Promise<Employee[]> {
        await delay(50);
        return [...employees];
    }
    async createEmployee(employee: Employee): Promise<Employee> {
        await delay(50);
        employees = [...employees, employee];
        return employee;
    }
    async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
        await delay(50);
        let updated: Employee | undefined;
        employees = employees.map(e => {
            if (e.id === id) {
                updated = { ...e, ...updates };
                return updated;
            }
            return e;
        });
        if (!updated) throw new Error('Employee not found');
        return updated;
    }
    async deleteEmployee(id: string): Promise<void> {
        await delay(50);
        employees = employees.filter(e => e.id !== id);
    }

    // Subcontractors
    async getSubcontractors(): Promise<Subcontractor[]> {
        await delay(50);
        return [...subcontractors];
    }
    async createSubcontractor(sub: Subcontractor): Promise<Subcontractor> {
        await delay(50);
        subcontractors = [...subcontractors, sub];
        return sub;
    }
    async updateSubcontractor(id: string, updates: Partial<Subcontractor>): Promise<Subcontractor> {
        await delay(50);
        let updated: Subcontractor | undefined;
        subcontractors = subcontractors.map(s => {
            if (s.id === id) {
                updated = { ...s, ...updates };
                return updated;
            }
            return s;
        });
        if (!updated) throw new Error('Subcontractor not found');
        return updated;
    }
    async deleteSubcontractor(id: string): Promise<void> {
        await delay(50);
        subcontractors = subcontractors.filter(s => s.id !== id);
    }

    // Crews
    async getCrews(): Promise<Crew[]> {
        await delay(50);
        return [...crews];
    }
    async createCrew(crew: Crew): Promise<Crew> {
        await delay(50);
        crews = [...crews, crew];
        return crew;
    }
    async updateCrew(id: string, updates: Partial<Crew>): Promise<Crew> {
        await delay(50);
        let updated: Crew | undefined;
        crews = crews.map(c => {
            if (c.id === id) {
                updated = { ...c, ...updates };
                return updated;
            }
            return c;
        });
        if (!updated) throw new Error('Crew not found');
        return updated;
    }

    // TimeEntries
    async getTimeEntries(): Promise<TimeEntry[]> {
        await delay(50);
        return [...timeEntries];
    }
    async createTimeEntry(entry: TimeEntry): Promise<TimeEntry> {
        await delay(50);
        timeEntries = [...timeEntries, entry];
        return entry;
    }
    async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
        await delay(50);
        let updated: TimeEntry | undefined;
        timeEntries = timeEntries.map(t => {
            if (t.id === id) {
                updated = { ...t, ...updates };
                return updated;
            }
            return t;
        });
        if (!updated) throw new Error('TimeEntry not found');
        return updated;
    }
    async deleteTimeEntry(id: string): Promise<void> {
        await delay(50);
        timeEntries = timeEntries.filter(t => t.id !== id);
    }
    async batchUpdateTimeEntries(ids: string[], updates: Partial<TimeEntry>): Promise<void> {
        await delay(50);
        timeEntries = timeEntries.map(t => ids.includes(t.id) ? { ...t, ...updates } : t);
    }

    // Settlements
    async getSettlements(): Promise<Settlement[]> {
        return await settlementStorage.getAll();
    }
    async createSettlement(settlement: Settlement): Promise<Settlement> {
        await settlementStorage.save(settlement);
        return settlement;
    }
    async updateSettlement(id: string, updates: Partial<Settlement>): Promise<Settlement> {
        const existing = await settlementStorage.getById(id);
        if (!existing) throw new Error('Settlement not found');

        const updated = { ...existing, ...updates };
        await settlementStorage.save(updated);
        return updated;
    }

    // Messages
    async getMessages(): Promise<Message[]> {
        await delay(50);
        return [...messages];
    }
    async createMessage(message: Message): Promise<Message> {
        await delay(50);
        messages = [...messages, message];
        return message;
    }
    async updateMessage(id: string, updates: Partial<Message>): Promise<Message> {
        await delay(50);
        let updated: Message | undefined;
        messages = messages.map(m => {
            if (m.id === id) {
                updated = { ...m, ...updates };
                return updated;
            }
            return m;
        });
        if (!updated) throw new Error('Message not found');
        return updated;
    }

    // Requests
    async getRequests(): Promise<Request[]> {
        await delay(50);
        return [...requests];
    }
    async createRequest(request: Request): Promise<Request> {
        await delay(50);
        requests = [...requests, request];
        return request;
    }
    async updateRequest(id: string, updates: Partial<Request>): Promise<Request> {
        await delay(50);
        let updated: Request | undefined;
        requests = requests.map(r => {
            if (r.id === id) {
                updated = { ...r, ...updates };
                return updated;
            }
            return r;
        });
        if (!updated) throw new Error('Request not found');
        return updated;
    }
}
