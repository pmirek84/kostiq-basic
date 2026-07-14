
import { Pencil, Trash2 } from 'lucide-react';
import type { Construction } from '../../models/types';


interface ConstructionListProps {
    constructions: Construction[];
    onEdit: (construction: Construction) => void;
    onDelete: (id: string) => void;
    onImport?: () => void;
}

export const ConstructionList = ({ constructions, onEdit, onDelete, onImport }: ConstructionListProps) => {
    if (constructions.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="mb-4">Brak dodanych konstrukcji. Kliknij "Dodaj konstrukcję", aby rozpocząć.</p>
                {onImport && (
                    <button
                        onClick={onImport}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
                    >
                        Masz listę w Excelu? Importuj (Kopiuj-Wklej)
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto border rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nr</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwa</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Typ</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wymiary / Ilość</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Obmiar</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Razem netto</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {constructions.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.number}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {item.widthMm} x {item.heightMm} mm <br />
                                <span className="font-bold text-gray-700">x {item.quantity} szt.</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                A: {item.totalArea.toFixed(2)} m²<br />
                                P: {item.totalPerimeter.toFixed(2)} mb
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                                {item.totalCost.toFixed(2)} PLN
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end space-x-2">
                                    <button
                                        onClick={() => onEdit(item)}
                                        className="text-primary hover:text-primary-dark p-1"
                                        title="Edytuj"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id)}
                                        className="text-red-500 hover:text-red-700 p-1"
                                        title="Usuń"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
