/** @type {import('tailwindcss').Config} */
export default {
content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    black: '#0a0a0a',
                    gray: '#6a6a6aff',
                },
            },
            boxShadow: {
                card: '0 1px 0 rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.05)'
            }
        },
    },
    plugins: [],
}
