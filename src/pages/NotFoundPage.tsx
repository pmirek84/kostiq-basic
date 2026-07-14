import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export default function NotFoundPage() {
    return (
        <div className="min-h-[70vh] flex items-center justify-center p-8">
            <div className="text-center max-w-md">
                <div className="mb-6 flex justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                        <AlertTriangle className="w-10 h-10 text-amber-500" />
                    </div>
                </div>

                <h1 className="text-6xl font-bold text-gray-200 mb-2">404</h1>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Strona nie znaleziona</h2>
                <p className="text-gray-500 mb-8">
                    Strona, której szukasz, nie istnieje lub została przeniesiona.
                    Sprawdź adres URL lub wróć do panelu głównego.
                </p>

                <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Home className="w-5 h-5" />
                    Wróć do Dashboardu
                </Link>

                <p className="mt-6 text-xs text-gray-400">
                    Jeśli problem się powtarza, skontaktuj się z administratorem.
                </p>
            </div>
        </div>
    );
}
