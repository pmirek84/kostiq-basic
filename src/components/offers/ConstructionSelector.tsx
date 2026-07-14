import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Construction } from '../../models/types';
import { ConstructionModal } from './ConstructionModal';

interface ConstructionSelectorProps {
    onSelect: (construction: Construction) => Promise<void>;
    offerId: string;
    nextNumber: number;
}

export default function ConstructionSelector({ onSelect, offerId, nextNumber }: ConstructionSelectorProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSave = async (construction: Construction) => {
        // Pass the constructed object to the parent handler
        // The parent (OfferForm) handles saving to storage and recalculating installation costs
        await onSelect(construction);
        setIsModalOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="btn-primary"
            >
                <Plus className="h-4 w-4" />
                <span>Dodaj konstrukcję</span>
            </button>

            <ConstructionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                offerId={offerId}
                nextNumber={nextNumber}
                initialData={null}
            />
        </>
    );
}
