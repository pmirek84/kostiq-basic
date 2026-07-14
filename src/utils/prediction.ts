import type { EmployeePerformanceSummary, JobDifficulty } from '../models/types';

export interface PredictionInput {
    difficulty: JobDifficulty;
    selectedEmployees: string[];
    performance: EmployeePerformanceSummary[];
    baselineHours?: number; // optional fallback baseline
}

export interface EmployeePrediction {
    employeeName: string;
    usedAvgHoursPerJob: number;  // the value used for this prediction
    source: 'history' | 'baseline';
}

export interface PredictionResult {
    employees: EmployeePrediction[];
    totalPredictedHours: number;
}

/**
 * Predicts total WORK hours for a job based on employee performance summaries.
 */
export function predictWorkHoursForJob(input: PredictionInput): PredictionResult {
    const { difficulty, selectedEmployees, performance, baselineHours = 8 } = input;

    const employees: EmployeePrediction[] = selectedEmployees.map(empName => {
        const perf = performance.find(p => p.employeeName === empName);

        // 1. Try specific difficulty breakdown
        const specificDetail = perf?.difficultyBreakdown?.find(d => d.difficulty === difficulty);
        if (specificDetail && specificDetail.jobsCount > 0) {
            return {
                employeeName: empName,
                usedAvgHoursPerJob: specificDetail.avgHoursPerJob,
                source: 'history'
            };
        }

        // 2. Fallback to general average
        if (perf && perf.averageHoursPerJob > 0) {
            return {
                employeeName: empName,
                usedAvgHoursPerJob: perf.averageHoursPerJob,
                source: 'history'
            };
        }

        // 3. Fallback to baseline
        return {
            employeeName: empName,
            usedAvgHoursPerJob: baselineHours,
            source: 'baseline'
        };
    });

    // Simple sum model (assuming serial work or total man-hours needed)
    const totalPredictedHours = employees.reduce((sum, e) => sum + e.usedAvgHoursPerJob, 0);

    return {
        employees,
        totalPredictedHours
    };
}
