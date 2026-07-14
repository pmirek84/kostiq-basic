import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Check, X, Download } from 'lucide-react';
import { Button } from '../ui/Button';

interface ImportSectionProps {
    title: string;
    description?: string;
    onImport: (file: File) => Promise<void>;
    onDownloadTemplate?: () => void;
    accept?: string;
    loading?: boolean;
}

export default function ImportSection({ title, description, onImport, onDownloadTemplate, accept = ".json,.csv,.xlsx", loading = false }: ImportSectionProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [importStatus, setImportStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setImportStatus('idle');
            setErrorMessage('');
        }
    };

    const handleImportValues = async () => {
        if (!selectedFile) return;

        setImportStatus('uploading');
        try {
            await onImport(selectedFile);
            setImportStatus('success');
            setTimeout(() => {
                setImportStatus('idle');
                setSelectedFile(null);
            }, 3000);
        } catch (error: any) {
            console.error(error);
            setImportStatus('error');
            setErrorMessage(error.message || 'Wystąpił błąd podczas importu.');
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                        {description && <p className="text-sm text-gray-500">{description}</p>}
                    </div>
                </div>
                {onDownloadTemplate && (
                    <Button variant="secondary" onClick={onDownloadTemplate}>
                        <Download className="h-4 w-4 mr-2" />
                        Pobierz szablon
                    </Button>
                )}
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 bg-gray-50/50">
                {!selectedFile ? (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="text-center">
                            <p className="text-sm text-gray-500 font-medium">
                                Kliknij aby wybrać plik
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                Obsługiwane formaty: {accept}
                            </p>
                        </div>

                        <div>
                            <input
                                ref={inputRef}
                                type="file"
                                className="hidden"
                                accept={accept}
                                onChange={handleFileSelect}
                            />
                            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                                <Upload className="h-4 w-4 mr-2" />
                                Wybierz plik
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <FileSpreadsheet className="h-8 w-8 text-blue-600 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {selectedFile.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {(selectedFile.size / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                {importStatus === 'uploading' || loading ? (
                                    <Button disabled>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                        Importowanie...
                                    </Button>
                                ) : importStatus === 'success' ? (
                                    <Button className="bg-green-600 hover:bg-green-700 text-white cursor-default">
                                        <Check className="h-4 w-4 mr-2" />
                                        Zaimportowano
                                    </Button>
                                ) : importStatus === 'error' ? (
                                    <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleImportValues}>
                                        Spróbuj ponownie
                                    </Button>
                                ) : (
                                    <Button onClick={handleImportValues}>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Importuj
                                    </Button>
                                )}
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                                    disabled={importStatus === 'uploading' || loading}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        {errorMessage && (
                            <div className="mt-3 flex items-center space-x-2 text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
