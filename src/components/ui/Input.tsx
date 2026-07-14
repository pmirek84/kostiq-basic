import { type InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, className, id, ...props }, ref) => {
        return (
            <div className={className}>
                {label && (
                    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={id}
                    className={clsx(
                        'block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm',
                        error && 'border-red-300 focus:border-red-500 focus:ring-red-500',
                        props.disabled && 'bg-gray-100 cursor-not-allowed'
                    )}
                    {...props}
                />
                {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            </div>
        );
    }
);

Input.displayName = 'Input';
