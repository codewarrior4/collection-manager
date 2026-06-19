/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand ─────────────────────────────────────────────────────────
        primary:   '#FACC14',   // high-contrast yellow (CTA, active states)
        primaryHover: '#E6B800',

        // ── Surfaces (dark mode) ──────────────────────────────────────────
        dark: {
          bg:      '#121212',   // outermost page background
          surface: '#1a1a1a',   // main panel / workbench area
          card:    '#202020',   // cards, sidebar, modals
          elevated:'#272727',   // elevated cards, dropdowns
          border:  '#2e2e2e',   // dividers and borders
          hover:   '#2a2a2a',   // row / item hover
          active:  '#333333',   // selected / active row
          muted:   '#5a5a5a',   // placeholder, disabled text
          dim:     '#3a3a3a',   // subtle decorative elements
        },

        // ── Surfaces (light mode) ─────────────────────────────────────────
        light: {
          bg:      '#F4F4F4',
          surface: '#FFFFFF',
          card:    '#F9F9F9',
          elevated:'#FFFFFF',
          border:  '#E0E0E0',
          hover:   '#F0F0F0',
          active:  '#E8E8E8',
          muted:   '#9E9E9E',
          dim:     '#CCCCCC',
        },

        // ── Text ──────────────────────────────────────────────────────────
        text: {
          primary:   '#F5F5F5',   // dark-mode primary text
          secondary: '#A0A0A0',   // dark-mode secondary / labels
          muted:     '#5a5a5a',   // dark-mode muted
          inverse:   '#121212',   // text on light bg (light mode primary)
          'light-secondary': '#4B4B4B',
        },

        // ── Semantic ──────────────────────────────────────────────────────
        success:  '#22c55e',
        warning:  '#f59e0b',
        danger:   '#ef4444',
        info:     '#3b82f6',

        // ── HTTP Method badges ─────────────────────────────────────────────
        method: {
          get:    '#22c55e',
          post:   '#3b82f6',
          put:    '#f59e0b',
          patch:  '#a855f7',
          delete: '#ef4444',
        },
      },

      fontFamily: {
        // Headlines / display
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // UI, body, labels, inputs
        sans:    ['Urbanist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // URLs, code snippets, monospace output
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // Dot-grid background texture (matches design screenshots)
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
        'dot-grid-light': 'radial-gradient(circle, #d4d4d4 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot-grid': '20px 20px',
      },

      borderRadius: {
        sm:  '4px',
        DEFAULT: '6px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
      },

      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.4)',
        panel: '0 4px 16px rgba(0,0,0,0.5)',
        glow:  '0 0 12px rgba(250,204,20,0.25)',
      },
    },
  },
  plugins: [],
}
