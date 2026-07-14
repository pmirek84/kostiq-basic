import { useCompanySettings } from '../../hooks/useCompanySettings';
import type { Offer, Construction } from '../../models/types';
import { formatDate } from '../../utils/format';
import { calculateOfferSummary } from '../../utils/offerCalculator';

interface OfferPrintViewProps {
    offer: Offer;
    constructions: Construction[];
    clients?: any[];
    printMode?: 'detailed' | 'summary';
}

export default function OfferPrintView({ offer, constructions, clients = [], printMode = 'detailed' }: OfferPrintViewProps) {
    const { settings: companySettings } = useCompanySettings();
    const printLayout = offer.printLayout || 'standard';

    // 1. Calculate Base Costs from Constructions
    const constructionsMaterialsCost = constructions.reduce((sum, c) => sum + c.materialCosts.total, 0);
    const constructionsInstallationCost = constructions.reduce((sum, c) => sum + c.installationCosts.total, 0);

    // 2. Identify Additional Costs (Transport, WorkTime)
    const offerSettings = (offer?.settings || {}) as any;

    const calcTransportCost = (t: any) => t ? (t.distance * t.ratePerKm * t.roundTrips) : 0;
    const calcWorkTimeCost = (w: any) => w ? (w.workTime * w.workerCount * w.hourlyRate) : 0;

    const constructionTransportCost = calcTransportCost(offerSettings?.constructionTransport) || offer.constructionTransportCost || 0;
    const workerTransportCost = calcTransportCost(offerSettings?.workerTransport) || offer.workerTransportCost || 0;
    const workTimeCost = calcWorkTimeCost(offerSettings?.workTime) || offer.workTimeCost || 0;
    const equipmentRentalCost = offer.equipmentRentalCost || 0;

    const transportPrice = constructionTransportCost + workerTransportCost;
    const totalAdditionalCosts = transportPrice + workTimeCost + equipmentRentalCost;

    let otherCosts = totalAdditionalCosts;
    if (otherCosts === 0 && offer.laborCost && offer.laborCost > constructionsInstallationCost) {
        otherCosts = (offer.laborCost || 0) - constructionsInstallationCost;
    }

    // 3. Prepare Margin
    const margin = offerSettings?.margin || 0;
    const marginMultiplier = 1 + (margin / 100);

    // 4. Calculate Final Summary
    const summary = calculateOfferSummary(
        constructions,
        offer.vatRate || 23,
        offer.discountType || 'none',
        offer.discountValue || 0,
        otherCosts,
        margin
    );

    const vatRate = offer.vatRate || companySettings.defaultVatRate || 23;

    // Resolve Client Name
    const clientName = (() => {
        if (!offer.clientId) return '';
        const client = clients.find(c => c.id === offer.clientId);
        if (client) {
            if (client.type === 'company') return client.company || client.name;
            return [client.name, client.lastName].filter(Boolean).join(' ');
        }
        return offer.clientId;
    })();

    const formatCurrency = (val: number) => `${(val || 0).toFixed(2)}\u00A0PLN`;

    return (
        <div className="hidden print:block bg-white p-8 max-w-[210mm] mx-auto print-container" style={{ fontFamily: printLayout === 'simple' ? 'Arial, Helvetica, sans-serif' : 'Inter, system-ui, Arial, sans-serif' }}>
            <style>{`
                @media print {
                    @page { margin: 0; size: A4; }
                    html, body { margin: 0; padding: 0; background: white; height: 100%; }
                    * { font-family: ${printLayout === 'simple' ? 'Arial, Helvetica, sans-serif' : 'Verdana, Geneva, sans-serif'} !important; }
                    body { color: #000 !important; font-size: ${printLayout === 'simple' ? '8.5pt' : '9pt'}; line-height: 1.4; }
                    .print-container { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 15mm 20mm !important; border: none !important; }
                    .print-footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 10mm 20mm; font-size: 7pt; color: #555 !important; border-top: 1px solid #eee; text-align: center; background: white; }
                    .print-content { margin-bottom: 30mm; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { 
                        background-color: ${printLayout === 'simple' ? 'transparent' : '#f9fafb'} !important; 
                        border-bottom: ${printLayout === 'simple' ? '1px solid #000' : '2px solid #333'}; 
                        padding: 8px 4px; 
                        text-transform: uppercase; 
                        font-size: 8pt; 
                        font-weight: bold;
                    }
                    td { border-bottom: 1px solid #eee; padding: 8px 4px; vertical-align: top; }
                    .text-right { text-align: right; }
                    .font-bold { font-weight: bold; }
                    .bg-gray-50 { background-color: #f9fafb !important; }
                }
            `}</style>

            <div className="print-content">
                {/* Header Section */}
                {printLayout === 'simple' ? (
                    <div className="flex justify-between items-start mb-8 border-b border-zinc-200 pb-4">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-zinc-900 mb-1">OFERTA HANDLOWA</h1>
                            <p className="text-xs text-zinc-500 font-semibold">Nr referencyjny: {offer.number || '---'}</p>
                            <div className="mt-4">
                                <span className="text-[9px] font-bold text-zinc-400 block tracking-wider uppercase">Dla Zleceniodawcy:</span>
                                <p className="font-bold text-zinc-950 uppercase">{clientName || '---'}</p>
                                {offer.location && <p className="text-xs text-zinc-650">{offer.location}</p>}
                            </div>
                        </div>
                        <div className="text-right">
                            {companySettings.logoUrl && (
                                <div className="mb-2 flex justify-end">
                                    <img
                                        src={(() => {
                                            const url = companySettings.logoUrl!;
                                            if (url.startsWith('http')) return url;
                                            const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
                                            return `${base}${url}`;
                                        })()}
                                        alt="Logo"
                                        style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain' }}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                </div>
                            )}
                            <div className="text-sm font-bold text-zinc-900">{companySettings.companyName}</div>
                            <p className="text-[10px] text-zinc-550">{companySettings.address}</p>
                            <p className="text-[10px] text-zinc-550">NIP: {companySettings.taxId}</p>
                            <p className="text-[10px] text-zinc-550 mt-2 font-semibold">Data wystawienia: {formatDate(offer.createdAt)}</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-between items-start mb-10 border-b-2 border-black pb-6">
                        <div>
                            <h1 className="text-3xl font-black tracking-tighter mb-2">OFERTA HANDLOWA</h1>
                            <p className="text-sm font-bold text-gray-600">NR: {offer.number || '---'}</p>
                            <div className="mt-6">
                                <p className="text-[10px] font-black uppercase text-gray-400 mb-1">DLA ZLECENIODAWCY:</p>
                                <p className="text-lg font-black uppercase italic">{clientName || '---'}</p>
                                <p className="text-sm text-gray-600">{offer.location}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            {companySettings.logoUrl && (
                                <div className="mb-3 flex justify-end">
                                    <img
                                        src={(() => {
                                            const url = companySettings.logoUrl!;
                                            if (url.startsWith('http')) return url;
                                            const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
                                            return `${base}${url}`;
                                        })()}
                                        alt="Logo firmy"
                                        style={{ maxHeight: '110px', maxWidth: '240px', objectFit: 'contain' }}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                </div>
                            )}
                            <div className="text-xl font-black text-[#21808D] mb-2">{companySettings.companyName}</div>
                            <p className="text-xs text-gray-500 max-w-[200px] ml-auto">{companySettings.address}</p>
                            <p className="text-xs text-gray-500">NIP: {companySettings.taxId}</p>
                            <p className="text-xs text-gray-500 mt-4">Data wystawienia: {formatDate(offer.createdAt)}</p>
                        </div>
                    </div>
                )}

                {/* Title */}
                {offer.title && (
                    <div className="mb-8">
                        {printLayout === 'simple' ? (
                            <h2 className="text-base font-bold text-zinc-900 pb-1 border-b border-zinc-200 uppercase tracking-tight">{offer.title}</h2>
                        ) : (
                            <h2 className="text-xl font-black border-l-4 border-[#21808D] pl-4 py-1 uppercase tracking-tight">{offer.title}</h2>
                        )}
                    </div>
                )}

                {/* Scope of Work */}
                {offer.scopeOfWork && offer.scopeOfWork.length > 0 && (
                    <div className="mb-8">
                        <h3 className={`text-xs font-black uppercase tracking-widest ${printLayout === 'simple' ? 'text-zinc-500' : 'text-[#21808D]'} mb-3`}>ZAKRES PRAC I USŁUG:</h3>
                        <ul className="space-y-1">
                            {offer.scopeOfWork.filter(item => typeof item === 'string').map((item, i) => (
                                <li key={i} className="flex gap-2 text-sm">
                                    <span className={`font-bold ${printLayout === 'simple' ? 'text-zinc-800' : 'text-[#21808D]'}`}>{i + 1}.</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Materials & Conditions */}
                {(offer.customMaterials?.providedByUs?.length || 0) > 0 || (offer.customMaterials?.providedByClient?.length || 0) > 0 ? (
                    <div className="mb-8 grid grid-cols-2 gap-8">
                        {(offer.customMaterials?.providedByUs?.length || 0) > 0 && (
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Materiały Wykonawcy:</h3>
                                <ul className="text-xs space-y-1">
                                    {offer.customMaterials?.providedByUs?.filter((m): m is string => typeof m === 'string').map((m, i) => <li key={i}>• {m}</li>)}
                                </ul>
                            </div>
                        )}
                        {(offer.customMaterials?.providedByClient?.length || 0) > 0 && (
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Materiały Zleceniodawcy:</h3>
                                <ul className="text-xs space-y-1">
                                    {offer.customMaterials?.providedByClient?.filter((m): m is string => typeof m === 'string').map((m, i) => <li key={i}>• {m}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                ) : null}

                {/* Detailed Specifications Table */}
                {printMode === 'detailed' && constructions.length > 0 && (
                    <div className="mb-10">
                        <h3 className={`text-xs font-black uppercase tracking-widest ${printLayout === 'simple' ? 'text-zinc-500' : 'text-[#21808D]'} mb-3`}>SPECYFIKACJA KONSTRUKCJI:</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th className="text-left w-8">Poz.</th>
                                    <th className="text-left">Opis / Typ</th>
                                    <th className="text-center w-24">Wymiary (mm)</th>
                                    <th className="text-center w-12">Ilość</th>
                                    <th className="text-right w-24">Cena jedn.</th>
                                    <th className="text-right w-28">Wartość Netto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {constructions.map((c, i) => {
                                    const totalItemCost = (c.materialCosts.total + c.installationCosts.total);
                                    const clientItemPrice = totalItemCost * marginMultiplier;
                                    const unitPrice = clientItemPrice / c.quantity;
                                    return (
                                        <tr key={c.id}>
                                            <td className="text-gray-400 font-bold">{i + 1}</td>
                                            <td>
                                                <div className="font-bold">{c.name}</div>
                                                <div className="text-[8pt] text-gray-500 uppercase">{c.type}</div>
                                            </td>
                                            <td className="text-center">{(c.width * 1000).toFixed(0)} x {(c.height * 1000).toFixed(0)}</td>
                                            <td className="text-center font-bold">{c.quantity}</td>
                                            <td className="text-right">{unitPrice.toFixed(2)}</td>
                                            <td className="text-right font-bold">{clientItemPrice.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-300 font-bold text-gray-700 text-[9pt]">
                                    <td colSpan={2} className="py-2 text-left">Razem specyfikacja:</td>
                                    <td className="py-2 text-center text-[7.5pt] text-gray-550 leading-tight">
                                        {constructions.reduce((sum, c) => sum + (c.totalArea || 0), 0).toFixed(2)}&nbsp;m²<br />
                                        {constructions.reduce((sum, c) => sum + (c.totalPerimeter || 0), 0).toFixed(2)}&nbsp;mb
                                    </td>
                                    <td className="py-2 text-center">{constructions.reduce((sum, c) => sum + c.quantity, 0)}&nbsp;szt.</td>
                                    <td></td>
                                    <td className="py-2 text-right">{formatCurrency(constructions.reduce((sum, c) => sum + (c.materialCosts.total + c.installationCosts.total) * marginMultiplier, 0))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* Additional Notes */}
                {offer.notes && offer.notes.length > 0 && (
                    <div className={`mb-10 p-4 rounded-xl border break-inside-avoid ${printLayout === 'simple' ? 'bg-zinc-50 border-zinc-200' : 'bg-gray-50 border-gray-100'}`}>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">UWAGI DODATKOWE:</h3>
                        <ul className="text-xs space-y-1 italic">
                            {offer.notes.filter((note): note is string => typeof note === 'string').map((note, i) => <li key={i} className="flex gap-2"><span>•</span> <span>{note}</span></li>)}
                        </ul>
                    </div>
                )}

                {/* Financial Summary */}
                {printLayout === 'simple' ? (
                    <div className="mt-12 pt-6 border-t border-zinc-200 break-inside-avoid">
                        <div className="flex justify-end">
                            <div className="w-80 space-y-2.5">
                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">PODSUMOWANIE FINANSOWE:</h4>
                                
                                {printMode === 'detailed' && (
                                    <div className="space-y-1 text-xs text-zinc-650 border-b border-zinc-100 pb-2">
                                        <div className="flex justify-between">
                                            <span>Konstrukcje i materiały:</span>
                                            <span>{formatCurrency(constructionsMaterialsCost * marginMultiplier)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Usługi montażowe:</span>
                                            <span>{formatCurrency(constructionsInstallationCost * marginMultiplier)}</span>
                                        </div>
                                        {transportPrice > 0 && (
                                            <div className="flex justify-between">
                                                <span>Transport:</span>
                                                <span>{formatCurrency(transportPrice * marginMultiplier)}</span>
                                            </div>
                                        )}
                                        {equipmentRentalCost > 0 && (
                                            <div className="flex justify-between">
                                                <span>Sprzęt pomocniczy:</span>
                                                <span>{formatCurrency(equipmentRentalCost * marginMultiplier)}</span>
                                            </div>
                                        )}
                                        {workTimeCost > 0 && (
                                            <div className="flex justify-between">
                                                <span>Prace pomocnicze:</span>
                                                <span>{formatCurrency(workTimeCost * marginMultiplier)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex justify-between text-xs text-zinc-800">
                                    <span>Wartość netto ogółem:</span>
                                    <span className="font-semibold">{formatCurrency(summary.totalNet)}</span>
                                </div>

                                {summary.discountAmount > 0 && (
                                    <div className="flex justify-between text-xs text-red-650 font-semibold">
                                        <span>Rabat {offer.discountType === 'percent' ? `(${offer.discountValue}%)` : ''}:</span>
                                        <span>-{formatCurrency(summary.discountAmount)}</span>
                                    </div>
                                )}

                                <div className="flex justify-between text-xs text-zinc-550">
                                    <span>Podatek VAT ({vatRate}%):</span>
                                    <span>{formatCurrency(summary.vatAmount)}</span>
                                </div>

                                <div className="border-t border-zinc-300 pt-2 flex justify-between items-center">
                                    <span className="text-xs font-bold text-zinc-900 uppercase">Do zapłaty (Brutto):</span>
                                    <span className="text-xl font-bold text-[#21808D]">{formatCurrency(summary.totalGross)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mt-12 pt-8 border-t-2 border-gray-100 break-inside-avoid p-6 bg-gray-50/50 rounded-2xl">
                        <h3 className="text-xs font-black uppercase tracking-widest text-[#21808D] mb-6 text-center">PODSUMOWANIE FINANSOWE OFERTY</h3>

                        <div className="grid grid-cols-2 gap-12">
                            {/* Cost Breakdown */}
                            <div className="space-y-2">
                                {printMode === 'detailed' ? (
                                    <>
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Składniki ceny netto:</h4>
                                        <div className="flex justify-between text-xs">
                                            <span>Konstrukcje i materiały:</span>
                                            <span className="font-bold">{formatCurrency(constructionsMaterialsCost * marginMultiplier)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span>Usługi montażowe:</span>
                                            <span className="font-bold">{formatCurrency(constructionsInstallationCost * marginMultiplier)}</span>
                                        </div>
                                        {transportPrice > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span>Koszty transportu:</span>
                                                <span className="font-bold">{formatCurrency(transportPrice * marginMultiplier)}</span>
                                            </div>
                                        )}
                                        {equipmentRentalCost > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span>Wynajem sprzętu:</span>
                                                <span className="font-bold">{formatCurrency(equipmentRentalCost * marginMultiplier)}</span>
                                            </div>
                                        )}
                                        {workTimeCost > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span>Prace dodatkowe:</span>
                                                <span className="font-bold">{formatCurrency(workTimeCost * marginMultiplier)}</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex flex-col justify-center h-full">
                                        <p className="text-[10px] text-gray-400 uppercase font-black">Typ oferty: <span className="text-[#21808D]">ZRYCZAŁTOWANA</span></p>
                                    </div>
                                )}
                            </div>

                            {/* Totals */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Suma netto:</span>
                                    <span className="text-xl font-black whitespace-nowrap">{formatCurrency(summary.totalNet)}</span>
                                </div>

                                {summary.discountAmount > 0 && (
                                    <div className="flex justify-between items-baseline text-red-650">
                                        <span className="text-xs font-bold uppercase tracking-widest">Rabat {offer.discountType === 'percent' ? `(${offer.discountValue}%)` : ''}:</span>
                                        <span className="text-sm font-black whitespace-nowrap">-{formatCurrency(summary.discountAmount)}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Podatek VAT ({vatRate}%):</span>
                                    <span className="text-sm font-bold whitespace-nowrap">{formatCurrency(summary.vatAmount)}</span>
                                </div>

                                <div className="border-t-2 border-[#21808D] pt-4 mt-2 flex justify-between items-center">
                                    <span className="text-sm font-black uppercase text-[#21808D]">DO ZAPŁATY (Brutto):</span>
                                    <div className="text-right">
                                        <div className="text-3xl font-black text-[#21808D] tracking-tighter leading-none whitespace-nowrap">
                                            {formatCurrency(summary.totalGross)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Signature Block */}
                <div className={`mt-20 flex justify-between px-10 text-[9px] font-bold text-gray-400 uppercase tracking-widest`}>
                    <div className={`text-center border-t border-gray-200 pt-4 ${printLayout === 'simple' ? 'w-36' : 'w-40'}`}>Pieczęć Wykonawcy</div>
                    <div className={`text-center border-t border-gray-200 pt-4 ${printLayout === 'simple' ? 'w-36' : 'w-40'}`}>Podpis Klienta</div>
                </div>

                {/* Company Legal Footer */}
                <div className="print-footer">
                    <p>{companySettings.companyName} | {companySettings.address} | NIP: {companySettings.taxId}</p>
                    <p className="mt-1">System wygenerował dokument handlowy automatycznie. Nie wymaga podpisu.</p>
                </div>
            </div>
        </div>
    );
}
