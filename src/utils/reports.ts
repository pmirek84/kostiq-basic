// src/utils/reports.ts
import type { Job, Offer, TimeEntry } from '../models/types';
import type {
    PeriodRange,
    EmployeePeriodReport,
    EmployeeJobPerformance,
    JobProfitabilityReport,
    DifficultyStatsReport,
    DifficultyStatsItem,
    EmployeeCapacityItem,
    CapacityReport,
    PredictedJobMetrics
} from '../models/reports';
import { summarizeTimeForJob } from './timeAnalytics';

interface BuildEmployeeReportParams {
    employeeName: string;
    period: PeriodRange;
    jobs: Job[];
    offers: Offer[];
    timeEntries: TimeEntry[];
    laborHourlyRate: number;
}

/**
 * Raport wydajności pracownika w okresie
 */
export function buildEmployeePeriodReport(params: BuildEmployeeReportParams): EmployeePeriodReport {
    const { employeeName, period, jobs, offers, timeEntries, laborHourlyRate } = params;

    // 1. Wpisy czasu pracy danego pracownika w okresie
    const entries = timeEntries.filter(e =>
        e.employeeName === employeeName &&
        e.date >= period.from &&
        e.date <= period.to &&
        (e.approved ?? true)
    );

    // 2. Grupowanie po jobCode
    const jobsByCode = new Map<string, EmployeeJobPerformance>();

    for (const e of entries) {
        if (!e.jobCode) continue;

        const job = jobs.find(j => j.jobCode === e.jobCode);
        if (!job) continue;
        const offer = job.offerId ? offers.find(o => o.id === job.offerId) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clientName = (offer as any)?.clientName ?? '';

        if (!jobsByCode.has(e.jobCode)) {
            jobsByCode.set(e.jobCode, {
                jobId: job.id,
                jobCode: job.jobCode!,
                jobName: job.name,
                clientName,
                difficulty: job.plannedDifficulty,
                location: job.location,
                hoursWork: 0,
                hoursDrive: 0,
                totalHours: 0,
                revenueShare: 0,
                costLabor: 0,
                marginContribution: 0
            });
        }

        const rec = jobsByCode.get(e.jobCode)!;
        if (e.type === 'work') {
            rec.hoursWork += e.hours;
        } else if (e.type === 'drive') {
            rec.hoursDrive += e.hours;
        }
    }

    // 3. Obliczenie udziału w przychodzie i koszcie
    const byJobs: EmployeeJobPerformance[] = [];

    for (const rec of jobsByCode.values()) {
        const job = jobs.find(j => j.id === rec.jobId);
        if (!job) continue;
        const offer = job.offerId ? offers.find(o => o.id === job.offerId) : undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plannedRevenue = (offer as any)?.totalPrice ?? 0;
        const summaryAll = summarizeTimeForJob(job.jobCode, timeEntries);
        const employeeTotalHours = rec.hoursWork + rec.hoursDrive;
        const allTotalHours = summaryAll.totalHours || 1; // zabezpieczenie

        const revenueShare = plannedRevenue * (employeeTotalHours / allTotalHours);
        const laborCost = rec.hoursWork * laborHourlyRate; // możesz dodać też drive

        rec.totalHours = employeeTotalHours;
        rec.revenueShare = revenueShare;
        rec.costLabor = laborCost;
        rec.marginContribution = revenueShare - laborCost;

        byJobs.push(rec);
    }

    const totalHoursWork = byJobs.reduce((s, j) => s + j.hoursWork, 0);
    const totalHoursDrive = byJobs.reduce((s, j) => s + j.hoursDrive, 0);
    const totalHours = byJobs.reduce((s, j) => s + j.totalHours, 0);
    const totalRevenueShare = byJobs.reduce((s, j) => s + j.revenueShare, 0);
    const totalLaborCost = byJobs.reduce((s, j) => s + j.costLabor, 0);
    const totalMarginContribution = byJobs.reduce((s, j) => s + j.marginContribution, 0);
    const jobsCount = byJobs.length;

    const avgHoursPerJob = jobsCount ? totalHoursWork / jobsCount : 0;
    const avgRevenuePerHour = totalHoursWork ? totalRevenueShare / totalHoursWork : 0;
    const avgMarginPerHour = totalHoursWork ? totalMarginContribution / totalHoursWork : 0;

    // benchmark – np. 100 PLN / h jako docelowy
    const benchmark = 100;
    const efficiencyIndex = avgRevenuePerHour ? (avgRevenuePerHour / benchmark) * 100 : 0;

    return {
        employeeName,
        period,
        totalHoursWork,
        totalHoursDrive,
        totalHours,
        jobsCount,
        totalRevenueShare,
        totalLaborCost,
        totalMarginContribution,
        avgHoursPerJob,
        avgRevenuePerHour,
        avgMarginPerHour,
        efficiencyIndex,
        byJobs
    };
}

