import { Briefcase, Calendar, AlertCircle, Smartphone } from 'lucide-react';
import { useJobs } from '../../context/JobsContext';
import type { AppNotification } from '../../models/dashboard';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';

// --- TodayJobs ---
export function TodayJobs() {
    const { jobs } = useJobs();
    const navigate = useNavigate();
    const todaysJobs = jobs.slice(0, 3);

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-zinc-900 font-semibold text-base tracking-tight">Dzisiejsze zlecenia</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-semibold">
                    {todaysJobs.length} aktywne
                </span>
            </div>

            <div className="flex-1 space-y-3">
                {todaysJobs.map((job, idx) => (
                    <div
                        key={idx}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-150 hover:border-zinc-300 transition-all cursor-pointer group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <Briefcase className="h-5 w-5 text-zinc-800" />
                            </div>
                            <div>
                                <h4 className="text-zinc-800 text-sm font-medium group-hover:text-black transition-colors">{job.name}</h4>
                                <p className="text-zinc-500 text-xs mt-0.5">{job.clientName || 'Klient'}</p>
                            </div>
                        </div>
                        <span className="text-xs font-medium text-zinc-650 bg-white px-2 py-1 rounded-md border border-zinc-200">08:00 - 16:00</span>
                    </div>
                ))}
            </div>

            <button
                onClick={() => navigate('/jobs')}
                className="w-full mt-6 py-2.5 border border-zinc-200 rounded-xl text-zinc-650 text-xs font-medium hover:bg-zinc-50 transition-all"
            >
                Zobacz wszystkie
            </button>
        </div>
    );
}

// --- UpcomingJobs ---
export function UpcomingJobs() {
    const { jobs } = useJobs();
    const navigate = useNavigate();
    const upcoming = jobs.filter(j => j.status === 'planned').slice(0, 3);

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col shadow-sm">
            <h3 className="text-zinc-900 font-semibold mb-6 text-base tracking-tight">Nadchodzące zlecenia</h3>

            <div className="flex-1 space-y-3">
                {upcoming.map((job, idx) => (
                    <div
                        key={idx}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        className="group flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-150 hover:border-zinc-300 transition-all cursor-pointer"
                    >
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <Calendar className="h-5 w-5 text-zinc-800" />
                            </div>
                            <div>
                                <h4 className="text-zinc-800 text-sm font-medium group-hover:text-black transition-colors">{job.name}</h4>
                                <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[120px]">
                                    {new Date().toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })}
                                </p>
                            </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${idx === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' : 'bg-white text-zinc-550 border border-zinc-200'}`}>
                            {idx === 0 ? 'Jutro' : 'Plan'}
                        </span>
                    </div>
                ))}
            </div>

            <button
                onClick={() => navigate('/jobs')}
                className="w-full mt-6 py-2.5 border border-zinc-200 rounded-xl text-zinc-650 text-xs font-medium hover:bg-zinc-50 transition-all"
            >
                Kalendarz
            </button>
        </div>
    );
}

// --- NotificationsPanel ---
export function NotificationsPanel() {
    const navigate = useNavigate();
    const [recentLogs, setRecentLogs] = useState<any[]>([]);

    useEffect(() => {
        fetch('http://localhost:3000/api/site-logs')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const sorted = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setRecentLogs(sorted.slice(0, 5));
                }
            })
            .catch(err => console.error("Failed to fetch dashboard logs", err));
    }, []);

    const allNotifications = useMemo(() => {
        const staticNotifications: AppNotification[] = [
            {
                id: '1', type: 'offer_waiting', title: 'Oferta do akceptacji',
                message: 'Klient Firma ABC wyświetlił ofertę #OF-2026/05',
                read: false, createdAt: new Date().toISOString()
            },
            {
                id: '2', type: 'job_delay', title: 'Ryzyko opóźnienia',
                message: 'Zlecenie #JO-220 przekroczyło planowany czas',
                read: false, createdAt: new Date(Date.now() - 86400000).toISOString()
            }
        ];

        const logNotifications: (AppNotification & { jobId?: string })[] = recentLogs.map(log => ({
            id: `log-${log.id}`,
            type: 'site_log',
            title: `Raport z budowy: ${log.type}`,
            message: log.description,
            read: false,
            createdAt: log.date,
            jobId: log.jobId
        }));

        return [...logNotifications, ...staticNotifications].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ).slice(0, 10);
    }, [recentLogs]);


    const icons: Record<string, any> = {
        offer_waiting: { icon: AlertCircle, color: '#000000', bg: 'bg-zinc-100' },
        job_delay: { icon: AlertCircle, color: '#d97706', bg: 'bg-amber-50 border-amber-100' },
        new_client: { icon: Briefcase, color: '#059669', bg: 'bg-emerald-50 border-emerald-100' },
        site_log: { icon: Smartphone, color: '#ea580c', bg: 'bg-orange-50 border-orange-100' },
        offer_rejected: { icon: AlertCircle, color: '#dc2626', bg: 'bg-red-50 border-red-100' },
        invoice_overdue: { icon: AlertCircle, color: '#dc2626', bg: 'bg-red-50 border-red-100' },
        system: { icon: AlertCircle, color: '#4b5563', bg: 'bg-zinc-100' },
    };

    const handleNotificationClick = (notif: any) => {
        if (notif.type === 'site_log' && notif.jobId) {
            navigate(`/jobs/${notif.jobId}`);
            return;
        }

        switch (notif.type) {
            case 'offer_waiting':
            case 'offer_rejected':
                navigate('/offers');
                break;
            case 'job_delay':
                navigate('/jobs');
                break;
            case 'new_client':
                navigate('/clients');
                break;
            default:
                break;
        }
    };

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'przed chwilą';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min. temu`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} godz. temu`;
        return `${Math.floor(diffInSeconds / 86400)} dni temu`;
    };

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-zinc-900 font-semibold text-base tracking-tight">Powiadomienia</h3>
                <button className="text-xs text-zinc-550 hover:text-black font-semibold transition-colors">Oznacz jako przeczytane</button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                {allNotifications.length === 0 ? (
                    <p className="text-center text-zinc-500 text-sm mt-10">Brak nowych powiadomień</p>
                ) : (
                    allNotifications.map((notif) => {
                        const ctx = icons[notif.type] || icons.system;
                        return (
                            <div
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className={`flex gap-4 relative group p-2 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer ${notif.read ? 'opacity-60' : ''}`}
                            >
                                {!notif.read && <div className="absolute left-0 top-3 w-1.5 h-1.5 bg-black rounded-full ring-4 ring-white" />}
                                <div className={`flex-shrink-0 h-10 w-10 rounded-xl ${ctx.bg} flex items-center justify-center border border-zinc-200`}>
                                    <ctx.icon className="h-5 w-5" style={{ color: ctx.color }} />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-zinc-850 text-sm font-semibold leading-none mb-1.5 group-hover:text-black transition-colors truncate w-full">{notif.title}</h4>
                                    <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2">{notif.message}</p>
                                    <span className="text-[10px] text-zinc-450 mt-2 block font-medium">{formatTimeAgo(notif.createdAt)}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
