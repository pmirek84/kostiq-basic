import { useState, useCallback, useRef, useEffect } from 'react';
import { Responsive as _Responsive } from 'react-grid-layout';
const Responsive = _Responsive as any;
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import KpiStrip from './dashboard/KpiStrip';
import { TodayJobs } from './dashboard/OperationalWidgets';
import QuickActions from './dashboard/QuickActions';
import { FinancialChart } from './dashboard/FinancialChart';
import { PipelineChart } from './dashboard/PipelineChart';
import { WorkloadWidget, EmployeePerformanceWidget, RiskJobsWidget } from './dashboard/AnalyticsWidgets';
import ActivityTimeline from './dashboard/ActivityTimeline';

function useContainerWidth() {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(1200);
    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        ro.observe(ref.current);
        setWidth(ref.current.offsetWidth);
        return () => ro.disconnect();
    }, []);
    return { ref, width };
}

const STORAGE_KEY = 'kostiq-dashboard-layout-v2';

// Default layout (12-column grid)
const defaultLayouts = {
    lg: [
        { i: 'finance', x: 0, y: 0, w: 8, h: 7, minW: 4, minH: 5 },
        { i: 'todayJobs', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
        { i: 'pipeline', x: 8, y: 4, w: 4, h: 3.5, minW: 3, minH: 3 },
        { i: 'workload', x: 0, y: 7, w: 6, h: 5.5, minW: 3, minH: 4 },
        { i: 'performance', x: 6, y: 7, w: 6, h: 5.5, minW: 3, minH: 4 },
        { i: 'risks', x: 0, y: 13, w: 6, h: 6, minW: 3, minH: 4 },
        { i: 'activity', x: 6, y: 13, w: 6, h: 6, minW: 3, minH: 4 },
    ],
    md: [
        { i: 'finance', x: 0, y: 0, w: 6, h: 7, minW: 4, minH: 5 },
        { i: 'todayJobs', x: 6, y: 0, w: 4, h: 4.5, minW: 3, minH: 3 },
        { i: 'pipeline', x: 6, y: 4, w: 4, h: 3.5, minW: 3, minH: 3 },
        { i: 'workload', x: 0, y: 7, w: 5, h: 5.5, minW: 3, minH: 4 },
        { i: 'performance', x: 5, y: 7, w: 5, h: 5.5, minW: 3, minH: 4 },
        { i: 'risks', x: 0, y: 13, w: 5, h: 6, minW: 3, minH: 4 },
        { i: 'activity', x: 5, y: 13, w: 5, h: 6, minW: 3, minH: 4 },
    ],
    sm: [
        { i: 'finance', x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 5 },
        { i: 'todayJobs', x: 0, y: 7, w: 6, h: 5, minW: 3, minH: 3 },
        { i: 'pipeline', x: 0, y: 11, w: 6, h: 4, minW: 3, minH: 3 },
        { i: 'workload', x: 0, y: 15, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'performance', x: 0, y: 20, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'risks', x: 0, y: 25, w: 6, h: 6, minW: 3, minH: 4 },
        { i: 'activity', x: 0, y: 31, w: 6, h: 6, minW: 3, minH: 4 },
    ],
};

function loadLayouts(): typeof defaultLayouts | null {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

export default function Dashboard() {
    const [layouts, setLayouts] = useState(() => loadLayouts() || defaultLayouts);
    const { ref: gridRef, width: gridWidth } = useContainerWidth();

    const onLayoutChange = useCallback((_layout: any, allLayouts: any) => {
        setLayouts(allLayouts);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allLayouts));
        } catch { /* ignore */ }
    }, []);

    const resetLayout = useCallback(() => {
        setLayouts(defaultLayouts);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return (
        <div className="space-y-6 p-1">
            {/* Row 1: Quick Actions bar (static — not draggable) */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-950 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-[#21808D] rounded-full"></span>
                    Szybkie akcje
                </h2>
                <div className="flex items-center gap-3">
                    <button
                        onClick={resetLayout}
                        className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                        title="Resetuj układ"
                    >
                        ↺ Resetuj układ
                    </button>
                    <QuickActions variant="header" />
                </div>
            </div>

            {/* Row 2: KPI Strip (static) */}
            <KpiStrip />

            {/* Draggable grid */}
            <div ref={gridRef}>
                {/* @ts-ignore - react-grid-layout types incomplete */}
                <Responsive
                    className="dashboard-grid"
                    width={gridWidth}
                    layouts={layouts}
                    breakpoints={{ lg: 1200, md: 996, sm: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6 }}
                    rowHeight={60}
                    onLayoutChange={onLayoutChange}
                    isDraggable={true}
                    isResizable={true}
                    draggableHandle=".drag-handle"
                    compactType="vertical"
                    margin={[20, 20] as [number, number]}
                    containerPadding={[0, 0] as [number, number]}
                >
                    <div key="finance">
                        <WidgetWrapper title="Finanse">
                            <FinancialChart />
                        </WidgetWrapper>
                    </div>
                    <div key="todayJobs">
                        <WidgetWrapper title="Dzisiejsze zlecenia">
                            <TodayJobs />
                        </WidgetWrapper>
                    </div>
                    <div key="pipeline">
                        <WidgetWrapper title="Lejek sprzedaży">
                            <PipelineChart />
                        </WidgetWrapper>
                    </div>
                    <div key="workload">
                        <WidgetWrapper title="Obłożenie ekip">
                            <WorkloadWidget />
                        </WidgetWrapper>
                    </div>
                    <div key="performance">
                        <WidgetWrapper title="Wydajność">
                            <EmployeePerformanceWidget />
                        </WidgetWrapper>
                    </div>
                    <div key="risks">
                        <WidgetWrapper title="Zlecenia ryzykowne">
                            <RiskJobsWidget />
                        </WidgetWrapper>
                    </div>
                    <div key="activity">
                        <WidgetWrapper title="Aktywność">
                            <ActivityTimeline />
                        </WidgetWrapper>
                    </div>
                </Responsive>
            </div>
        </div>
    );
}

// Transparent wrapper with drag handle
function WidgetWrapper({ children, title }: { children: React.ReactNode; title: string }) {
    return (
        <div className="h-full w-full relative group/widget">
            {/* Drag handle — visible on hover */}
            <div className="drag-handle absolute top-0 left-0 right-0 h-8 z-20 cursor-grab active:cursor-grabbing flex items-center justify-center opacity-0 group-hover/widget:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-1 shadow-sm">
                    <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-400">
                        <circle cx="3" cy="3" r="1.2" fill="currentColor" />
                        <circle cx="9" cy="3" r="1.2" fill="currentColor" />
                        <circle cx="3" cy="9" r="1.2" fill="currentColor" />
                        <circle cx="9" cy="9" r="1.2" fill="currentColor" />
                    </svg>
                    <span className="text-[10px] text-slate-400 font-medium">{title}</span>
                </div>
            </div>
            <div className="h-full w-full overflow-hidden rounded-2xl">
                {children}
            </div>
        </div>
    );
}
