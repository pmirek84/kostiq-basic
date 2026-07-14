import { useState } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { Mail, Bell, Send, User, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const CommunicationView = () => {
    const { messages, sendMessage, employees } = useTiCo();
    const [subTab, setSubTab] = useState<'inbox' | 'memo' | 'new'>('inbox');
    const [newMessage, setNewMessage] = useState<{ toId: string; subject: string; content: string; type: 'message' | 'memo' }>({ toId: 'all', subject: '', content: '', type: 'message' });

    const myId = 'system'; // Simulating current user (manager)

    const filteredMessages = messages.filter(m => {
        if (subTab === 'inbox') return m.type === 'message' && (m.toId === myId || m.fromId === myId); // Show conversation
        if (subTab === 'memo') return m.type === 'memo';
        return false;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const handleSend = () => {
        if (!newMessage.content || !newMessage.subject) return;
        sendMessage({
            fromId: myId,
            toId: newMessage.type === 'memo' ? 'all' : newMessage.toId,
            subject: newMessage.subject,
            content: newMessage.content,
            type: newMessage.type
        });
        setNewMessage({ toId: 'all', subject: '', content: '', type: 'message' });
        setSubTab(newMessage.type === 'memo' ? 'memo' : 'inbox');
    };

    const getPersonName = (id: string) => {
        if (id === 'all') return 'Wszyscy';
        if (id === 'system') return 'System / Kierownik';
        const emp = employees.find(e => e.id === id);
        return emp ? `${emp.firstName} ${emp.lastName}` : 'Nieznany';
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
            {/* Sidebar */}
            <div className="md:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
                <button
                    onClick={() => setSubTab('new')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${subTab === 'new' ? 'bg-blue-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                    <Send className="w-4 h-4" />
                    Nowa Wiadomość
                </button>
                <div className="h-px bg-gray-100 my-2"></div>
                <button
                    onClick={() => setSubTab('inbox')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${subTab === 'inbox' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                    <Mail className="w-4 h-4" />
                    Skrzynka odbiorcza
                </button>
                <button
                    onClick={() => setSubTab('memo')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${subTab === 'memo' ? 'bg-yellow-50 text-yellow-700' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                    <Bell className="w-4 h-4" />
                    Tablica Ogłoszeń (Memo)
                </button>
            </div>

            {/* Content */}
            <div className="md:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-y-auto">
                {subTab === 'new' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        <h3 className="text-lg font-bold text-gray-800">Nowa Wiadomość</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Typ wiadomości</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={newMessage.type === 'message'}
                                            onChange={() => setNewMessage({ ...newMessage, type: 'message' })}
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm">Prywatna wiadomość</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            checked={newMessage.type === 'memo'}
                                            onChange={() => setNewMessage({ ...newMessage, type: 'memo' })}
                                            className="text-yellow-600 focus:ring-yellow-500"
                                        />
                                        <span className="text-sm">Ogłoszenie (Memo)</span>
                                    </label>
                                </div>
                            </div>

                            {newMessage.type === 'message' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Odbiorca</label>
                                    <select
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        value={newMessage.toId}
                                        onChange={e => setNewMessage({ ...newMessage, toId: e.target.value })}
                                    >
                                        <option value="all">Wszyscy (Grupowa)</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Temat</label>
                                <input
                                    type="text"
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    placeholder="Temat wiadomości..."
                                    value={newMessage.subject}
                                    onChange={e => setNewMessage({ ...newMessage, subject: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Treść</label>
                                <textarea
                                    rows={6}
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    placeholder="Wpisz treść wiadomości..."
                                    value={newMessage.content}
                                    onChange={e => setNewMessage({ ...newMessage, content: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleSend}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2"
                                >
                                    <Send className="w-4 h-4" />
                                    Wyślij
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {(subTab === 'inbox' || subTab === 'memo') && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">
                            {subTab === 'inbox' ? 'Skrzynka odbiorcza' : 'Tablica Ogłoszeń'}
                        </h3>

                        {filteredMessages.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 italic">Brak wiadomości.</div>
                        ) : (
                            <div className="space-y-3">
                                {filteredMessages.map(msg => (
                                    <div key={msg.id} className={`border rounded-lg p-4 transition-shadow hover:shadow-md ${msg.read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-100'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-2 rounded-full ${msg.type === 'memo' ? 'bg-yellow-100 text-yellow-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                    {msg.type === 'memo' ? <Bell className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">{msg.subject}</div>
                                                    <div className="text-xs text-gray-500">
                                                        Od: {getPersonName(msg.fromId)} {msg.type === 'message' && `→ Do: ${getPersonName(msg.toId)}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {format(parseISO(msg.createdAt), 'dd.MM HH:mm')}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-700 whitespace-pre-line pl-10">
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
