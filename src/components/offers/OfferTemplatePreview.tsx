import { useState } from 'react';
import { FileText, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Offer } from '../../models/types';
import { Button } from '../ui/Button';
import { useCompanySettings } from '../../hooks/useCompanySettings';

interface OfferTemplatePreviewProps {
    offer: Offer;
    onUse: (offer: Offer) => void;
    onEdit: (offer: Offer) => void;
    onDelete: (offerId: string) => void;
}

export default function OfferTemplatePreview({ offer, onUse, onEdit, onDelete }: OfferTemplatePreviewProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { settings } = useCompanySettings();

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-start space-x-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="mt-1">
                        <FileText className="h-6 w-6 text-[#1E3A8A]" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[#1E3A8A] max-w-xl leading-tight">
                            {offer.title || offer.number}
                        </h2>
                    </div>
                    <div className="mt-1 text-gray-400">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={() => onEdit(offer)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="Edytuj wzór"
                    >
                        <Pencil className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(offer.id);
                        }}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="Usuń wzór"
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>
                    <Button onClick={() => onUse(offer)} className="ml-2 bg-[#21808D] hover:bg-[#1a6873]">
                        Użyj tego wzoru
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="space-y-8 pl-10 mt-6 border-t pt-6 border-gray-100">
                    {/* Scope of Work */}
                    {offer.scopeOfWork && offer.scopeOfWork.length > 0 && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Zakres prac</h3>
                            <ol className="list-decimal pl-5 space-y-3">
                                {offer.scopeOfWork.map((item, index) => (
                                    <li key={index} className="text-gray-700 leading-relaxed">
                                        {item}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Materials */}
                    {offer.customMaterials && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Materiały montażowe</h3>
                            <div className="space-y-4">
                                {offer.customMaterials.providedByUs.length > 0 && (
                                    <div>
                                        <h4 className="font-medium text-gray-800 mb-1">{settings.companyName}:</h4>
                                        <p className="text-gray-700 leading-relaxed">
                                            {offer.customMaterials.providedByUs.join(', ')}
                                        </p>
                                    </div>
                                )}
                                {offer.customMaterials.providedByClient.length > 0 && (
                                    <div>
                                        <h4 className="font-medium text-gray-800 mb-1">Zleceniodawca:</h4>
                                        <p className="text-gray-700 leading-relaxed">
                                            {offer.customMaterials.providedByClient.join(', ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {offer.notes && offer.notes.length > 0 && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Uwagi</h3>
                            <ul className="list-disc pl-5 space-y-2">
                                {offer.notes.map((note, index) => (
                                    <li key={index} className="text-gray-700 leading-relaxed">
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
