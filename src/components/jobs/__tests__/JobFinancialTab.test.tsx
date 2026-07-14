import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobFinancialTab } from '../JobFinancialTab';
import { useJobs } from '../../../context/JobsContext';
import { useClients } from '../../../context/ClientsContext';
import '@testing-library/jest-dom';

// Mock the hooks
vi.mock('../../../context/JobsContext');
vi.mock('../../../context/ClientsContext');
vi.mock('../../../context/TiCoContext', () => ({
    useTiCo: () => ({
        timeEntries: [],
        settlements: [],
        employees: [],
        subcontractors: []
    })
}));
vi.mock('../../../context/OffersContext', () => ({
    useOffers: () => ({
        offers: []
    })
}));

const mockJob = {
    id: 'job-1',
    name: 'Test Job',
    status: 'done',
    clientName: 'Test Client',
    expenses: [],
    materialsPlannedNet: 1000,
    plannedLaborHours: 10,
    plannedLaborCost: 500,
    logisticsPlannedNet: 100,
    otherCostsNet: 50,
};

describe('JobFinancialTab - Lockdown', () => {
    beforeEach(() => {
        (useJobs as any).mockReturnValue({
            updateJob: vi.fn(),
        });
        (useClients as any).mockReturnValue({
            clients: [],
        });
    });

    it('renders a warning banner when the job is locked (status: done)', () => {
        render(<JobFinancialTab job={mockJob as any} />);
        expect(screen.getByText(/Zlecenie jest zamknięte/i)).toBeInTheDocument();
    });

    it('disables the edit button when the job is locked', () => {
        render(<JobFinancialTab job={mockJob as any} />);
        const editButton = screen.getByTitle("Zlecenie zamknięte - edycja zablokowana");
        expect(editButton).toBeDisabled();
    });
});
