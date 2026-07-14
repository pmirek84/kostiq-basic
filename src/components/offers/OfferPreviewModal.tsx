import React, { useEffect, useState } from 'react';
import { X, Search, FileText, MapPin, User, Calendar } from 'lucide-react';
import type { Offer, Construction } from '../../models/types';
import { offerStorage } from '../../services/storage/offerStorage';
import { calculateOfferSummary } from '../../utils/offerCalculator';

interface OfferPreviewModalProps {
    offer: Offer;
    clientName: string;
    onClose: () => void;
}

export default function OfferPreviewModal({ offer, clientName, onClose }: OfferPreviewModalProps) {
    const [constructions, setConstructions] = useState<Construction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const loadDetails = async () => {
            setLoading(true);
            try {
                const items = await offerStorage.getConstructionsForOffer(offer.id);
                if (active) {
                    setConstructions(items);
                }
            } catch (error) {
                console.error('Failed to load constructions for preview:', error);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };
        loadDetails();
        return () => {
            active = false;
        };
    }, [offer.id]);

    const summary = calculateOfferSummary(
        constructions,
        offer.vatRate || 23,
        offer.discountType || 'none',
        offer.discountValue || 0,
        (offer as any).transportCostNet || 0,
        (offer as any).margin || 0
    );

    const totalCosts = ((offer as any).transportCostNet || 0) + 
        constructions.reduce((sum, c) => sum + (c.materialCosts?.total || 0) + (c.installationCosts?.total || 0), 0);
    const profitAmount = summary.totalNet - totalCosts;
    const actualMarginPercent = summary.totalNet > 0 ? (profitAmount / summary.totalNet) * 100 : 0;
    const isLowMargin = actualMarginPercent < 15;

    // SVG Doughnut metrics
    const matPercent = totalCosts > 0 ? (constructions.reduce((s, c) => s + (c.materialCosts?.total || 0), 0) / totalCosts) * 100 : 0;
    const labPercent = totalCosts > 0 ? ((totalCosts - constructions.reduce((s, c) => s + (c.materialCosts?.total || 0), 0)) / totalCosts) * 100 : 0;
    const circ = 226.2;
    const matStroke = (matPercent / 100) * circ;
    const labStroke = (labPercent / 100) * circ;
    const matOffset = 0;
    const labOffset = -matStroke;

    const getStatusText = (status: string) => {
        const labels: Record<string, string> = {
            draft: 'Szkic',
            sent: 'Wysłana',
            accepted: 'Zaakceptowana',
            rejected: 'Odrzucona',
            converted: 'Zlecenie'
        };
        return labels[status] || status;
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white border border-zinc-100 rounded-[28px] max-w-2xl w-full max-h-[85vh] overflow-y-auto p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 relative">
                
                {/* Header Actions */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-all"
                    title="Zamknij"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Title */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-teal-50 text-[#21808D] rounded-xl">
                        <Search className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-zinc-950">Podgląd Oferty</h2>
                            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-zinc-100 text-zinc-700 rounded-full">
                                {getStatusText(offer.status)}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">Szybki przegląd szczegółów bez edycji</p>
                    </div>
                </div>

                <hr className="border-zinc-150/40 my-5" />

                {/* Grid Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <FileText className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Numer oferty</p>
                            <p className="font-bold text-zinc-900 mt-0.5">{offer.number}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <User className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Klient</p>
                            <p className="font-bold text-zinc-900 mt-0.5">{clientName}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Lokalizacja montażu</p>
                            <p className="font-bold text-zinc-900 mt-0.5">{offer.location || 'Brak'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-zinc-600">
                        <Calendar className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Utworzono</p>
                            <p className="font-bold text-zinc-900 mt-0.5">
                                {offer.createdAt ? new Date(offer.createdAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                            </p>
                        </div>
                    </div>
                </div>

                <hr className="border-zinc-150/40 my-6" />

                {/* Construction Items */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Pozycje konstrukcyjne ({constructions.length})</h3>
                    {loading ? (
                        <div className="py-6 text-center text-xs text-zinc-500 font-medium">Trwa pobieranie pozycji...</div>
                    ) : constructions.length === 0 ? (
                        <div className="py-6 text-center text-xs text-zinc-500 italic">Brak pozycji w ofercie</div>
                    ) : (
                        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                            {constructions.map((c, i) => (
                                <div key={c.id || i} className="p-3 bg-zinc-50/60 border border-zinc-150/40 rounded-2xl flex justify-between items-center text-xs">
                                    <div className="space-y-0.5">
                                        <p className="font-semibold text-zinc-900">{c.name}</p>
                                        <p className="text-[10px] text-zinc-500">
                                            {c.width} x {c.height} mm | Profile: {(c as any).profileSystem || (c as any).system || 'standard'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-black text-zinc-900">x{c.quantity}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Profitability Warning Card */}
                {isLowMargin && totalCosts > 0 && (
                    <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 flex items-start gap-2.5 mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <span className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white text-[10px] font-bold mt-0.5 flex-shrink-0">!</span>
                        <div>
                            <p className="text-xs font-bold text-rose-950">Ostrzeżenie: Niska rentowność oferty</p>
                            <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                                Realna marża netto po uwzględnieniu rabatów wynosi <strong className="font-bold text-rose-900">{actualMarginPercent.toFixed(1)}%</strong>. Próg rentowności to <strong>15%</strong>.
                            </p>
                        </div>
                    </div>
                )}

                <hr className="border-zinc-150/40 my-6" />

                {/* Financial Summary */}
                <div className="bg-zinc-50/50 border border-zinc-200/60 rounded-[24px] p-5 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex-1 w-full space-y-3">
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                            <span>Suma kosztów netto:</span>
                            <span className="font-semibold text-zinc-800">{totalCosts.toFixed(2)} PLN</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                            <span>Narzut całkowity:</span>
                            <span className="font-semibold text-zinc-800">{(offer as any).margin || 0}%</span>
                        </div>
                        {offer.discountValue > 0 && (
                            <div className="flex justify-between items-center text-xs text-rose-650">
                                <span>Rabat ({offer.discountType === 'percent' ? `${offer.discountValue}%` : 'kwota'}):</span>
                                <span className="font-bold">-{summary.discountAmount.toFixed(2)} PLN</span>
                            </div>
                        )}
                        <hr className="border-zinc-200/40 my-1" />
                        <div className="flex justify-between items-center text-sm font-bold text-zinc-900">
                            <span>Wartość netto:</span>
                            <span>{summary.totalNet.toFixed(2)} PLN</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                            <span>Podatek VAT ({offer.vatRate || 23}%):</span>
                            <span>{summary.vatAmount.toFixed(2)} PLN</span>
                        </div>
                    </div>

                    {/* SVG Doughnut */}
                    {totalCosts > 0 && (
                        <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="36" fill="transparent" stroke="#F4F4F5" strokeWidth="12" />
                                {matStroke > 0 && (
                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#2563EB" strokeWidth="12" strokeDasharray={`${matStroke} ${circ}`} strokeDashoffset={matOffset} />
                                )}
                                {labStroke > 0 && (
                                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#0D9488" strokeWidth="12" strokeDasharray={`${labStroke} ${circ}`} strokeDashoffset={labOffset} />
                                )}
                            </svg>
                            <div className="absolute text-center">
                                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Marża</p>
                                <p className={`text-xs font-black mt-0.5 ${isLowMargin ? 'text-rose-600 animate-pulse' : 'text-[#21808D]'}`}>
                                    {actualMarginPercent.toFixed(0)}%
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* RAZEM DO ZAPŁATY Footer */}
                <div className="mt-6 pt-5 border-t border-zinc-150/40 flex justify-between items-center">
                    <span className="text-sm font-black text-zinc-950 uppercase tracking-wider">Do Zapłaty Brutto:</span>
                    <span className={`text-3xl font-black ${isLowMargin ? 'text-rose-600' : 'text-[#21808D]'}`}>
                        {summary.totalGross.toFixed(2)} <span className="text-sm font-bold">PLN</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
