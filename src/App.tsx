import { lazy, type ReactNode, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';

// Context Providers
import { AuthProvider, useAuth } from './context/AuthContext';
import { JobsProvider } from './context/JobsContext';
import { OffersProvider } from './context/OffersContext';

import { ClientsProvider } from './context/ClientsContext';
import { ThemeProvider } from './context/ThemeContext';
import { CalendarProvider } from './context/CalendarContext';
import { TiCoProvider } from './context/TiCoContext';
import { JobLogProvider } from './context/JobLogContext';
import { ClientReportsProvider } from './context/ClientReportsContext';
import { TimeTrackingProvider } from './context/TimeTrackingContext';
import { AppLayout } from './components/layout/AppLayout';
import { ToasterProvider } from './components/ui/ToasterProvider';

// Auth
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Lazy load pages
const Dashboard = lazy(() => import('./components/Dashboard'));
const OffersPage = lazy(() => import('./pages/OffersPage'));
const OfferTemplatesPage = lazy(() => import('./pages/OfferTemplatesPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const JobDetailsPage = lazy(() => import('./pages/JobDetailsPage'));
const NewJobPage = lazy(() => import('./pages/NewJobPage'));
const CostBasePage = lazy(() => import('./pages/CostBasePage'));
const StandardsPage = lazy(() => import('./pages/StandardsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const InvoiceDetailsPage = lazy(() => import('./pages/InvoiceDetailsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const ImportExportPage = lazy(() => import('./pages/ImportExportPage'));
const ReportsDashboard = lazy(() => import('./pages/ReportsDashboard'));
const GlobalDiaryPage = lazy(() => import('./pages/GlobalDiaryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const TiCoPage = lazy(() => import('./pages/tico/TiCoPage'));
import { EditReportView } from './components/jobs/reports/EditReportView';

import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { SubcontractorContractsProvider } from './context/SubcontractorContractsContext';

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Ładowanie...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Brak uprawnień</h2>
          <p className="text-slate-600 mb-8">
            Dostęp zastrzeżony. Widok biurowy jest dostępny wyłącznie dla Administratorów i Menedżerów.
          </p>
          <button
            onClick={() => window.location.replace('/login')}
            className="w-full py-3 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-colors"
          >
            Wyloguj i zmień konto
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
        <ToasterProvider />
        <ErrorBoundary>
          <AuthProvider>
            <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-teal-500 border-t-transparent rounded-full" /></div>}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={
                  <ProtectedRoute>
                    <ThemeProvider>
                      <ClientsProvider>
                        <OffersProvider>
                          <JobsProvider>
                            <TiCoProvider>
                              <SubcontractorContractsProvider>
                                <JobLogProvider>
                                  <ClientReportsProvider>
                                    <CalendarProvider>
                                      <TimeTrackingProvider>
                                        <AppLayout />
                                      </TimeTrackingProvider>
                                    </CalendarProvider>
                                  </ClientReportsProvider>
                                </JobLogProvider>
                              </SubcontractorContractsProvider>
                            </TiCoProvider>
                          </JobsProvider>
                        </OffersProvider>
                      </ClientsProvider>
                    </ThemeProvider>
                  </ProtectedRoute>
                }>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <Dashboard />
                    </ProtectedRoute>
                  } />

                  <Route path="/clients" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <ClientsPage />
                    </ProtectedRoute>
                  } />

                  <Route path="/jobs" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <JobsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/jobs/new" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <NewJobPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/jobs/:id" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <JobDetailsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/jobs/:id/reports/:reportId" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <EditReportView />
                    </ProtectedRoute>
                  } />

                  <Route path="/offers" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <OffersPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/offers/:id" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <OffersPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/offer-templates" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <OfferTemplatesPage />
                    </ProtectedRoute>
                  } />

                  <Route path="/orders" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <OrdersPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/orders/:id" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <InvoiceDetailsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/calendar" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <CalendarPage />
                    </ProtectedRoute>
                  } />

                  <Route path="/import-time" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <ImportExportPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/cost-base" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <CostBasePage />
                    </ProtectedRoute>
                  } />
                  <Route path="/standards" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <StandardsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/settings" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <SettingsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/tico" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <TiCoPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/reports" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <ReportsDashboard />
                    </ProtectedRoute>
                  } />

                  <Route path="/diary" element={
                    <ProtectedRoute allowedRoles={['admin', 'manager']}>
                      <GlobalDiaryPage />
                    </ProtectedRoute>
                  } />

                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </ErrorBoundary>
      </LocalizationProvider>
    </BrowserRouter>
  );
}



export default App;
