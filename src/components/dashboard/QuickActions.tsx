import { UserPlus, FilePlus, ClipboardList, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickActionsProps {
    variant?: 'default' | 'header';
}

export default function QuickActions({ variant = 'default' }: QuickActionsProps) {
    const navigate = useNavigate();

    const handleAction = (action: string) => {
        switch (action) {
            case 'client':
                navigate('/clients?action=new');
                break;
            case 'offer':
                navigate('/offers?action=new');
                break;
            case 'job':
                navigate('/jobs/new');
                break;
            case 'time':
                navigate('/tico');
                break;
        }
    };

    const actions = [
        { icon: UserPlus, label: 'Nowy klient', action: 'client' },
        { icon: FilePlus, label: 'Nowa oferta', action: 'offer' },
        { icon: ClipboardList, label: 'Nowe zlecenie', action: 'job' },
        { icon: Clock, label: 'Wpis czasu', action: 'time' },
    ];

    if (variant === 'header') {
        return (
            <div className="flex items-center gap-3">
                {actions.map(({ icon: Icon, label, action }) => (
                    <button
                        key={action}
                        onClick={() => handleAction(action)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all duration-300 text-sm font-medium shadow-sm"
                    >
                        <Icon className="h-4 w-4 text-zinc-800" />
                        <span>{label}</span>
                    </button>
                ))}
            </div>
        );
    }

    // Default card layout
    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-zinc-900 font-semibold mb-6 text-base tracking-tight">Szybkie akcje</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {actions.map(({ icon: Icon, label, action }) => (
                    <button
                        key={action}
                        onClick={() => handleAction(action)}
                        className="flex items-center gap-3 p-4 rounded-xl border border-zinc-150 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300 transition-all group"
                    >
                        <div className="bg-zinc-100 p-2.5 rounded-lg border border-zinc-200 group-hover:bg-zinc-200">
                            <Icon className="h-5 w-5 text-zinc-800" />
                        </div>
                        <span className="text-sm font-medium text-zinc-600 group-hover:text-zinc-900">{label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
