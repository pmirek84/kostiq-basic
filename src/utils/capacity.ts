import type { Job, Employee, Crew } from '../models/types';
import type { EmployeeDayCapacity, DayCapacitySummary } from '../models/capacity';
import { eachDayOfInterval, isWeekend, format } from 'date-fns';

interface BuildCapacityInput {
    jobs: Job[];
    hoursPerDay: number; // 8
    employees?: Employee[];
    crews?: Crew[];
}

export function buildEmployeeDayCapacity({
    jobs,
    hoursPerDay,
    employees = [],
    crews = []
}: BuildCapacityInput): EmployeeDayCapacity[] {
    const result: EmployeeDayCapacity[] = [];

    // Helper to resolve team/employee string to list of employee names
    const resolveTeamToEmployees = (teamName: string): string[] => {
        // 1. Is it a known crew by ID?
        const crewById = crews.find(c => c.id === teamName);
        if (crewById) {
            return employees
                .filter(e => crewById.memberIds.includes(e.id) || e.id === crewById.foremanId)
                .map(e => `${e.firstName} ${e.lastName}`);
        }

        // 2. Is it a known crew by Name?
        const crewByName = crews.find(c => c.name.toLowerCase() === teamName.toLowerCase());
        if (crewByName) {
            return employees
                .filter(e => crewByName.memberIds.includes(e.id) || e.id === crewByName.foremanId)
                .map(e => `${e.firstName} ${e.lastName}`);
        }

        // 3. Fallback to crewId check on employees if crew name matches legacy pattern
        const crewMembers = employees.filter(e => e.crewId === teamName);
        if (crewMembers.length > 0) {
            return crewMembers.map(e => `${e.firstName} ${e.lastName}`);
        }

        // 4. Is it a single employee by name?
        return [teamName];
    };

    for (const job of jobs) {
        const validStages = job.stages?.filter(s => s.startPlanned && s.endPlanned) || [];

        if (validStages.length > 0) {
            for (const stage of validStages) {
                // NEW LOGIC: Check for explicit employee assignments for this stage first
                const stageAssignments = job.employeeAssignments?.filter(a => a.stageId === stage.id) || [];

                let assignmentList: string[] = [];

                if (stageAssignments.length > 0) {
                    // Map assignment IDs to names
                    assignmentList = stageAssignments.map(a => {
                        const emp = employees.find(e => e.id === a.employeeId);
                        return emp ? `${emp.firstName} ${emp.lastName}` : 'Nieznany';
                    });
                } else {
                    // FALLBACK: Legacy behavior (strings)
                    let stageTeam = (stage.assignedTeams && stage.assignedTeams.length > 0)
                        ? stage.assignedTeams
                        : (job.assignedTeams && job.assignedTeams.length > 0 ? job.assignedTeams : job.plannedTeam || []);

                    if (stageTeam.length === 0) {
                        stageTeam = ['Nieprzypisane'];
                    }

                    const resolvedTeamMembers: string[] = [];
                    for (const t of stageTeam) {
                        if (t === 'Nieprzypisane') {
                            resolvedTeamMembers.push(t);
                        } else {
                            resolvedTeamMembers.push(...resolveTeamToEmployees(t));
                        }
                    }
                    assignmentList = Array.from(new Set(resolvedTeamMembers));
                }

                const start = new Date(stage.startPlanned!);
                const end = new Date(stage.endPlanned!);
                if (end < start) continue;

                const days = eachDayOfInterval({ start, end });
                const workDays = days.filter(d => !isWeekend(d));
                const effectiveBusinessDays = workDays.length > 0 ? workDays.length : 1;

                const teamSize = assignmentList.includes('Nieprzypisane') ? 1 : assignmentList.length;

                // If using specific assignments, we might have specific hours per person?
                // For simplified view, we can still use stage.plannedLaborHours distributed, OR sum up assignment hours.
                // Let's stick to stage total for consistency with "Plan", but if we have assignments, maybe we should use their specific hours?
                // For now, let's distribute the stage planned hours to keep it consistent with "Project Planning" view unless we want "Resource Allocation" view.
                // Better approach: If assignments exist, use their plannedHours sum as total? Or distribute stage budget?
                // Let's stick to: Distribute Stage Planned Hours among assigned people.

                const totalHours = (stage.plannedLaborHours && stage.plannedLaborHours > 0)
                    ? stage.plannedLaborHours
                    : (effectiveBusinessDays * 8 * teamSize);

                const hoursPerDayForStage = totalHours / effectiveBusinessDays;
                const hoursPerEmployeePerDay = assignmentList.length > 0 ? (hoursPerDayForStage / assignmentList.length) : 0;

                for (const day of days) {
                    if (isWeekend(day)) continue;
                    const dateStr = format(day, 'yyyy-MM-dd');

                    for (const empName of assignmentList) {
                        // Attempt to find ID if possible
                        // Note: assignmentList contains names. If we came from assignments, we know IDs, but here we flattened to names.
                        // Optimization: keep IDs in local list?

                        let eId: string | undefined;
                        // Reverse lookup from name (fragile but compatible with fallback)
                        // Or if we used stageAssignments, we have the IDs.
                        // Ideally assignmentList should be objects { id, name }

                        // Fast fix: Try to find employee by name
                        const foundEmp = employees.find(e => `${e.firstName} ${e.lastName}` === empName);
                        if (foundEmp) eId = foundEmp.id;

                        result.push({
                            date: dateStr,
                            employeeName: empName,
                            employeeId: eId,
                            jobId: job.id,
                            stageId: stage.id,
                            jobName: `${job.name} - ${stage.name}`,
                            plannedHours: hoursPerEmployeePerDay,
                            availableHours: hoursPerDay,
                            utilizationPercent: (hoursPerEmployeePerDay / hoursPerDay) * 100
                        });
                    }
                }
            }
        } else {
            // ... (Job level logic)
            // ...
            // [Existing logic for jobs without stages]

            const startProp = (job as any).plannedStartDate ?? job.createdAt;
            const endProp = (job as any).plannedEndDate ?? job.createdAt;

            let team = job.plannedTeam || [];
            if (team.length === 0) {
                team = ['Nieprzypisane'];
            }

            const resolvedTeamMembers: string[] = [];
            for (const t of team) {
                if (t === 'Nieprzypisane') {
                    resolvedTeamMembers.push(t);
                } else {
                    resolvedTeamMembers.push(...resolveTeamToEmployees(t));
                }
            }

            const assignmentList = Array.from(new Set(resolvedTeamMembers));
            const start = new Date(startProp);
            const end = new Date(endProp);
            if (end < start) continue;

            const days = eachDayOfInterval({ start, end });
            const workDays = days.filter(d => !isWeekend(d));
            const effectiveBusinessDays = workDays.length > 0 ? workDays.length : 1;

            const teamSize = assignmentList.includes('Nieprzypisane') ? 1 : assignmentList.length;
            const plannedWorkHours = job.plannedWorkHours || (effectiveBusinessDays * 8 * teamSize);

            const hoursPerDayForJob = plannedWorkHours / effectiveBusinessDays;
            const hoursPerEmployeePerDay = assignmentList.length > 0 ? (hoursPerDayForJob / assignmentList.length) : 0;

            for (const day of days) {
                if (isWeekend(day)) continue;
                const dateStr = format(day, 'yyyy-MM-dd');

                for (const empName of assignmentList) {
                    const foundEmp = employees.find(e => `${e.firstName} ${e.lastName}` === empName);

                    result.push({
                        date: dateStr,
                        employeeName: empName,
                        employeeId: foundEmp?.id,
                        jobId: job.id,
                        jobName: job.name,
                        plannedHours: hoursPerEmployeePerDay,
                        availableHours: hoursPerDay,
                        utilizationPercent: (hoursPerEmployeePerDay / hoursPerDay) * 100
                    });
                }
            }
        }
    }
    return result;
}

