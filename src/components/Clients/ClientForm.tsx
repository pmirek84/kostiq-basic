import React, { useState, useEffect } from 'react';
import { Users2, Save, X, Building2, User } from 'lucide-react';
import type { Client } from '../../models/types';

interface ClientFormProps {
    client?: Client | null;
    onSubmit: (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    onCancel: () => void;
}

interface FieldErrors {
    name?: string;
    lastName?: string;
    company?: string;
    nip?: string;
    email?: string;
    phone?: string;
}

export default function ClientForm({ client, onSubmit, onCancel }: ClientFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [clientType, setClientType] = useState<'company' | 'individual'>(client?.type || 'individual');

    // Clear company fields when switching to individual
    useEffect(() => {
        if (clientType === 'individual') {
            setFieldErrors(prev => ({ ...prev, company: undefined, nip: undefined }));
        } else {
            setFieldErrors(prev => ({ ...prev, name: undefined, lastName: undefined }));
        }
    }, [clientType]);

    const isCompany = clientType === 'company';

    const validate = (formData: FormData): FieldErrors => {
        const errors: FieldErrors = {};
        const name = (formData.get('name') as string)?.trim();
        const lastName = (formData.get('lastName') as string)?.trim();
        const company = (formData.get('company') as string)?.trim();
        const nip = (formData.get('nip') as string)?.trim();
        const email = (formData.get('email') as string)?.trim();
        const phone = (formData.get('phone') as string)?.trim();

        if (isCompany) {
            if (!company) errors.company = 'Nazwa firmy jest wymagana dla typu "Firma"';
            if (!nip) errors.nip = 'NIP / VAT EU jest wymagany dla typu "Firma"';
            else if (!/^[A-Z]{0,2}\d{5,15}$/.test(nip.replace(/[\s-]/g, '').toUpperCase())) errors.nip = 'Nieprawidłowy format NIP / VAT EU (np. 1234567890, DE123456789)';
        } else {
            if (!name) errors.name = 'Imię jest wymagane';
            if (!lastName) errors.lastName = 'Nazwisko jest wymagane';
        }

        if (!email) errors.email = 'Email jest wymagany';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Nieprawidłowy format email';
        if (!phone) errors.phone = 'Telefon jest wymagany';

        return errors;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;

        const form = e.currentTarget;
        const formData = new FormData(form);

        // Validate
        const errors = validate(formData);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        try {
            setIsSubmitting(true);
            setError(null);

            const data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'> = {
                name: (formData.get('name') as string)?.trim() || '',
                lastName: (formData.get('lastName') as string)?.trim() || '',
                email: (formData.get('email') as string)?.trim() || '',
                phone: (formData.get('phone') as string)?.trim() || '',
                countryCode: 48,
                type: clientType,
                status: (formData.get('status') as 'active' | 'potential' | 'inactive') || 'potential',
                company: isCompany ? (formData.get('company') as string)?.trim() || '' : '',
                nip: isCompany ? (formData.get('nip') as string)?.trim() || '' : '',
                address: [{
                    street: (formData.get('street') as string)?.trim() || '',
                    city: (formData.get('city') as string)?.trim() || '',
                    zipCode: (formData.get('zipCode') as string)?.trim() || '',
                    country: (formData.get('country') as string)?.trim() || 'Polska'
                }]
            };

            await onSubmit(data);
        } catch (error) {
            console.error('Error submitting form:', error);
            setError(error instanceof Error ? error.message : 'Wystąpił błąd podczas zapisywania danych klienta');
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputClass = (field: keyof FieldErrors) =>
        `mt-1 block w-full rounded-md shadow-sm sm:text-sm ${fieldErrors[field]
            ? 'border-red-300 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 bg-white text-gray-900 focus:border-[#21808D] focus:ring-[#21808D]'
        }`;

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                        <Users2 className="h-6 w-6 text-gray-400" />
                        <h2 className="text-xl font-semibold text-gray-900">
                            {client ? 'Edytuj klienta' : 'Nowy klient'}
                        </h2>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    {/* ─── Typ klienta (toggle) ─── */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Typ klienta *
                        </label>
                        <div className="flex rounded-lg bg-gray-100 p-1">
                            <button
                                type="button"
                                onClick={() => setClientType('individual')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${!isCompany
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <User className="w-4 h-4" />
                                Osoba prywatna
                            </button>
                            <button
                                type="button"
                                onClick={() => setClientType('company')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${isCompany
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Building2 className="w-4 h-4" />
                                Firma
                            </button>
                        </div>
                        {/* Hidden input so FormData picks up type */}
                        <input type="hidden" name="type" value={clientType} />
                    </div>

                    {/* ─── Firma fields (only visible for company) ─── */}
                    {isCompany && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                            <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                                <Building2 className="w-4 h-4" />
                                Dane firmy
                            </h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Nazwa firmy *
                                </label>
                                <input
                                    type="text"
                                    name="company"
                                    defaultValue={client?.company}
                                    className={inputClass('company')}
                                    placeholder="np. Okna Premium Sp. z o.o."
                                />
                                {fieldErrors.company && (
                                    <p className="mt-1 text-sm text-red-600">{fieldErrors.company}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    NIP / VAT EU *
                                </label>
                                <input
                                    type="text"
                                    name="nip"
                                    defaultValue={client?.nip}
                                    className={inputClass('nip')}
                                    placeholder="1234567890 lub DE123456789"
                                    maxLength={20}
                                />
                                {fieldErrors.nip && (
                                    <p className="mt-1 text-sm text-red-600">{fieldErrors.nip}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── Imię / Nazwisko ─── */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Imię {!isCompany && '*'}
                                {isCompany && <span className="text-xs text-gray-400 ml-1">(opcjonalne)</span>}
                            </label>
                            <input
                                type="text"
                                name="name"
                                defaultValue={client?.name}
                                className={inputClass('name')}
                                placeholder={isCompany ? 'Osoba kontaktowa' : ''}
                            />
                            {fieldErrors.name && (
                                <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Nazwisko {!isCompany && '*'}
                                {isCompany && <span className="text-xs text-gray-400 ml-1">(opcjonalne)</span>}
                            </label>
                            <input
                                type="text"
                                name="lastName"
                                defaultValue={client?.lastName}
                                className={inputClass('lastName')}
                                placeholder={isCompany ? 'Osoba kontaktowa' : ''}
                            />
                            {fieldErrors.lastName && (
                                <p className="mt-1 text-sm text-red-600">{fieldErrors.lastName}</p>
                            )}
                        </div>
                    </div>

                    {/* ─── Kontakt ─── */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Email *
                            </label>
                            <input
                                type="email"
                                name="email"
                                defaultValue={client?.email}
                                className={inputClass('email')}
                            />
                            {fieldErrors.email && (
                                <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Telefon *
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                defaultValue={client?.phone}
                                placeholder="+48 123 456 789"
                                className={inputClass('phone')}
                            />
                            {fieldErrors.phone && (
                                <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>
                            )}
                        </div>
                    </div>

                    {/* ─── Status ─── */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Status *
                        </label>
                        <select
                            name="status"
                            defaultValue={client?.status || 'potential'}
                            className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                            required
                        >
                            <option value="active">Aktywny</option>
                            <option value="potential">Potencjalny</option>
                            <option value="inactive">Nieaktywny</option>
                        </select>
                    </div>

                    {/* ─── Adres ─── */}
                    <div className="border-t border-gray-200 pt-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Adres</h3>
                        <div className="grid gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Ulica
                                </label>
                                <input
                                    type="text"
                                    name="street"
                                    defaultValue={client?.address?.[0]?.street}
                                    className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">
                                        Kod pocztowy
                                    </label>
                                    <input
                                        type="text"
                                        name="zipCode"
                                        defaultValue={client?.address?.[0]?.zipCode}
                                        placeholder="00-000"
                                        className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">
                                        Miejscowość
                                    </label>
                                    <input
                                        type="text"
                                        name="city"
                                        defaultValue={client?.address?.[0]?.city}
                                        className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">
                                        Kraj
                                    </label>
                                    <select
                                        name="country"
                                        defaultValue={client?.address?.[0]?.country || 'Polska'}
                                        className="mt-1 block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D]"
                                    >
                                        <option value="Polska">🇵🇱 Polska</option>
                                        <option value="Niemcy">🇩🇪 Niemcy</option>
                                        <option value="Czechy">🇨🇿 Czechy</option>
                                        <option value="Słowacja">🇸🇰 Słowacja</option>
                                        <option value="Austria">🇦🇹 Austria</option>
                                        <option value="Francja">🇫🇷 Francja</option>
                                        <option value="Holandia">🇳🇱 Holandia</option>
                                        <option value="Belgia">🇧🇪 Belgia</option>
                                        <option value="Wielka Brytania">🇬🇧 Wielka Brytania</option>
                                        <option value="Szwecja">🇸🇪 Szwecja</option>
                                        <option value="Dania">🇩🇰 Dania</option>
                                        <option value="Norwegia">🇳🇴 Norwegia</option>
                                        <option value="Inne">🌍 Inne</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Actions ─── */}
                    <div className="flex justify-end space-x-4 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                            disabled={isSubmitting}
                        >
                            <div className="flex items-center">
                                <X className="h-4 w-4 mr-2" />
                                <span>Anuluj</span>
                            </div>
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                            disabled={isSubmitting}
                        >
                            <div className="flex items-center">
                                <Save className="h-4 w-4 mr-2" />
                                <span>{isSubmitting ? 'Zapisywanie...' : 'Zapisz'}</span>
                            </div>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
