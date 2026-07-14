/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#1E3A8A', // granat
                    light: '#2563EB',
                    dark: '#1E40AF',
                },
                accent: {
                    DEFAULT: '#F97316', // pomarańcz
                    hover: '#EA580C',
                },
                background: '#F3F4F6', // jasnoszary
                success: '#16A34A',
                error: '#DC2626',
                text: {
                    main: '#111827',
                    secondary: '#4B5563',
                },
                gray: {
                    750: '#2D3748',
                }
            },
        },
    },
    plugins: [],
}