export function summarizeDayCapacity(items: EmployeeDayCapacity[], allEmployees: Employee[] = [], crews: Crew[] = []): DayCapacitySummary[] {
    const byDate = new Map<string, DayCapacitySummary & { uniqueEmployees: Set<string> }>();

    for (const item of items) {
        let existing = byDate.get(item.date);
        if (!existing) {
            existing = {
                date: item.date,
                totalPlannedHours: 0,
                totalAvailableHours: 0,
                avgUtilizationPercent: 0,
                maxUtilizationPercent: 0,
                allocations: [],
                uniqueEmployeesCount: 0,
                uniqueEmployees: new Set()
            };
            byDate.set(item.date, existing);
        }

        existing.totalPlannedHours += item.plannedHours;
        existing.allocations.push(item);
        existing.uniqueEmployees.add(item.employeeName);
    }

    return Array.from(byDate.values()).map(day => {
        const realAssigned = Array.from(day.uniqueEmployees).filter(name => name !== 'Nieprzypisane');
        const assignedCount = realAssigned.length;

        const freeEmployees = allEmployees.filter(e => {
            const fullName = `${e.firstName} ${e.lastName}`;
            return !day.uniqueEmployees.has(fullName) && e.isActive;
        }).map(e => `${e.firstName} ${e.lastName}`);

        const hoursPerDay = 8;
        const totalStaffCount = allEmployees.length > 0 ? allEmployees.filter(e => e.isActive).length : assignedCount;
        const totalAvailable = totalStaffCount * hoursPerDay;

        // Calculate Crew Breakdown
        const crewBreakdown = crews.map(crew => {
            const memberIds = new Set([...crew.memberIds, crew.foremanId]);
            // const crewMembers = allEmployees.filter(e => memberIds.has(e.id));
            // const memberNames = new Set(crewMembers.map(e => `${e.firstName} ${e.lastName}`));

            // Should match by ID if available, fallback to Name
            const crewAllocations = day.allocations.filter(a => {
                if (a.employeeId && memberIds.has(a.employeeId)) return true;
                if (!a.employeeId) {
                    // Fallback check by name? risky but matches existing logic
                    const empName = a.employeeName;
                    // We need to know if 'empName' belongs to 'crew'
                    // Simple check: does any crew member have this name?
                    // This is inefficient but functional for small data
                    return allEmployees.some(e => memberIds.has(e.id) && `${e.firstName} ${e.lastName}` === empName);
                }
                return false;
            });

            const assignedMembersInCrew = new Set(crewAllocations.map(a => a.employeeName));

            // Total crew members count
            // We can trust memberIds size (including foreman)
            // But verify they are active employees?
            const activeCrewMembers = allEmployees.filter(e => memberIds.has(e.id) && e.isActive);

            const totalCrewHoursAvailable = activeCrewMembers.length * hoursPerDay;
            const totalCrewHoursPlanned = crewAllocations.reduce((sum, a) => sum + a.plannedHours, 0);

            const utilization = totalCrewHoursAvailable > 0
                ? (totalCrewHoursPlanned / totalCrewHoursAvailable) * 100
                : 0;

            return {
                crewId: crew.id,
                crewName: crew.name,
                totalMembers: activeCrewMembers.length,
                assignedMembers: assignedMembersInCrew.size,
                assignedNames: Array.from(assignedMembersInCrew),
                utilizationPercent: utilization,
                isOverbooked: utilization > 100
            };
        });

        return {
            date: day.date,
            totalPlannedHours: day.totalPlannedHours,
            totalAvailableHours: totalAvailable,
            avgUtilizationPercent: totalAvailable > 0 ? (day.totalPlannedHours / totalAvailable) * 100 : 0,
            maxUtilizationPercent: 0,
            allocations: day.allocations,
            uniqueEmployeesCount: assignedCount,
            assignedEmployeeNames: realAssigned,
            freeEmployeeNames: freeEmployees,
            crewBreakdown
        };
    });
}
