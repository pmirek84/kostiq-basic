import { useEffect, useState } from 'react';
import { Truck, Users, Clock, Loader2 } from 'lucide-react';
import type { LogisticsRate } from '../hooks/useLogisticsRates';

export interface TransportSettingsType {
    constructionTransport: {
        vehicleType: string;
        roundTrips: number;
        distance: number;
        ratePerKm: number;
    };
    workerTransport: {
        vehicleType: string;
        roundTrips: number;
        distance: number;
        ratePerKm: number;
    };
    workTime: {
        workTime: number;
        workerCount: number;
        hourlyRate: number;
    };
}

import { calculateRoadDistance, type RoadDistanceResult } from '../utils/distanceCalculator';

interface TransportSettingsProps {
    settings: TransportSettingsType;
    onSettingsChange: (settings: TransportSettingsType) => void;
    logisticsRates: LogisticsRate[];
    companyAddress?: string;
    installationLocation?: string;
}



export default function TransportSettings({ 
    settings, 
    onSettingsChange, 
    logisticsRates,
    companyAddress,
    installationLocation
}: TransportSettingsProps) {
    
    const [calculatedRoad, setCalculatedRoad] = useState<RoadDistanceResult | null>(null);
    const [loadingDistance, setLoadingDistance] = useState(false);

    useEffect(() => {
        if (!companyAddress || !installationLocation) {
            setCalculatedRoad(null);
            return;
        }

        let active = true;
        const calculate = async () => {
            setLoadingDistance(true);
            try {
                const res = await calculateRoadDistance(companyAddress, installationLocation);
                if (active) {
                    setCalculatedRoad(res);
                }
            } catch (e) {
                console.error('[DistanceCalculator] Error calculating distance:', e);
            } finally {
                if (active) {
                    setLoadingDistance(false);
                }
            }
        };

        calculate();
        return () => {
            active = false;
        };
    }, [companyAddress, installationLocation]);

    const saveSettings = (newSettings: TransportSettingsType) => {
        onSettingsChange(newSettings);
    };

    const applySuggestedDistance = () => {
        if (!calculatedRoad || calculatedRoad.distance <= 0) return;
        const newSettings = {
            ...settings,
            constructionTransport: {
                ...settings.constructionTransport,
                distance: calculatedRoad.distance
            },
            workerTransport: {
                ...settings.workerTransport,
                distance: calculatedRoad.distance
            }
        };
        saveSettings(newSettings);
    };

    const handleConstructionTransportChange = (field: string, value: string | number) => {
        let updates: any = { [field]: typeof value === 'string' ? value : Number(value) };

        // Auto-update rate if vehicle type changes
        if (field === 'vehicleType') {
            const selectedRate = logisticsRates.find(r => r.id === value);
            if (selectedRate) {
                updates.ratePerKm = selectedRate.ratePerKm;
            }
        }

        const newSettings = {
            ...settings,
            constructionTransport: {
                ...settings.constructionTransport,
                ...updates
            }
        };
        saveSettings(newSettings);
    };

    const handleWorkerTransportChange = (field: string, value: string | number) => {
        let updates: any = { [field]: typeof value === 'string' ? value : Number(value) };

        // Auto-update rate if vehicle type changes
        if (field === 'vehicleType') {
            const selectedRate = logisticsRates.find(r => r.id === value);
            if (selectedRate) {
                updates.ratePerKm = selectedRate.ratePerKm;
            }
        }

        const newSettings = {
            ...settings,
            workerTransport: {
                ...settings.workerTransport,
                ...updates
            }
        };
        saveSettings(newSettings);
    };

    const handleWorkTimeChange = (field: string, value: number) => {
        const newSettings = {
            ...settings,
            workTime: {
                ...settings.workTime,
                [field]: Number(value)
            }
        };
        saveSettings(newSettings);
    };

    // Helper to check if current value is compatible with new rates
    const isLegacyValue = (val: string) => !logisticsRates.find(r => r.id === val);

    return (
        <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            {loadingDistance && (
                <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 flex items-center justify-center gap-3 text-zinc-500">
                    <Loader2 className="w-4 h-4 animate-spin text-[#21808D]" />
                    <span className="text-xs font-medium">Trwa obliczanie dokładnej trasy drogowej z map...</span>
                </div>
            )}

            {!loadingDistance && calculatedRoad && calculatedRoad.distance > 0 && (
                <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-950">Sugerowana odległość logistyczna</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${calculatedRoad.isExact ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                {calculatedRoad.isExact ? 'Trasa dokładna (OSRM)' : 'Szacowana trasa (brak połączenia)'}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                            Odległość drogowa z siedziby firmy ({calculatedRoad.fromCity || 'siedziba'}) do miejsca montażu ({calculatedRoad.toCity || 'miejsce montażu'}): <strong className="text-[#21808D]">{calculatedRoad.distance} km</strong>.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={applySuggestedDistance}
                        className="px-3.5 py-1.5 bg-zinc-950 text-white hover:bg-zinc-850 rounded-xl text-xs font-bold shadow-sm transition-all flex-shrink-0"
                    >
                        Zastosuj {calculatedRoad.distance} km
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Transport konstrukcji */}
                <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-[#21808D]">
                        <Truck className="h-5 w-5" />
                        <h4 className="font-medium text-gray-900">Transport konstrukcji</h4>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Typ pojazdu</label>
                            <select
                                value={settings.constructionTransport.vehicleType}
                                onChange={(e) => handleConstructionTransportChange('vehicleType', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="">-- Wybierz pojazd --</option>
                                {isLegacyValue(settings.constructionTransport.vehicleType) && settings.constructionTransport.vehicleType && (
                                    <option value={settings.constructionTransport.vehicleType}>
                                        {settings.constructionTransport.vehicleType} (Archiwalny)
                                    </option>
                                )}
                                {logisticsRates.map(rate => (
                                    <option key={rate.id} value={rate.id}>
                                        {rate.vehicleType} ({rate.ratePerKm} PLN/km)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Liczba kursów</label>
                            <input
                                type="number"
                                min="0"
                                value={settings.constructionTransport.roundTrips}
                                onChange={(e) => handleConstructionTransportChange('roundTrips', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Odległość (km)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={settings.constructionTransport.distance}
                                onChange={(e) => handleConstructionTransportChange('distance', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Stawka za km (PLN)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={settings.constructionTransport.ratePerKm}
                                onChange={(e) => handleConstructionTransportChange('ratePerKm', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Transport pracowników */}
                <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-[#21808D]">
                        <Users className="h-5 w-5" />
                        <h4 className="font-medium text-gray-900">Transport pracowników</h4>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Typ pojazdu</label>
                            <select
                                value={settings.workerTransport.vehicleType}
                                onChange={(e) => handleWorkerTransportChange('vehicleType', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="">-- Wybierz pojazd --</option>
                                {isLegacyValue(settings.workerTransport.vehicleType) && settings.workerTransport.vehicleType && (
                                    <option value={settings.workerTransport.vehicleType}>
                                        {settings.workerTransport.vehicleType} (Archiwalny)
                                    </option>
                                )}
                                {logisticsRates.map(rate => (
                                    <option key={rate.id} value={rate.id}>
                                        {rate.vehicleType} ({rate.ratePerKm} PLN/km)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Liczba kursów</label>
                            <input
                                type="number"
                                min="0"
                                value={settings.workerTransport.roundTrips}
                                onChange={(e) => handleWorkerTransportChange('roundTrips', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Odległość (km)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={settings.workerTransport.distance}
                                onChange={(e) => handleWorkerTransportChange('distance', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Stawka za km (PLN)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={settings.workerTransport.ratePerKm}
                                onChange={(e) => handleWorkerTransportChange('ratePerKm', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Czas pracy */}
            <div className="pt-6 border-t border-gray-200">
                <div className="flex items-center space-x-2 text-[#21808D] mb-4">
                    <Clock className="h-5 w-5" />
                    <h4 className="font-medium text-gray-900">Czas pracy (opcjonalnie)</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Czas pracy (h)</label>
                        <input
                            type="number"
                            min="0"
                            value={settings.workTime.workTime}
                            onChange={(e) => handleWorkTimeChange('workTime', Number(e.target.value))}
                            className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Liczba pracowników</label>
                        <input
                            type="number"
                            min="0"
                            value={settings.workTime.workerCount}
                            onChange={(e) => handleWorkTimeChange('workerCount', Number(e.target.value))}
                            className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Stawka godzinowa (PLN)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={settings.workTime.hourlyRate}
                            onChange={(e) => handleWorkTimeChange('hourlyRate', Number(e.target.value))}
                            className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
