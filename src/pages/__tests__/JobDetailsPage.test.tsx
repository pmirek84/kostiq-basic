import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JobDetailsPage from '../JobDetailsPage';
import { useJobs } from '../../context/JobsContext';
import '@testing-library/jest-dom';

// Mock scroll for tests
window.scrollTo = vi.fn();

vi.mock('../../context/JobsContext');
vi.mock('../../context/ClientsContext', () => ({
    useClients: () => ({ clients: [] }) // Client is missing from active list
}));
vi.mock('../../context/OffersContext', () => ({
    useOffers: () => ({ offers: [] })
}));

const mockJob = {
    id: 'job-1',
    jobCode: 'J-2024-001',
    name: 'Orphaned Job',
    status: 'in_progress',
    clientName: 'Original Client Name', // Stored name
    location: 'Test Location',
    expenses: [],
};

describe('JobDetailsPage - Orphaned Data Resilience', () => {
    beforeEach(() => {
        (useJobs as any).mockReturnValue({
            getJob: vi.fn().mockReturnValue(mockJob),
            updateJob: vi.fn(),
        });
    });

    it('renders correctly even if the client is missing from the active clients list', () => {
        render(
            <MemoryRouter initialEntries={['/jobs/job-1']}>
                <Routes>
                    <Route path="/jobs/:id" element={<JobDetailsPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Should show stored client name without crashing
        expect(screen.getByText(/Orphaned Job/i)).toBeInTheDocument();
        expect(screen.getByText(/Original Client Name/i)).toBeInTheDocument();
    });
});
