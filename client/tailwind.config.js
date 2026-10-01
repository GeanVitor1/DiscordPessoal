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
          darkest: '#1e1f22',
          darker: '#2b2d31',
          sidebar: '#232428',
          chat: '#313338',
          hover: '#35373c',
          active: '#3c3f45',
          blurple: '#5865f2',
          'blurple-hover': '#4752c4',
          green: '#23a55a',
          yellow: '#f0b232',
          red: '#f23f43',
          textMuted: '#949ba4',
          textNormal: '#dbdee1',
          textHeader: '#f2f3f5'
        }
      }
    },
  },
  plugins: [],
}