/**
 * Raport rentowności pojedynczego zlecenia
 */
interface BuildJobProfitabilityParams {
    job: Job;
    offer?: Offer;
    period: PeriodRange;
    timeEntries: TimeEntry[];
    laborHourlyRate: number;
}

export function buildJobProfitabilityReport(params: BuildJobProfitabilityParams): JobProfitabilityReport {
    const { job, offer, period, timeEntries, laborHourlyRate } = params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientName = (offer as any)?.clientName ?? '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedRevenue = (offer as any)?.totalPrice ?? 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedMaterialsCost = (offer as any)?.materialsCost ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedLaborCost = (offer as any)?.laborCost ?? (offer as any)?.predictedLaborCost ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedTransportCost = (offer as any)?.transportCost ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedOtherCost = (offer as any)?.otherCost ?? 0;
    const plannedTotalCost = plannedMaterialsCost + plannedLaborCost + plannedTransportCost + plannedOtherCost;
    const plannedMargin = plannedRevenue - plannedTotalCost;
    const plannedMarginPercent = plannedRevenue ? (plannedMargin / plannedRevenue) * 100 : 0;

    // rzeczywiste
    const summary = job.jobCode
        ? summarizeTimeForJob(job.jobCode, timeEntries)
        : { totalWorkHours: 0, totalDriveHours: 0, totalHours: 0, entriesByEmployee: [] };

    const actualLaborCost = summary.totalWorkHours * laborHourlyRate;

    const actualMaterialsCost = job.materialsActualNet ?? job.materialsPlannedNet ?? 0;
    const actualTransportCost = job.logisticsActualNet ?? job.logisticsPlannedNet ?? 0;
    const actualOtherCost = (job as any).actualOtherCost ?? job.otherCostsNet ?? 0;
    const actualTotalCost = actualMaterialsCost + actualLaborCost + actualTransportCost + actualOtherCost;

    const actualRevenue = job.actualRevenue ?? plannedRevenue;
    const actualMargin = actualRevenue - actualTotalCost;
    const actualMarginPercent = actualRevenue ? (actualMargin / actualRevenue) * 100 : 0;

    const diffLaborHours = (job.plannedWorkHours ?? 0) ? summary.totalWorkHours - (job.plannedWorkHours ?? 0) : summary.totalWorkHours;
    const diffLaborCost = actualLaborCost - plannedLaborCost;
    const diffTotalCost = actualTotalCost - plannedTotalCost;
    const diffMargin = actualMargin - plannedMargin;
    const diffMarginPercent = actualMarginPercent - plannedMarginPercent;

    return {
        jobId: job.id,
        jobCode: job.jobCode!,
        jobNumber: job.jobCode!,
        jobName: job.name,
        clientName,
        difficulty: job.plannedDifficulty,
        location: job.location,
        period,
        plannedRevenue,
        actualRevenue,
        plannedMaterialsCost,
        plannedLaborCost,
        plannedTransportCost,
        plannedOtherCost,
        plannedTotalCost,
        plannedMargin,
        plannedMarginPercent,
        actualMaterialsCost,
        actualLaborCost,
        actualTransportCost,
        actualOtherCost,
        actualTotalCost,
        actualMargin,
        actualMarginPercent,
        diffLaborHours,
        diffLaborCost,
        diffTotalCost,
        diffMargin,
        diffMarginPercent
    };
}

/**
 * Statystyki trudności – pod baza do korekty standardów montażu
 */
