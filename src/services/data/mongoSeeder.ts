import { MongoRepository } from './MongoRepository';
import { mockEmployees } from '../../data/mockEmployees';
import { mockSubcontractors } from '../../data/mockSubcontractors';
import { mockTimeEntries } from '../../data/mockTimeEntries';

export const seedMongoDatabase = async () => {
    const repo = new MongoRepository();

    // Check connection first by fetching employees
    try {
        await repo.getEmployees();
    } catch (e) {
        console.error("Cannot connect to backend", e);
        throw new Error("Brak połączenia z backendem. Upewnij się, że serwer i baza danych działają.");
    }

    // 1. Employees
    console.log("Seeding employees...");
    for (const emp of mockEmployees) {
        try {
            await repo.createEmployee(emp);
        } catch (e) {
            console.warn(`Skipping employee ${emp.id}`, e);
        }
    }

    // 2. Subcontractors
    console.log("Seeding subcontractors...");
    for (const sub of mockSubcontractors) {
        try {
            await repo.createSubcontractor(sub);
        } catch (e) {
            console.warn(`Skipping subcontractor ${sub.id}`, e);
        }
    }

    // 3. TimeEntries
    console.log("Seeding time entries...");
    for (const entry of mockTimeEntries) {
        try {
            // Ensure status is valid string literal if needed, but mock data should be fine
            await repo.createTimeEntry(entry);
        } catch (e) {
            console.warn(`Skipping entry ${entry.id}`, e);
        }
    }

    // 4. Messages & Requests (mock data from memory in MockRepository)
    const mockMessages = [
        { id: '1', fromId: 'emp1', toId: 'system', subject: 'Pytanie o grafik', content: 'Czy mogę prosić o zmianę zmiany w czwartek?', read: false, createdAt: new Date().toISOString(), type: 'message' },
        { id: '2', fromId: 'system', toId: 'all', subject: 'Spotkanie zespołu', content: 'Zapraszam na spotkanie w piątek o 10:00.', read: true, createdAt: new Date().toISOString(), type: 'memo' }
    ];
    console.log("Seeding messages...");
    for (const msg of mockMessages) {
        // @ts-ignore
        try { await repo.createMessage(msg); } catch (e) { }
    }

    const mockRequests = [
        { id: '1', employeeId: 'emp1', type: 'urlop', status: 'oczekujący', dateFrom: '2026-02-01', dateTo: '2026-02-05', description: 'Wyjazd z rodziną', createdAt: new Date().toISOString() },
        { id: '2', employeeId: 'emp2', type: 'zaliczka', status: 'oczekujący', amount: 500, description: 'Zaliczka na materiały', createdAt: new Date().toISOString() }
    ];
    console.log("Seeding requests...");
    for (const req of mockRequests) {
        // @ts-ignore
        try { await repo.createRequest(req); } catch (e) { }
    }

    console.log("Seeding complete!");
    window.location.reload();
};
