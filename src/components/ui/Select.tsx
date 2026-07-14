import { type SelectHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    options: { label: string; value: string | number }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, className, id, options, ...props }, ref) => {
        return (
            <div className={className}>
                {label && (
                    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                        {label}
                    </label>
                )}
                <select
                    ref={ref}
                    id={id}
                    className={clsx(
                        'block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm',
                        error && 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    )}
                    {...props}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            </div>
        );
    }
);

Select.displayName = 'Select';
