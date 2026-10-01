import { useMemo, useState } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { useJobs } from '../../../context/JobsContext';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Download } from 'lucide-react';

export const ReportsView = () => {
    const { timeEntries, subcontractors, employees } = useTiCo();
    const { jobs } = useJobs();
    const [viewMode, setViewMode] = useState<'project' | 'category'>('project');

    // Build Sets of known subcontractor and employee IDs for reliable category classification
    const subIds = useMemo(() => new Set((subcontractors || []).map(s => s.id)), [subcontractors]);
    const empIds = useMemo(() => new Set((employees || []).map(e => e.id)), [employees]);

    // --- Analytics Data ---
    const data = useMemo(() => {
        // Group by Project
        const projectCosts = new Map<string, number>();
        jobs.forEach(j => projectCosts.set(j.id, 0));
        projectCosts.set('other', 0); // For entries without valid job reference or misc

        // Group by Category (Employee vs Subcontractor vs Unresolved)
        let empCost = 0;
        let subCost = 0;
        let unresolvedCost = 0;

        timeEntries.forEach(entry => {
            const cost = entry.cost || (entry.hours * (entry.rate || 0));

            // Project Aggregation
            if (entry.jobId && projectCosts.has(entry.jobId)) {
                projectCosts.set(entry.jobId, projectCosts.get(entry.jobId)! + cost);
            } else {
                projectCosts.set('other', projectCosts.get('other')! + cost);
            }

            // Category Aggregation: authoritative workerType with fallback to sub/emp IDs and explicit legacy type
            const isSub = entry.workerType === 'subcontractor'
                || (!entry.workerType && (subIds.has(entry.employeeId) || entry.type === 'subcontractor'));
            const isEmp = entry.workerType === 'employee'
                || (!entry.workerType && (empIds.has(entry.employeeId) || entry.type === 'employee'));

            if (isSub) {
                subCost += cost;
            } else if (isEmp) {
                empCost += cost;
            } else {
                unresolvedCost += cost;
            }
        });

        // Format for Chart - Projects
        const projectChartData = Array.from(projectCosts.entries())
            .map(([jobId, cost]) => {
                const job = jobs.find(j => j.id === jobId);
                return {
                    name: job ? job.name : (jobId === 'other' ? 'Inne/Bez zlecenia' : jobId),
                    value: cost
                };
            })
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);

        // Format for Chart - Category
        const categoryChartData = [
            { name: 'Pracownicy', value: empCost },
            { name: 'Podwykonawcy', value: subCost }
        ];
        if (unresolvedCost > 0) {
            categoryChartData.push({ name: 'Nierozpoznane', value: unresolvedCost });
        }

        return { projectChartData, categoryChartData, totalCost: empCost + subCost + unresolvedCost };
    }, [timeEntries, jobs, subIds, empIds]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

    // CSV Export
    const downloadCSV = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownload = () => {
        if (viewMode === 'project') {
            const headers = 'Zlecenie,Koszt (PLN)\n';
            const rows = data.projectChartData.map(r => `${r.name},${r.value}`).join('\n');
            downloadCSV(headers + rows, `raport-zlecen.csv`);
        } else {
            const headers = 'Typ zasobu,Koszt (PLN)\n';
            const rows = data.categoryChartData.map(r => `${r.name},${r.value}`).join('\n');
            downloadCSV(headers + rows, `raport-zasobow.csv`);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Analiza Kosztów</h3>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleDownload}
                            className="text-sm text-gray-600 hover:text-indigo-600 font-medium flex items-center transition-colors"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Pobierz CSV
                        </button>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('project')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'project' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                            >
                                Wg Zleceń
                            </button>
                            <button
                                onClick={() => setViewMode('category')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'category' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                            >
                                Wg Typu Zasobu
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Chart Section */}
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            {viewMode === 'project' ? (
                                <BarChart data={data.projectChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                                    <Tooltip formatter={(value: any) => `${Number(value).toLocaleString()} PLN`} />
                                    <Bar dataKey="value" fill="#4F46E5" radius={[0, 4, 4, 0]}>
                                        {data.projectChartData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            ) : (
                                <PieChart>
                                    <Pie
                                        data={data.categoryChartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {data.categoryChartData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#4F46E5' : '#10B981'} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any) => `${Number(value).toLocaleString()} PLN`} />
                                </PieChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    {/* Summary List */}
                    <div className="overflow-y-auto max-h-[300px] pr-2">
                        <h4 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">Szczegóły</h4>
                        <div className="space-y-3">
                            {(viewMode === 'project' ? data.projectChartData : data.categoryChartData).map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <span className="text-sm font-medium text-gray-700">{item.name}</span>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-gray-900">{item.value.toLocaleString()} PLN</div>
                                        <div className="text-xs text-gray-400">{((item.value / data.totalCost) * 100).toFixed(1)}% całości</div>
                                    </div>
                                </div>
                            ))}
                            <div className="pt-4 mt-2 border-t border-gray-200 flex justify-between items-center">
                                <span className="font-bold text-gray-900">SUMA</span>
                                <span className="font-bold text-indigo-600 text-lg">{data.totalCost.toLocaleString()} PLN</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
