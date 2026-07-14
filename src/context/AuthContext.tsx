import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'manager' | 'worker';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    login: async () => ({ success: false }),
    logout: () => { }
});

export function useAuth() {
    return useContext(AuthContext);
}

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        try {
            const saved = localStorage.getItem('kostiq_user');
            return saved ? JSON.parse(saved) : {
                id: 'admin-dev-id',
                email: 'admin@kostiq.pl',
                firstName: 'Paweł',
                lastName: 'Mirek',
                role: 'admin'
            };
        } catch {
            return {
                id: 'admin-dev-id',
                email: 'admin@kostiq.pl',
                firstName: 'Paweł',
                lastName: 'Mirek',
                role: 'admin'
            };
        }
    });
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('kostiq_token') || 'mocked-dev-token');
    const [isLoading, setIsLoading] = useState(true);

    // Auto-authenticated by default and fetches real JWT token silently from API
    useEffect(() => {
        const autoLogin = async () => {
            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'admin@kostiq.pl', password: 'pass' })
                });

                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('kostiq_token', data.token);
                    localStorage.setItem('kostiq_user', JSON.stringify(data.user));
                    setToken(data.token);
                    setUser(data.user);
                }
            } catch (err) {
                console.error("Auto login to acquire real backend JWT failed, using local/mocked credentials", err);
            } finally {
                setIsLoading(false);
            }
        };

        autoLogin();
    }, []);

    const login = async (email: string, password: string) => {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                return { success: false, error: data.error || 'Błąd logowania' };
            }

            // Web panel: only admin and manager can log in.
            if (data.user.role === 'worker' || data.user.role === 'foreman') {
                return { success: false, error: 'Brak uprawnień. Panel przeznaczony wyłącznie dla Administratorów i Menedżerów.' };
            }

            localStorage.setItem('kostiq_token', data.token);
            localStorage.setItem('kostiq_user', JSON.stringify(data.user));
            setToken(data.token);
            setUser(data.user);
            return { success: true };
        } catch {
            return { success: false, error: 'Nie można połączyć się z serwerem' };
        }
    };

    const logout = () => {
        // No-op to bypass login screen at this stage
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!user && !!token,
            isLoading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}
