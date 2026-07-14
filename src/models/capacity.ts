// src/models/capacity.ts
export interface EmployeeDayCapacity {
    date: string;           // '2026-01-15'
    employeeName: string;
    employeeId?: string;    // Added for robust linking
    jobId?: string;
    stageId?: string;       // Added for precise editing
    jobName?: string;
    plannedHours: number;   // z przydzielonych zleceń
    availableHours: number; // np. 8
    utilizationPercent: number;
}

export interface CrewCapacitySummary {
    crewId: string;
    crewName: string;
    totalMembers: number;
    assignedMembers: number;
    assignedNames: string[];
    utilizationPercent: number;
    isOverbooked: boolean;
}

export interface DayCapacitySummary {
    date: string;
    totalPlannedHours: number;
    totalAvailableHours: number;
    avgUtilizationPercent: number;
    maxUtilizationPercent: number;
    allocations: EmployeeDayCapacity[];
    uniqueEmployeesCount: number;
    assignedEmployeeNames?: string[];
    freeEmployeeNames?: string[];
    crewBreakdown?: CrewCapacitySummary[];
}
