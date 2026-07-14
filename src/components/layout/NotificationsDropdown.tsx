import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Briefcase, AlertCircle, Smartphone, Check, CheckCheck, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification } from '../../models/dashboard';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function NotificationsDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch Real Notifications
    const fetchNotifs = useCallback(() => {
        const token = localStorage.getItem('kostiq_token');
        if (!token) return;
        fetch(`${API_BASE}/notifications`, { headers: getAuthHeaders() })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const sorted = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    setNotifications(sorted.slice(0, 20));
                }
            })
            .catch(err => console.error('Failed to fetch notifications', err));
    }, []);

    useEffect(() => {
        fetchNotifs();
        const interval = setInterval(fetchNotifs, 15000);
        return () => clearInterval(interval);
    }, [fetchNotifs]);

    // Mark single notification as read or unread
    const markAsRead = useCallback(async (id: string, read: boolean) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read } : n));
        try {
            await fetch(`${API_BASE}/notifications/${id}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({ read })
            });
        } catch (e) {
            console.error('Failed to update notification', e);
            fetchNotifs(); // Revert on error
        }
    }, [fetchNotifs]);

    // Mark all unread notifications as read
    const markAllAsRead = useCallback(async () => {
        const unread = notifications.filter(n => !n.read);
        if (unread.length === 0) return;

        // Optimistic update
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));

        try {
            await Promise.all(unread.map(n =>
                fetch(`${API_BASE}/notifications/${n.id}`, {
                    method: 'PATCH',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ read: true })
                })
            ));
        } catch (e) {
            console.error('Failed to mark all as read', e);
            fetchNotifs();
        }
    }, [notifications, fetchNotifs]);

    const icons: Record<string, any> = {
        offer_waiting: { icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
        job_delay: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100' },
        new_client: { icon: Briefcase, color: 'text-emerald-600', bg: 'bg-emerald-100' },
        site_log: { icon: Smartphone, color: 'text-orange-600', bg: 'bg-orange-100' },
        extra_work: { icon: AlertCircle, color: 'text-purple-600', bg: 'bg-purple-100' },
        request: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-100' },
        advance: { icon: AlertCircle, color: 'text-emerald-600', bg: 'bg-emerald-100' },
        dayoff: { icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
        offer_rejected: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
        invoice_overdue: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
        message: { icon: AlertCircle, color: 'text-indigo-600', bg: 'bg-indigo-100' },
        system: { icon: AlertCircle, color: 'text-slate-600', bg: 'bg-slate-100' },
    };

    const handleNotificationClick = async (notif: AppNotification) => {
        // Mark as read when clicking
        if (!notif.read) await markAsRead(notif.id, true);
        setIsOpen(false);

        const jobId = notif.relatedEntityType === 'job' ? notif.relatedEntityId : undefined;
        if (jobId) {
            let tab = 'summary';
            if (notif.type === 'site_log') tab = 'diary';
            navigate(`/jobs/${jobId}?tab=${tab}`);
            return;
        }

        switch (notif.type) {
            case 'offer_waiting':
            case 'offer_rejected':
                navigate('/offers');
                break;
            case 'new_client':
                navigate('/clients');
                break;
            case 'job_delay':
                navigate('/jobs');
                break;
            case 'invoice_overdue':
                navigate('/finance'); // or invoices tab
                break;
            default:
                navigate('/dashboard');
                break;
        }
    };

    const formatTimeAgo = (dateStr: string) => {
        const diffInSeconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diffInSeconds < 60) return 'przed chwilą';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min. temu`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} godz. temu`;
        return `${Math.floor(diffInSeconds / 86400)} dni temu`;
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-full text-slate-400 hover:text-teal-600 hover:bg-slate-100 relative transition-colors"
                title="Powiadomienia"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-88 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right" style={{ width: '340px' }}>
                    {/* Header */}
                    <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900 text-sm">Powiadomienia</h3>
                            {unreadCount > 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 ? (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                                title="Oznacz wszystkie jako przeczytane"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                Oznacz wszystkie
                            </button>
                        ) : (
                            <span className="text-xs text-gray-400">Wszystkie przeczytane</span>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">
                                Brak powiadomień
                            </div>
                        ) : (
                            notifications.map((notif) => {
                                const ctx = icons[notif.type] || icons.system;
                                return (
                                    <div
                                        key={notif.id}
                                        className={`px-4 py-3 flex gap-3 border-b border-gray-50 last:border-0 transition-colors group
                                            ${notif.read ? 'bg-white hover:bg-gray-50 opacity-70' : 'bg-blue-50/40 hover:bg-blue-50/70'}`}
                                    >
                                        {/* Icon */}
                                        <div
                                            className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg ${ctx.bg} flex items-center justify-center cursor-pointer`}
                                            onClick={() => handleNotificationClick(notif)}
                                        >
                                            <ctx.icon className={`w-4 h-4 ${ctx.color}`} />
                                        </div>

                                        {/* Content */}
                                        <div
                                            className="flex-1 min-w-0 cursor-pointer"
                                            onClick={() => handleNotificationClick(notif)}
                                        >
                                            <div className="flex justify-between items-start mb-0.5">
                                                <p className={`text-sm truncate pr-2 ${notif.read ? 'font-normal text-gray-700' : 'font-semibold text-gray-900'}`}>
                                                    {notif.title}
                                                </p>
                                                {!notif.read && (
                                                    <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2 mb-1">{notif.message}</p>
                                            <p className="text-[10px] text-gray-400">{formatTimeAgo(notif.createdAt)}</p>
                                        </div>

                                        {/* Toggle read/unread button — visible on hover */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); markAsRead(notif.id, !notif.read); }}
                                            className="flex-shrink-0 self-center p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200"
                                            title={notif.read ? 'Oznacz jako nieprzeczytane' : 'Oznacz jako przeczytane'}
                                        >
                                            {notif.read
                                                ? <Circle className="w-3.5 h-3.5 text-gray-400" />
                                                : <Check className="w-3.5 h-3.5 text-blue-500" />
                                            }
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
