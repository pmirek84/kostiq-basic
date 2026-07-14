import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(
    ArcElement,
    Tooltip,
    Legend
);

// --- PipelineChart ---
export function PipelineChart() {

    // Mock data for now
    const acceptanceRate = 65;

    // Data definition
    const labels = ['Oczekujące', 'Negocjacje', 'Zatwierdzone', 'Odrzucone'];
    const colors = {
        light: ['#3B82F6', '#F59E0B', '#10B981', '#EF4444'],
        hover: ['#2563EB', '#D97706', '#059669', '#DC2626']
    };

    const data = {
        labels: labels,
        datasets: [
            {
                label: 'Ilość ofert',
                data: [12, 5, 8, 3],
                backgroundColor: colors.light,
                hoverBackgroundColor: colors.hover,
                borderColor: '#FFFFFF',
                borderWidth: 3,
                borderRadius: 4,
                spacing: 2,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: 0
        },
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                position: 'nearest' as const,
                yAlign: 'bottom' as const,
                backgroundColor: '#FFFFFF',
                titleColor: '#111827',
                titleFont: { size: 13, weight: 'bold' as const, family: 'Inter, sans-serif' },
                bodyColor: '#4B5563',
                bodyFont: { size: 12, family: 'Inter, sans-serif' },
                borderColor: '#E5E7EB',
                borderWidth: 1,
                padding: 14,
                cornerRadius: 10,
                displayColors: true,
                usePointStyle: true,
                boxPadding: 6,
                caretSize: 8,
            }
        },
        cutout: '85%',
    };

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col shadow-sm">
            <h3 className="text-zinc-900 font-semibold mb-2 text-base tracking-tight">Lejek sprzedaży</h3>

            <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                {/* Chart Container */}
                <div className="relative h-[160px] w-[160px]">
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                        <span className="text-3xl font-bold text-zinc-900 leading-none">{acceptanceRate}%</span>
                        <span className="text-[10px] text-zinc-400 font-medium mt-1">Akceptacja</span>
                    </div>
                    <Doughnut options={options as any} data={data} />
                </div>

                {/* Custom Legend */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-6">
                    {labels.map((label, index) => (
                        <div key={label} className="flex items-center gap-1.5">
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: colors.light[index] }}
                            />
                            <span className="text-xs text-zinc-500 font-medium">
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
