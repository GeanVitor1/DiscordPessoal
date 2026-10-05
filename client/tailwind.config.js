/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          darkest: 'rgb(from var(--darkest) r g b / <alpha-value>)',
          darker: 'rgb(from var(--darker) r g b / <alpha-value>)',
          sidebar: 'rgb(from var(--sidebar) r g b / <alpha-value>)',
          chat: 'rgb(from var(--chat) r g b / <alpha-value>)',
          hover: 'rgb(from var(--hover) r g b / <alpha-value>)',
          active: 'rgb(from var(--active) r g b / <alpha-value>)',
          blurple: 'rgb(from var(--accent) r g b / <alpha-value>)',
          'blurple-hover': 'rgb(from var(--accent-hover) r g b / <alpha-value>)',
          green: '#23a55a',
          yellow: '#f0b232',
          red: '#f23f43',
          textMuted: 'rgb(from var(--text-muted) r g b / <alpha-value>)',
          textNormal: 'rgb(from var(--text-normal) r g b / <alpha-value>)',
          textHeader: 'rgb(from var(--text-header) r g b / <alpha-value>)'
        }
      }
    },
  },
  plugins: [],
}
