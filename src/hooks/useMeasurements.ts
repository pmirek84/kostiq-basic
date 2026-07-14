export interface Measurement {
    id: string;
    clientName: string;
    address: string;
    date: string;
    status: 'planned' | 'completed';
}

export function useMeasurements() {
    // Placeholder / Mock data
    const measurements: Measurement[] = [
        { id: 'm1', clientName: 'Kowalski Jan', address: 'Warszawa, Zielona 5', date: '2026-01-15T10:00:00', status: 'planned' }
    ];
    return { measurements };
}
