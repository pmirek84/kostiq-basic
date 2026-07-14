import { useState, useEffect, useRef } from 'react';
import { Search, User, Briefcase, FileText, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../../context/ClientsContext';
import { useJobs } from '../../context/JobsContext';
import { useOffers } from '../../context/OffersContext';

export default function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<{ type: 'client' | 'job' | 'offer', id: string, title: string, subtitle: string }[]>([]);

    const { clients } = useClients();
    const { jobs } = useJobs();
    const { offers } = useOffers();

    const navigate = useNavigate();
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const q = query.toLowerCase();
        const searchResults: any[] = [];

        // Search Clients
        clients.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.nip && c.nip.includes(q))
        ).slice(0, 3).forEach(c => {
            searchResults.push({ type: 'client', id: c.id, title: c.name, subtitle: `Klient - ${c.nip || ''}` });
        });

        // Search Jobs
        jobs.filter(j =>
            j.name.toLowerCase().includes(q) ||
            j.jobCode.toLowerCase().includes(q)
        ).slice(0, 3).forEach(j => {
            searchResults.push({ type: 'job', id: j.id, title: j.name, subtitle: `Zlecenie - ${j.jobCode}` });
        });

        // Search Offers
        offers.filter(o =>
            o.number.toLowerCase().includes(q)
        ).slice(0, 3).forEach(o => {
            searchResults.push({ type: 'offer', id: o.id, title: `Oferta ${o.number}`, subtitle: 'Oferta' });
        });

        setResults(searchResults);
    }, [query, clients, jobs, offers]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (result: any) => {
        setIsOpen(false);
        setQuery('');
        switch (result.type) {
            case 'client': navigate(`/clients?id=${result.id}`); break;
            case 'job': navigate(`/jobs/${result.id}`); break;
            case 'offer': navigate(`/offers/${result.id}`); break;
        }
    };

    return (
        <div className="relative flex-1 max-w-md mx-4" ref={searchRef}>
            <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Szukaj klientów, zleceń, ofert... (Ctrl+/)"
                    className="w-full pl-10 pr-10 py-2 bg-slate-100 rounded-xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-teal-500/30 focus:bg-white outline-none transition-all text-sm border border-transparent focus:border-teal-500/30"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {query && (
                    <button
                        onClick={() => setQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="py-2">
                        {results.map((r, idx) => (
                            <button
                                key={`${r.type}-${r.id}-${idx}`}
                                onClick={() => handleSelect(r)}
                                className="w-full px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors text-left"
                            >
                                <div className={`p-2 rounded-lg ${r.type === 'client' ? 'bg-blue-50 text-blue-600' :
                                    r.type === 'job' ? 'bg-emerald-50 text-emerald-600' :
                                        'bg-purple-50 text-purple-600'
                                    }`}>
                                    {r.type === 'client' && <User className="h-4 w-4" />}
                                    {r.type === 'job' && <Briefcase className="h-4 w-4" />}
                                    {r.type === 'offer' && <FileText className="h-4 w-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">{r.title}</div>
                                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">{r.subtitle}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
