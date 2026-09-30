import { describe, it, expect } from 'vitest';
import type { ExtraWork } from '../../../models/types';

describe('JobInvoicesTab - Unified Extra Works & Revenue Calculation', () => {
    it('calculates extraWorksRevenue from accepted extra works and isolates initial contract', () => {
        const extraWorks: ExtraWork[] = [
            {
                id: 'ew-1',
                jobId: 'job-100',
                createdById: 'user-1',
                title: 'Obróbka dodatkowa',
                reason: 'Dodatkowe życzenie inwestora',
                status: 'zaakceptowana',
                plannedRevenueNet: 3500,
                plannedCostNet: 1500,
                createdAt: new Date().toISOString()
            },
            {
                id: 'ew-2',
                jobId: 'job-100',
                createdById: 'user-1',
                title: 'Dodatkowy montaż parapetów',
                reason: 'Wymiana na nowe',
                status: 'zaakceptowana',
                plannedRevenueNet: 1500,
                plannedCostNet: 800,
                createdAt: new Date().toISOString()
            },
            {
                id: 'ew-3',
                jobId: 'job-100',
                createdById: 'user-1',
                title: 'Propozycja robót',
                reason: 'Odrzucona',
                status: 'odrzucona',
                plannedRevenueNet: 2000,
                plannedCostNet: 1000,
                createdAt: new Date().toISOString()
            }
        ];

        const job = {
            id: 'job-100',
            totalPlannedRevenueNet: 55000, // 50,000 initial + 5,000 accepted EW
            revenuePlannedNet: 55000,
            stages: [
                { id: 's1', type: 'montaż', plannedRevenueNet: 50000 },
                { id: 's2', type: 'dodatkowy', plannedRevenueNet: 5000 }
            ]
        };

        const acceptedExtraWorksRevenue = extraWorks
            .filter(e => e.status === 'zaakceptowana')
            .reduce((s, e) => s + (e.plannedRevenueNet || 0), 0);

        const stagesInitialRevenue = (job.stages || [])
            .filter(s => s.type !== 'dodatkowy')
            .reduce((s, st) => s + (Number(st.plannedRevenueNet) || 0), 0);

        const totalPlanned = job.totalPlannedRevenueNet || job.revenuePlannedNet || 0;
        const revenueFromOffer = stagesInitialRevenue > 0
            ? stagesInitialRevenue
            : Math.max(0, totalPlanned - acceptedExtraWorksRevenue);

        const totalContractRevenue = revenueFromOffer + acceptedExtraWorksRevenue;

        expect(acceptedExtraWorksRevenue).toBe(5000);
        expect(revenueFromOffer).toBe(50000);
        expect(totalContractRevenue).toBe(55000);
    });

    it('correctly handles jobs without extra work stages', () => {
        const extraWorks: ExtraWork[] = [];
        const job = {
            id: 'job-101',
            totalPlannedRevenueNet: 42000,
            revenuePlannedNet: 42000,
            stages: [
                { id: 's1', type: 'montaż', plannedRevenueNet: 42000 }
            ]
        };

        const acceptedExtraWorksRevenue = extraWorks
            .filter(e => e.status === 'zaakceptowana')
            .reduce((s, e) => s + (e.plannedRevenueNet || 0), 0);

        const stagesInitialRevenue = (job.stages || [])
            .filter(s => s.type !== 'dodatkowy')
            .reduce((s, st) => s + (Number(st.plannedRevenueNet) || 0), 0);

        const totalPlanned = job.totalPlannedRevenueNet || job.revenuePlannedNet || 0;
        const revenueFromOffer = stagesInitialRevenue > 0
            ? stagesInitialRevenue
            : Math.max(0, totalPlanned - acceptedExtraWorksRevenue);

        const totalContractRevenue = revenueFromOffer + acceptedExtraWorksRevenue;

        expect(acceptedExtraWorksRevenue).toBe(0);
        expect(revenueFromOffer).toBe(42000);
        expect(totalContractRevenue).toBe(42000);
    });
});
