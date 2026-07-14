import React from 'react';
import { FileText, Users2, MapPin } from 'lucide-react';
import type { Offer } from '../../models/types';
import { ClientSelector } from '../ui/ClientSelector';

interface OfferDetailsHeaderProps {
    offer: Offer;
    onStatusChange: (newStatus: 'draft' | 'sent' | 'accepted' | 'rejected') => void;
    children?: React.ReactNode;
    isTemplateMode?: boolean;
    isEditable?: boolean;
    onUpdate?: (field: keyof Offer, value: any) => void;
    clients?: any[]; // Using any[] to accept whatever client object comes in, or define safer type
}

export default function OfferDetailsHeader({
    offer,
    onStatusChange,
    children,
    isTemplateMode = false,
    isEditable = false,
    onUpdate,
    clients = []
}: OfferDetailsHeaderProps) {

    const handleUpdate = (field: keyof Offer, value: any) => {
        if (onUpdate) {
            onUpdate(field, value);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6 border border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                {/* Header Actions (Children) - Rendered at top or side */}
                {children && (
                    <div className="order-first md:order-last w-full md:w-auto">
                        {children}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Numer oferty / Nazwa wzoru / Tytuł */}
                <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-gray-500">
                        <FileText className="h-4 w-4" />
                        <span className="text-sm">{isTemplateMode ? 'Nazwa wzoru' : 'Numer / Tytuł'}</span>
                    </div>
                    {isEditable ? (
                        <div className="space-y-2">
                            {!isTemplateMode && (
                                <input
                                    type="text"
                                    value={offer.number}
                                    onChange={(e) => handleUpdate('number', e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white"
                                    placeholder="Numer oferty"
                                />
                            )}
                            <input
                                type="text"
                                value={offer.title}
                                onChange={(e) => handleUpdate('title', e.target.value)}
                                className="w-full px-2 py-1 text-sm font-medium border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white"
                                placeholder={isTemplateMode ? "Nazwa wzoru" : "Tytuł oferty"}
                            />
                        </div>
                    ) : (
                        <p className="font-medium text-gray-900">{offer.title || offer.number}</p>
                    )}
                </div>

                {/* Klient - hide for templates if empty */}
                {!isTemplateMode && (
                    <div className="space-y-1">
                        <div className="flex items-center space-x-2 text-gray-500">
                            <Users2 className="h-4 w-4" />
                            <span className="text-sm">Klient</span>
                        </div>
                        {isEditable ? (
                            <ClientSelector
                                value={offer.clientId || ''}
                                onChange={(value) => handleUpdate('clientId', value)}
                            />
                        ) : (
                            <p className="font-medium text-gray-900">{
                                // Try to find client name if we have clients list and clientId is an ID
                                clients.find(c => c.id === offer.clientId)?.name ||
                                (clients.find(c => c.id === offer.clientId)?.type === 'company' ? clients.find(c => c.id === offer.clientId)?.company : null) ||
                                offer.clientId
                            }</p>
                        )}
                    </div>
                )}

                {/* Miejsce montażu - hide for templates if empty */}
                {!isTemplateMode && (
                    <div className="space-y-1">
                        <div className="flex items-center space-x-2 text-gray-500">
                            <MapPin className="h-4 w-4" />
                            <span className="text-sm">Miejsce montażu</span>
                        </div>
                        {isEditable ? (
                            <input
                                type="text"
                                value={offer.location}
                                onChange={(e) => handleUpdate('location', e.target.value)}
                                className="w-full px-2 py-1 text-sm font-medium border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white"
                            />
                        ) : (
                            <p className="font-medium text-gray-900">{offer.location}</p>
                        )}
                    </div>
                )}

                {/* Status - hide for templates */}
                {!isTemplateMode && (
                    <div className="space-y-1">
                        <label className="block text-sm text-gray-500">Status</label>
                        <select
                            value={offer.status}
                            onChange={(e) => onStatusChange(e.target.value as 'draft' | 'sent' | 'accepted' | 'rejected')}
                            className={`w-full px-3 py-2 text-sm font-medium rounded-lg ${offer.status === 'draft'
                                ? 'bg-gray-100 text-gray-800'
                                : offer.status === 'sent'
                                    ? 'bg-blue-100 text-blue-800'
                                    : offer.status === 'accepted'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                }`}
                        >
                            <option value="draft">Szkic</option>
                            <option value="sent">Wysłana</option>
                            <option value="accepted">Zaakceptowana</option>
                            <option value="rejected">Odrzucona</option>
                        </select>
                    </div>
                )}
            </div>
        </div>
    );
}
