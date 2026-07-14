import { useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useJobs } from '../context/JobsContext';
import { useTiCo } from '../context/TiCoContext';
import type { AssignmentEmployee, AssignmentSubcontractor, Employee, Subcontractor } from '../models/types';

export const useJobTeam = (jobId: string) => {
    const { getJob, updateJob } = useJobs();
    const { employees, subcontractors, crews } = useTiCo();
    const job = getJob(jobId);

    // Initial load from Job object
    const employeeAssignments = useMemo(() => job?.employeeAssignments || [], [job?.employeeAssignments]);
    const subcontractorAssignments = useMemo(() => job?.subcontractorAssignments || [], [job?.subcontractorAssignments]);

    // Helpers to get full details
    const getEmployee = (id: string): Employee | undefined => {
        return employees.find(e => e.id === id);
    };

    const getSubcontractor = (id: string): Subcontractor | undefined => {
        return subcontractors.find(s => s.id === id);
    };

    // --- Actions ---

    const addEmployeeAssignment = (employeeId: string, plannedHours: number, stageId?: string) => {
        if (!job) return;
        const employee = getEmployee(employeeId);
        if (!employee) return;

        const newAssignment: AssignmentEmployee = {
            id: uuidv4(),
            jobId: job.id,
            employeeId,
            stageId,
            plannedHours,
            actualHours: 0,
            plannedCost: plannedHours * employee.hourlyRate,
            actualCost: 0
        };

        const updatedAssignments = [...(job.employeeAssignments || []), newAssignment];
        updateJob(job.id, { employeeAssignments: updatedAssignments });
    };

    const removeEmployeeAssignment = (assignmentId: string) => {
        if (!job) return;
        const updatedAssignments = (job.employeeAssignments || []).filter(a => a.id !== assignmentId);
        updateJob(job.id, { employeeAssignments: updatedAssignments });
    };

    const addSubcontractorAssignment = (subcontractorId: string, plannedBudget: number, scope: string, stageId?: string) => {
        if (!job) return;

        const newAssignment: AssignmentSubcontractor = {
            id: uuidv4(),
            jobId: job.id,
            subcontractorId,
            stageId,
            plannedBudget,
            actualCost: 0,
            scopeDescription: scope,
            status: 'planowany'
        };

        const updatedAssignments = [...(job.subcontractorAssignments || []), newAssignment];
        updateJob(job.id, { subcontractorAssignments: updatedAssignments });
    };

    const removeSubcontractorAssignment = (assignmentId: string) => {
        if (!job) return;
        const updatedAssignments = (job.subcontractorAssignments || []).filter(a => a.id !== assignmentId);
        updateJob(job.id, { subcontractorAssignments: updatedAssignments });
    };

    const addCrewAssignment = (crewId: string, plannedHoursPerMember: number, stageId?: string) => {
        if (!job) return;
        const crew = crews.find(c => c.id === crewId);
        if (!crew) return;

        const existing = job.employeeAssignments || [];
        const alreadyAssigned = new Set(existing.map(a => a.employeeId));

        const newAssignments: AssignmentEmployee[] = crew.memberIds
            .filter(memberId => !alreadyAssigned.has(memberId))
            .map(memberId => {
                const employee = getEmployee(memberId);
                return {
                    id: uuidv4(),
                    jobId: job.id,
                    employeeId: memberId,
                    crewId,
                    stageId,
                    plannedHours: plannedHoursPerMember,
                    actualHours: 0,
                    plannedCost: plannedHoursPerMember * (employee?.hourlyRate ?? 0),
                    actualCost: 0
                };
            });

        if (newAssignments.length === 0) return;
        updateJob(job.id, { employeeAssignments: [...existing, ...newAssignments] });
    };

    // --- Stats ---
    const stats = useMemo(() => {
        const totalEmployeeCost = employeeAssignments.reduce((sum, a) => sum + a.plannedCost, 0);
        const totalHours = employeeAssignments.reduce((sum, a) => sum + a.plannedHours, 0);
        const totalSubcontractorCost = subcontractorAssignments.reduce((sum, a) => sum + a.plannedBudget, 0);

        return {
            totalEmployeeCost,
            totalHours,
            totalSubcontractorCost,
            totalPlannedCost: totalEmployeeCost + totalSubcontractorCost
        };
    }, [employeeAssignments, subcontractorAssignments]);


    return {
        job,
        employeeAssignments,
        subcontractorAssignments,
        employees,
        subcontractors,
        crews,
        addEmployeeAssignment,
        removeEmployeeAssignment,
        addSubcontractorAssignment,
        removeSubcontractorAssignment,
        addCrewAssignment,
        getEmployee,
        getSubcontractor,
        stats
    };
};
