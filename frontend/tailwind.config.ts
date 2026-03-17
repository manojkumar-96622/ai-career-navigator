import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            typography: {
                DEFAULT: {
                    css: {
                        color: '#e3e3e3',
                        a: {
                            color: '#a8c7fa',
                            '&:hover': {
                                color: '#d3e3fd',
                            },
                        },
                        h1: { color: '#e3e3e3' },
                        h2: { color: '#e3e3e3' },
                        h3: { color: '#e3e3e3' },
                        strong: { color: '#e3e3e3' },
                        code: { color: '#a8c7fa' },
                        blockquote: { borderLeftColor: '#444746', color: '#c4c7c5' },
                    },
                },
            },
        },
    },
    plugins: [
        require("@tailwindcss/typography"),
    ],
};
export default config;
