// src/types/reports.ts
import type { JobDifficulty } from '../models/types';

export type PeriodType = 'month' | 'quarter' | 'year' | 'custom';

export interface PeriodRange {
    from: string;  // YYYY-MM-DD
    to: string;    // YYYY-MM-DD
    label: string; // np. "Styczeń 2026"
}

/**
 * Raport wydajności pojedynczego pracownika w okresie
 */
export interface EmployeeJobPerformance {
    jobId: string;
    jobCode: string;
    jobName: string;
    clientName: string;
    difficulty?: JobDifficulty;
    location: string;
    hoursWork: number;
    hoursDrive: number;
    totalHours: number;
    revenueShare: number;         // przypisana część przychodu zlecenia (PLN)
    costLabor: number;            // koszt robocizny tego pracownika (PLN)
    marginContribution: number;   // wkład do marży (PLN)
}

export interface EmployeePeriodReport {
    employeeName: string;
    period: PeriodRange;

    // sumaryczne
    totalHoursWork: number;
    totalHoursDrive: number;
    totalHours: number;
    jobsCount: number;
    totalRevenueShare: number;
    totalLaborCost: number;
    totalMarginContribution: number;

    avgHoursPerJob: number;
    avgRevenuePerHour: number;
    avgMarginPerHour: number;

    efficiencyIndex: number; // np. (avgRevenuePerHour / benchmark) * 100

    byJobs: EmployeeJobPerformance[];
}

/**
 * Raport rentowności zlecenia
 */
export interface JobProfitabilityReport {
    jobId: string;
    jobCode: string;
    jobNumber: string;
    jobName: string;
    clientName: string;
    difficulty?: JobDifficulty;
    location: string;
    period: PeriodRange;

    // Przychód
    plannedRevenue: number;   // z oferty
    actualRevenue: number;    // z fakturowania (albo = plannedRevenue na start)

    // Koszty planowane (z oferty / kalkulacji)
    plannedMaterialsCost: number;
    plannedLaborCost: number;
    plannedTransportCost: number;
    plannedOtherCost: number;
    plannedTotalCost: number;
    plannedMargin: number;
    plannedMarginPercent: number;

    // Koszty rzeczywiste (z KOSTIQ Mobile + wpisy kosztów)
    actualMaterialsCost: number;
    actualLaborCost: number;
    actualTransportCost: number;
    actualOtherCost: number;
    actualTotalCost: number;
    actualMargin: number;
    actualMarginPercent: number;

    // Odchyłki
    diffLaborHours: number;
    diffLaborCost: number;
    diffTotalCost: number;
    diffMargin: number;
    diffMarginPercent: number;
}

/**
 * Statystyki trudności vs realny czas
 */
export interface DifficultyStatsItem {
    difficulty: JobDifficulty;
    jobsCount: number;
    avgWorkHoursPerJob: number;
    avgWorkHoursPerM2?: number;
    avgMarginPercent: number;
}

export interface DifficultyStatsReport {
    period: PeriodRange;
    items: DifficultyStatsItem[];
}

/**
 * Raport obciążenia / dostępności (capacity)
 */
export interface EmployeeCapacityItem {
    employeeName: string;
    plannedHours: number;      // z harmonogramu zleceń
    availableHours: number;    // wg etatu i okresu
    utilizationPercent: number;
}

export interface CapacityReport {
    period: PeriodRange;
    items: EmployeeCapacityItem[];
}

/**
 * Sugestie predykcyjne dla nowej oferty
 */
export interface PredictedJobMetrics {
    difficulty: JobDifficulty;
    baseHours: number;
    adjustedHours: number;
    suggestedTeam: string[];
    confidence: number; // 0-1
}
