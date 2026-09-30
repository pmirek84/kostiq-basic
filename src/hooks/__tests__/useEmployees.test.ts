import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEmployees } from '../useEmployees';
import * as JobsContext from '../../context/JobsContext';
import * as TiCoContext from '../../context/TiCoContext';
import type { Employee } from '../../models/types';

vi.mock('../../context/JobsContext');
vi.mock('../../context/TiCoContext');

describe('useEmployees - Single Source of Truth (TiCoContext)', () => {
    it('extracts employee names from TiCoContext and merges with jobs plannedTeam', () => {
        const mockEmployees: Employee[] = [
            {
                id: 'emp-1',
                type: 'employee',
                firstName: 'Marek',
                lastName: 'Nowak',
                role: 'monter',
                hourlyRate: 35,
                isActive: true
            },
            {
                id: 'emp-2',
                type: 'employee',
                firstName: 'Jan',
                lastName: 'Kowalski',
                role: 'brygadzista',
                hourlyRate: 45,
                isActive: true
            }
        ];

        vi.spyOn(TiCoContext, 'useTiCo').mockReturnValue({
            employees: mockEmployees,
            timeEntries: [],
            settlements: [],
            loadStatus: 'complete',
        } as any);

        vi.spyOn(JobsContext, 'useJobs').mockReturnValue({
            jobs: [
                {
                    id: 'job-1',
                    name: 'Montaż Okien',
                    plannedTeam: ['Piotr Wiśniewski', 'Jan Kowalski']
                }
            ]
        } as any);

        const { result } = renderHook(() => useEmployees());

        expect(result.current.employees).toEqual([
            'Jan Kowalski',
            'Marek Nowak',
            'Piotr Wiśniewski'
        ]);
    });
});
