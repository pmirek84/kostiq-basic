import { Clock, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ActivityTimeline() {
    const activities = [
        {
            id: 1,
            type: 'offer_created',
            user: 'Jan Kowalski',
            description: 'Utworzył nową ofertę dla Firma ABC',
            time: '10 min temu',
            icon: FileText,
            color: '#0D9488',
            bg: 'bg-teal-50',
            border: 'border-teal-100'
        },
        {
            id: 2,
            type: 'job_status',
            user: 'Anna Nowak',
            description: 'Zmieniła status zlecenia #JO-231 na "W realizacji"',
            time: '2 godz. temu',
            icon: CheckCircle,
            color: '#10B981',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100'
        },
        {
            id: 3,
            type: 'alert',
            user: 'System',
            description: 'Wykryto ryzyko opóźnienia dla zlecenia #JO-220',
            time: '3 godz. temu',
            icon: AlertTriangle,
            color: '#F59E0B',
            bg: 'bg-amber-50',
            border: 'border-amber-100'
        },
        {
            id: 4,
            type: 'time_log',
            user: 'Marek Z.',
            description: 'Dodał wpis czasu: 8h (Montaż)',
            time: '5 godz. temu',
            icon: Clock,
            color: '#8B5CF6',
            bg: 'bg-violet-50',
            border: 'border-violet-100'
        }
    ];

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full shadow-sm">
            <h3 className="text-slate-800 font-semibold mb-6 text-base tracking-tight">Aktywność w systemie</h3>
            <div className="space-y-6 relative ml-2">
                <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />

                {activities.map((activity) => (
                    <div key={activity.id} className="relative flex items-start gap-4">
                        <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full ${activity.bg} flex items-center justify-center border ${activity.border}`}>
                            <activity.icon className="h-4 w-4" style={{ color: activity.color }} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-sm text-slate-500">
                                <span className="font-semibold text-slate-700">{activity.user}</span> <span className="text-slate-400">{activity.description}</span>
                            </p>
                            <span className="text-xs text-slate-400 mt-1 block">{activity.time}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
