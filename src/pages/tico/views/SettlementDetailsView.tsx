import { useTiCo } from '../../../context/TiCoContext';
import { X, RefreshCw, Download, Lock } from 'lucide-react';

interface SettlementDetailsViewProps {
    settlementId: string;
    onClose: () => void;
}

export function SettlementDetailsView({ settlementId, onClose }: SettlementDetailsViewProps) {
    const { settlements, timeEntries, updateSettlement, recalculateSettlement, markSettlementExported } = useTiCo();

    const settlement = settlements.find(s => s.id === settlementId);

    // Safety check
    if (!settlement) return null;

    const entries = timeEntries.filter(t => settlement.timeEntryIds.includes(t.id));

    const handleRecalculate = () => {
        recalculateSettlement(settlementId);
    };

    const handleExport = () => {
        markSettlementExported(settlementId);
        alert('Eksport CSV zrealizowany.');
    };

    const handleNotesChange = (notes: string) => {
        updateSettlement(settlementId, { notes });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-gray-900">{settlement.workerName}</h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${settlement.status === 'open' ? 'bg-blue-100 text-blue-800' :
                                settlement.status === 'closed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                {settlement.status}
                            </span>
                        </div>
                        <p className="text-gray-500 mt-1">
                            Okres: <span className="font-medium text-gray-900">{settlement.periodFrom} - {settlement.periodTo}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Left: Stats & Info */}
                    <div className="w-full md:w-80 bg-gray-50 p-6 border-r border-gray-100 overflow-y-auto space-y-6">
                        <div>
                            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Podsumowanie</div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Suma godzin:</span>
                                    <span className="font-bold">{settlement.totalHours} h</span>
                                </div>
                                {settlement.overtimeHours > 0 && (
                                    <div className="flex justify-between text-blue-600 text-sm">
                                        <span>w tym nadgodziny:</span>
                                        <span>{settlement.overtimeHours} h (+{settlement.overtimePay.toFixed(2)} PLN)</span>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-gray-50 pt-2">
                                    <span className="text-gray-600">Kwota brutto:</span>
                                    <span className="font-medium">
                                        {settlement.grossAmount ? settlement.grossAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) : '-'}
                                    </span>
                                </div>
                                {settlement.advanceDeductions > 0 && (
                                    <div className="flex justify-between text-red-600">
                                        <span>Potrącone zaliczki:</span>
                                        <span>-{settlement.advanceDeductions.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                    <span className="text-gray-600 font-semibold">DO WYPŁATY:</span>
                                    <span className="font-bold text-xl text-green-600">
                                        {settlement.totalAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Akcje</div>
                            <div className="space-y-2">
                                <button
                                    onClick={handleRecalculate}
                                    disabled={settlement.status === 'exported'}
                                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Przelicz sumy
                                </button>
                                <button
                                    onClick={handleExport}
                                    disabled={settlement.status === 'exported'}
                                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {settlement.status === 'exported' ? <Lock className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                                    {settlement.status === 'exported' ? 'Wyeksportowano' : 'Eksportuj / Zamknij'}
                                </button>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Notatki</div>
                            <textarea
                                value={settlement.notes || ''}
                                onChange={(e) => handleNotesChange(e.target.value)}
                                className="w-full rounded-lg border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                                rows={4}
                                placeholder="Dodaj notatkę..."
                                disabled={settlement.status === 'exported'}
                            />
                        </div>
                    </div>

                    {/* Right: Table */}
                    <div className="flex-1 overflow-y-auto p-0">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-gray-500 font-medium border-b border-gray-100 sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-6 py-3 bg-white">Data</th>
                                    <th className="px-6 py-3 bg-white">Zlecenie / Etap</th>
                                    <th className="px-6 py-3 bg-white">Godziny</th>
                                    <th className="px-6 py-3 bg-white">Stawka</th>
                                    <th className="px-6 py-3 bg-white">Koszt</th>
                                    <th className="px-6 py-3 bg-white">Opis</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {entries.map(entry => (
                                    <tr key={entry.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 whitespace-nowrap text-gray-600">{entry.date}</td>
                                        <td className="px-6 py-3">
                                            <div className="font-medium text-gray-900">{entry.jobCode}</div>
                                            <div className="text-xs text-gray-500">{entry.stageName}</div>
                                        </td>
                                        <td className="px-6 py-3 font-medium">
                                            {(entry.billingType as string) === 'daily' ? `${entry.hours} dni` : (entry.billingType as string) === 'project' ? '-' : `${entry.hours} h`}
                                        </td>
                                        <td className="px-6 py-3 text-gray-600 text-xs">
                                            {(entry.billingType as string) === 'hourly' ? (
                                                <span>{entry.hourlyRate} PLN/h</span>
                                            ) : (entry.billingType as string) === 'daily' ? (
                                                <span>{entry.hourlyRate} PLN/dzień</span>
                                            ) : (
                                                <span>Ryczałt ({entry.hourlyRate} PLN)</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 font-semibold text-gray-900">
                                            {entry.cost.toFixed(2)} PLN
                                        </td>
                                        <td className="px-6 py-3 text-gray-500 max-w-[200px] truncate">
                                            {entry.description || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
