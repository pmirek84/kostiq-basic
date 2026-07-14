import { useState } from 'react';
import { Save, X } from 'lucide-react';

interface OfferDetailsEditorProps {
    number: string;
    client: string;
    location: string;
    onSave: (data: { number: string; client: string; location: string }) => void;
    onCancel?: () => void;
}

export default function OfferDetailsEditor({
    number,
    client,
    location,
    onSave,
    onCancel
}: OfferDetailsEditorProps) {
    const [editedNumber, setEditedNumber] = useState(number);
    const [editedClient, setEditedClient] = useState(client);
    const [editedLocation, setEditedLocation] = useState(location);

    const handleSave = () => {
        if (editedNumber.trim() && editedClient.trim() && editedLocation.trim()) {
            onSave({
                number: editedNumber,
                client: editedClient,
                location: editedLocation
            });
        }
    };

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">
                    Numer oferty
                </label>
                <input
                    type="text"
                    value={editedNumber}
                    onChange={(e) => setEditedNumber(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">
                    Klient
                </label>
                <input
                    type="text"
                    value={editedClient}
                    onChange={(e) => setEditedClient(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">
                    Miejsce montażu
                </label>
                <input
                    type="text"
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                    required
                />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
                <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                    <X className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="px-3 py-2 text-sm font-medium text-white bg-[#21808D] rounded-lg hover:bg-[#1a646e]"
                >
                    <Save className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