export function buildDifficultyStatsReport(
    period: PeriodRange,
    jobs: Job[],
    offers: Offer[],
    timeEntries: TimeEntry[]
): DifficultyStatsReport {
    const grouped = new Map<number, DifficultyStatsItem>();

    for (const job of jobs) {
        if (!job.plannedDifficulty) continue;
        const difficulty = job.plannedDifficulty;
        const offer = job.offerId ? offers.find(o => o.id === job.offerId) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plannedRevenue = (offer as any)?.totalPrice ?? 0;

        const summary = job.jobCode
            ? summarizeTimeForJob(job.jobCode, timeEntries)
            : { totalWorkHours: 0, totalDriveHours: 0, totalHours: 0, entriesByEmployee: [] };

        const actualTotalCost = job.actualTotalCost ?? job.plannedTotalCost ?? 0;
        const actualMargin = plannedRevenue - actualTotalCost;
        const actualMarginPercent = plannedRevenue ? (actualMargin / plannedRevenue) * 100 : 0;

        const m2 = (job.totalArea ?? 0) || 0; // jeśli masz w modelu
        const item = grouped.get(difficulty) ?? {
            difficulty,
            jobsCount: 0,
            avgWorkHoursPerJob: 0,
            avgWorkHoursPerM2: 0,
            avgMarginPercent: 0
        };

        item.jobsCount += 1;
        item.avgWorkHoursPerJob += summary.totalWorkHours;
        if (m2 > 0) item.avgWorkHoursPerM2 = (item.avgWorkHoursPerM2 ?? 0) + summary.totalWorkHours / m2;
        item.avgMarginPercent += actualMarginPercent;

        grouped.set(difficulty, item);
    }

    const items: DifficultyStatsItem[] = Array.from(grouped.values()).map(item => ({
        ...item,
        avgWorkHoursPerJob: item.jobsCount ? item.avgWorkHoursPerJob / item.jobsCount : 0,
        avgWorkHoursPerM2: item.jobsCount ? (item.avgWorkHoursPerM2 ?? 0) / item.jobsCount : 0,
        avgMarginPercent: item.jobsCount ? item.avgMarginPercent / item.jobsCount : 0
    }));

    return {
        period,
        items
    };
}

/**
 * Prosty raport capacity – ile ktoś ma w planie vs dostępność
 */
interface BuildCapacityParams {
    period: PeriodRange;
    jobs: Job[];
    employeeNames: string[];
    hoursPerDay: number;  // np. 8
    workingDaysInPeriod: number; // policzone na zewnątrz
}

export function buildCapacityReport(params: BuildCapacityParams): CapacityReport {
    const { period, jobs, employeeNames, hoursPerDay, workingDaysInPeriod } = params;

    // prosto: patrzymy na plannedWorkHours i plannedTeam w job
    const map = new Map<string, number>(); // employee -> plannedHours

    for (const name of employeeNames) {
        map.set(name, 0);
    }

    for (const job of jobs) {
        if (!job.plannedTeam || !job.plannedTeam.length || !job.plannedWorkHours) continue;

        const hoursPerPerson = job.plannedWorkHours / job.plannedTeam.length;

        for (const emp of job.plannedTeam) {
            if (!map.has(emp)) map.set(emp, 0);
            map.set(emp, map.get(emp)! + hoursPerPerson);
        }
    }

    const items: EmployeeCapacityItem[] = [];

    for (const name of map.keys()) {
        const plannedHours = map.get(name)!;
        const availableHours = hoursPerDay * workingDaysInPeriod;
        const utilizationPercent = availableHours ? (plannedHours / availableHours) * 100 : 0;

        items.push({
            employeeName: name,
            plannedHours,
            availableHours,
            utilizationPercent
        });
    }

    return {
        period,
        items
    };
}

/**
 * Surowy szkic predykcji dla nowej oferty na bazie DifficultyStats
 */
export function suggestPredictedJobMetrics(
    stats: DifficultyStatsReport,
    difficulty: number,
    baseHoursFromStandard: number
): PredictedJobMetrics {
    const item = stats.items.find(i => i.difficulty === difficulty);

    if (!item) {
        // brak danych historycznych – bierzemy standard
        return {
            difficulty: difficulty as any,
            baseHours: baseHoursFromStandard,
            adjustedHours: baseHoursFromStandard,
            suggestedTeam: [],
            confidence: 0
        };
    }

    // bardzo prosty algorytm:
    // jeśli średnio wychodzi że potrzebujesz więcej godzin niż standard, podbijamy
    const factor = item.avgWorkHoursPerJob && baseHoursFromStandard
        ? item.avgWorkHoursPerJob / baseHoursFromStandard
        : 1;

    const adjusted = baseHoursFromStandard * factor;

    return {
        difficulty: difficulty as any,
        baseHours: baseHoursFromStandard,
        adjustedHours: adjusted,
        suggestedTeam: [], // tu możesz w kolejnym kroku dobrać ekipę po wydajności
        confidence: Math.min(1, item.jobsCount / 10) // np. powyżej 10 zleceń ~ pełna pewność
    };
}
