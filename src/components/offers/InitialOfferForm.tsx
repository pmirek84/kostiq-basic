import React, { useState } from 'react';
import { FileText, MapPin, Hash } from 'lucide-react';
import { ClientSelector } from '../ui/ClientSelector';

interface InitialOfferFormProps {
    onSubmit: (data: { number: string; client: string; location: string }) => void;
    onCancel: () => void;
}

export default function InitialOfferForm({ onSubmit, onCancel }: InitialOfferFormProps) {
    const [selectedClientId, setSelectedClientId] = useState('');

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        onSubmit({
            number: '',
            client: selectedClientId,
            location: formData.get('location') as string
        });
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white border border-zinc-100 rounded-[28px] max-w-lg w-full p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center space-x-3 mb-6">
                    <div className="p-2.5 bg-teal-50 text-[#21808D] rounded-xl">
                        <FileText className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-950">Nowa Oferta</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Numer oferty: informacja o automatycznym nadawaniu przez serwer */}
                    <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                            Numer oferty
                        </label>
                        <div className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 text-sm text-zinc-600 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <Hash className="h-4 w-4 text-zinc-400" />
                                <span>Nadawany automatycznie przez serwer</span>
                            </div>
                            <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-zinc-200/80 text-zinc-700 rounded-md">OF/YYYY/NNN</span>
                        </div>
                    </div>

                    {/* Klient */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
                            Wybierz Klienta
                        </label>
                        <ClientSelector value={selectedClientId} onChange={setSelectedClientId} />
                    </div>

                    {/* Lokalizacja */}
                    <div>
                        <label htmlFor="location" className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                            Miejsce wbudowania / Adres
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <MapPin className="h-4.5 w-4.5 text-zinc-400" />
                            </div>
                            <input
                                type="text"
                                name="location"
                                id="location"
                                required
                                className="w-full pl-10 rounded-xl border border-zinc-200/80 bg-white p-3 text-sm text-zinc-900 focus:border-[#21808D] focus:ring-1 focus:ring-[#21808D] outline-none"
                                placeholder="Adres montażu"
                            />
                        </div>
                    </div>

                    {/* Przyciski */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 border border-zinc-200 text-zinc-650 rounded-xl hover:bg-zinc-50 text-sm font-semibold transition-all"
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 bg-zinc-950 text-white hover:bg-zinc-800 rounded-xl text-sm font-semibold transition-all shadow-sm animate-none"
                        >
                            Dalej
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
