import { useState } from 'react';
import { SettlementsListView } from './SettlementsListView';
import { SettlementWizard } from './SettlementWizard';
import { SettlementDetailsView } from './SettlementDetailsView';

interface PayrollViewProps {
    initialJobId?: string;
    initialWorkerId?: string;
}

export function PayrollView({ initialJobId, initialWorkerId }: PayrollViewProps) {
    const [view, setView] = useState<'list' | 'create' | 'details'>('list');
    const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);

    const handleCreateClick = () => {
        setView('create');
    };

    const handleDetailsClick = (id: string) => {
        setSelectedSettlementId(id);
        setView('details');
    };

    const handleCloseToWizard = () => {
        setView('list');
    };

    const handleSuccessWizard = () => {
        setView('list');
    };

    // Note: SettlementDetailsView and Wizard act as overlays/modals in this design, 
    // or full pages. Based on the components I wrote, Wizard is a modal (fixed inset-0).
    // DetailsView is also a modal (fixed inset-0).
    // So we can keep 'list' as the background or switch.
    // Let's render List always, and conditionally render the modals.

    return (
        <div className="relative h-full">
            <SettlementsListView
                onCreateClick={handleCreateClick}
                onDetailsClick={handleDetailsClick}
                jobFilter={initialJobId}
                workerFilter={initialWorkerId}
            />

            {view === 'create' && (
                <SettlementWizard
                    onClose={handleCloseToWizard}
                    onSuccess={handleSuccessWizard}
                />
            )}

            {view === 'details' && selectedSettlementId && (
                <SettlementDetailsView
                    settlementId={selectedSettlementId}
                    onClose={handleCloseToWizard}
                />
            )}
        </div>
    );
}
