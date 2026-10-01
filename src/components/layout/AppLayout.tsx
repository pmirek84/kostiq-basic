import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Navbar } from './Navbar';

const LoadingFallback = () => <div className="p-8 text-center text-gray-400">Ładowanie...</div>;

export const AppLayout = () => {
    // NOTE: seedDemoData() was removed — it was running on EVERY page load
    // and could overwrite production data. Demo seeding is now only available
    // via the Settings page button (DEV mode only).

    return (
        <div className="flex min-h-screen font-sans bg-gray-50 text-gray-800 relative">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 bg-gray-50 relative">
                <Navbar />
                <main className="flex-1 p-6 relative overflow-y-auto h-[calc(100vh-64px)]">
                    <div className="w-full max-w-full">
                        <Suspense fallback={<LoadingFallback />}>
                            <Outlet />
                        </Suspense>
                    </div>
                </main>
            </div>
        </div>
    );
};
