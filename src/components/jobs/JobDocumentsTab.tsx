import { useState, useRef } from 'react';
import type { Job } from '../../models/types';
import { useJobs } from '../../context/JobsContext';
import { FileText, Download, Image as ImageIcon, Plus, Upload, Trash2, Loader2 } from 'lucide-react';

interface JobDocumentsTabProps {
    job: Job;
}

export const JobDocumentsTab = ({ job }: JobDocumentsTabProps) => {
    const { updateJob } = useJobs();
    const documents = job.documents || [];
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadError(null);
        try {
            const token = localStorage.getItem('kostiq_token');
            const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const formData = new FormData();
            formData.append('file', file);
            formData.append('projectId', job.id);

            const res = await fetch(`${base}/documents/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
            const doc = await res.json();

            // Optimistic UI update
            const updatedDocs = [...documents, {
                id: doc.id,
                name: doc.name,
                type: doc.type,
                url: doc.url,
                uploadedAt: doc.uploadedAt
            }];
            updateJob(job.id, { documents: updatedDocs });
        } catch (err) {
            console.error('[UPLOAD] Error:', err);
            setUploadError('Nie można wgrać pliku. Sprawdź czy backend jest uruchomiony i obsługuje endpoint /documents/upload.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = (docId: string) => {
        if (!window.confirm('Usunąć ten dokument?')) return;
        const updatedDocs = documents.filter(d => d.id !== docId);
        updateJob(job.id, { documents: updatedDocs });
    };

    const getDownloadUrl = (url: string) => {
        if (url.startsWith('http')) return url;
        const base = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
        return `${base}${url}`;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Dokumenty i Zdjęcia</h3>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="btn btn-secondary flex items-center text-sm"
                >
                    {uploading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Wgrywanie...</>
                    ) : (
                        <><Plus className="w-4 h-4 mr-2" /> Dodaj plik</>
                    )}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleUpload}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.csv,.dwg,.dxf,.zip"
                />
            </div>

            {uploadError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                    <FileText className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-red-800">Błąd wgrywania pliku</p>
                        <p className="text-xs text-red-600 mt-0.5">{uploadError}</p>
                    </div>
                    <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {documents.length > 0 ? (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-6 py-3 font-medium">Nazwa pliku</th>
                                <th className="px-6 py-3 font-medium">Typ</th>
                                <th className="px-6 py-3 font-medium">Data dodania</th>
                                <th className="px-6 py-3 font-medium text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {documents.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 flex items-center gap-3">
                                        {doc.type === 'photo' ? (
                                            <ImageIcon className="w-5 h-5 text-blue-500" />
                                        ) : (
                                            <FileText className="w-5 h-5 text-gray-500" />
                                        )}
                                        <span className="font-medium text-gray-900">{doc.name}</span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {doc.type === 'contract' ? 'Umowa' :
                                            doc.type === 'protocol' ? 'Protokół' :
                                                doc.type === 'photo' ? 'Zdjęcie' : 'Dokument'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('pl-PL') : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <a
                                                href={getDownloadUrl(doc.url || '#')}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                            >
                                                <Download className="w-4 h-4" />
                                                <span className="text-xs">Pobierz</span>
                                            </a>
                                            <button
                                                onClick={() => handleDelete(doc.id)}
                                                className="text-red-500 hover:text-red-700 p-1"
                                                title="Usuń"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-12 text-center text-gray-500">
                        <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">Brak dokumentów</p>
                        <p className="text-sm mt-1">Kliknij "Dodaj plik" aby wgrać pierwszy dokument.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
