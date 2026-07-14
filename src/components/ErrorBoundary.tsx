import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 border border-red-200 rounded text-red-900 absolute inset-0 overflow-auto z-50">
                    <h1 className="text-2xl font-bold mb-4">Coś poszło nie tak (Błąd krytyczny)</h1>
                    <p className="font-semibold">{this.state.error?.message}</p>
                    <pre className="mt-4 p-4 bg-gray-100 rounded text-xs font-mono overflow-auto">
                        {this.state.errorInfo?.componentStack}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Odśwież stronę
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
