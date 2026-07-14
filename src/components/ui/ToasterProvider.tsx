import { Toaster } from 'sonner';

export const ToasterProvider = () => {
    return (
        <Toaster
            position="top-right"
            expand={false}
            richColors
            closeButton
            theme="light"
            toastOptions={{
                style: {
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                },
            }}
        />
    );
};
