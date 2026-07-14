export interface TimeEntry {
    id: number;
    employee_id: number;
    date: string;
    project_id: number;
    hours: number;
    work_location: 'Polska' | 'Niemcy' | 'Inne';
    currency: 'PLN' | 'EUR';
    custom_rate?: number;
    notes?: string;
    approval_status: 'Oczekujące' | 'Zaakceptowane' | 'Odrzucone';
    approved_by?: string;
    approval_date?: string;
    rejection_reason?: string;
    rejection_comment?: string;
    rejected_by?: string;
    rejection_date?: string;
    updated_at?: string;
    amount_eur?: number;
    nbp_rate?: number;
    nbp_rate_date?: string;
    amount_pln?: number;
    nbp_table?: 'A' | 'B' | 'C';
}

export interface Employee {
    id: number;
    name: string;
    daily_rate_pln: number;
    hourly_rate_eur: number;
    password?: string;
}

export interface Project {
    id: number;
    name: string;
    location: string;
}

export interface Note {
    note_id: number;
    author: string;
    date: string;
    title: string;
    content: string;
    recipients: number[]; // employee ids
    acknowledged_by: number[]; // employee ids
    status: 'active' | 'archived';
}

export interface Payment {
    id: number;
    employee_id: number;
    month: string;
    amount_pln: number;
    amount_eur: number;
    date: string;
    type?: 'advance' | 'final';
}

export interface DayOff {
    id: number;
    employee_id: number;
    date: string;
    type: 'vacation' | 'sick' | 'other';
    reason?: string;
}

export interface Schedule {
    id: number;
    employee_id: number;
    date: string;
    project_id: number;
    expected_hours: number;
    work_location: string;
    status: 'Zaplanowane' | 'Zrealizowane' | 'Anulowane';
}

export interface Schedule {
    id: number;
    employee_id: number;
    date: string;
    project_id: number;
    expected_hours: number;
    work_location: string;
    status: 'Zaplanowane' | 'Zrealizowane' | 'Anulowane';
}

export interface TiCoState {
    timeEntries: TimeEntry[];
    employees: Employee[];
    projects: Project[];
    notes: Note[];
    payments: Payment[];
    daysOff: DayOff[];
}
