import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface CostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => void;
    title: string;
    initialData?: any;
    fields: {
        name: string;
        label: string;
        type: string;
        options?: string[];
        required?: boolean;
    }[];
    error?: string | null;
    children?: React.ReactNode;
}

export default function CostModal({
    isOpen,
    onClose,
    onSubmit,
    title,
    initialData,
    fields,
    error,
    children
}: CostModalProps) {
    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data: Record<string, any> = {};

        fields.forEach(field => {
            const value = formData.get(field.name);
            if (field.type === 'number') {
                data[field.name] = value ? parseFloat(value.toString()) : 0;
            } else {
                data[field.name] = value || '';
            }
        });

        console.log('Dane z formularza:', data);
        onSubmit(data);
    };

    return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-2xl p-6 border border-gray-200 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full"
                    >
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {fields.map((field) => (
                        <div key={field.name}>
                            <label
                                htmlFor={field.name}
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                {field.label}
                            </label>
                            {field.type === 'select' ? (
                                <select
                                    id={field.name}
                                    name={field.name}
                                    defaultValue={initialData?.[field.name] || ''}
                                    required={field.required}
                                    className="w-full rounded-md border border-gray-300 bg-white text-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#21808D]"
                                >
                                    <option value="">Wybierz...</option>
                                    {field.options?.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type={field.type}
                                    id={field.name}
                                    name={field.name}
                                    defaultValue={initialData?.[field.name] || ''}
                                    required={field.required}
                                    min={field.type === 'number' ? 0 : undefined}
                                    step={field.type === 'number' ? 'any' : undefined}
                                    className="w-full rounded-md border border-gray-300 bg-white text-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#21808D]"
                                />
                            )}
                        </div>
                    ))}

                    {children}

                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-[#21808D] rounded-lg hover:bg-[#1a646e]"
                        >
                            Zapisz
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
