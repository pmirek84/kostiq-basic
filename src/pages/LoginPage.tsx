import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Redirect if already logged in
    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const result = await login(email, password);

        if (!result.success) {
            setError(result.error || 'Błąd logowania');
        } else {
            navigate('/dashboard', { replace: true });
        }

        setIsSubmitting(false);
    };

    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
            {/* Background glow effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00E5FF]/5 rounded-full blur-[128px]" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00E5FF]/3 rounded-full blur-[128px]" />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo — same as Mobile */}
                <div className="text-center mb-10">
                    <img
                        src="/kostiq-logo.png"
                        alt="KOSTIQ"
                        className="h-20 mx-auto mb-3"
                    />
                    <p className="text-[#00E5FF] text-sm font-semibold tracking-[0.3em] uppercase">
                        WEB
                    </p>
                    <p className="text-gray-600 text-xs mt-1">
                        Logowanie do systemu
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-[#0A0A0A] border border-gray-800/50 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
                    <h2 className="text-xl font-semibold text-white mb-1">Logowanie</h2>
                    <p className="text-gray-500 text-sm mb-8">Wprowadź dane aby uzyskać dostęp do panelu</p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                                Email / Login
                            </label>
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-[#111111] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 
                                           focus:outline-none focus:border-[#00E5FF]/50 focus:ring-1 focus:ring-[#00E5FF]/20 transition-all"
                                placeholder="admin@kostiq.pl"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                                Hasło
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#111111] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 
                                           focus:outline-none focus:border-[#00E5FF]/50 focus:ring-1 focus:ring-[#00E5FF]/20 transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-[#00E5FF] hover:bg-[#00C4D9] text-[#050505] font-bold py-3 px-4 rounded-xl 
                                       transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                                       shadow-lg shadow-[#00E5FF]/10 hover:shadow-[#00E5FF]/20"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Logowanie...
                                </span>
                            ) : 'Zaloguj się'}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-gray-800/50">
                        <p className="text-gray-600 text-xs text-center">
                            Pracownicy logują się przez{' '}
                            <span className="text-[#00E5FF]/60 font-medium">system TiCo</span>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-700 text-xs mt-8">
                    &copy; {new Date().getFullYear()} KOSTIQ · v2.0
                </p>
            </div>
        </div>
    );
}
