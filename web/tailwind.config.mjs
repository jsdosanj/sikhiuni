/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // Deep blues. `navy` is the content text/link colour — variable-driven
        // so it flips to a light blue in dark mode. `brand` is the fixed navy
        // used for the few navy *backgrounds* (nav, table headers, FAB) that
        // must stay dark in both themes.
        navy: { DEFAULT: 'rgb(var(--c-navy) / <alpha-value>)', strong: '#0b2444', soft: '#1d4e89', deep: '#0b1e3a' },
        brand: { DEFAULT: '#16335c', strong: '#0b2444' },
        // Fixed, theme-invariant dark-hero field — like `brand`, this is NOT
        // variable-driven: it stays #0A1729 in both light and dark. Used by
        // `.hero-midnight` and the dark auth/hero surfaces where a near-black
        // field with light text is intentional (contrast is locked by design,
        // not by the theme tokens).
        midnight: '#0A1729',
        // Bright blue accents (variations)
        blue: { DEFAULT: '#1f6feb', bright: '#3b82f6', light: '#6aa6ff', sky: '#dbeafe' },
        // Vibrant yellow / gold (variations)
        // `soft` (tints/panels) and `deep` (text on light) are variable-driven so
        // they adapt in dark mode: soft → dark-warm, deep → light gold.
        saffron: { DEFAULT: '#f4b21a', soft: 'rgb(var(--c-saffron-soft) / <alpha-value>)', deep: 'rgb(var(--c-saffron-deep) / <alpha-value>)' },
        gold: { DEFAULT: '#f4b21a', bright: '#ffc83d', soft: 'rgb(var(--c-saffron-soft) / <alpha-value>)', deep: 'rgb(var(--c-saffron-deep) / <alpha-value>)' },
        // Neutrals
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        black: '#0a0d14',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ok: '#2f7d4f',
        // Editorial rust used across review/studio/admin failure states.
        danger: '#9A3B2A',
        'danger-soft': '#FFF4F2',
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', '"Iowan Old Style"', '"Times New Roman"', 'serif'],
        sans: ['Archivo', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['Archivo', 'Georgia', 'serif'],
        gur: ['"Noto Sans Gurmukhi"', '"Gurmukhi MN"', '"Gurbani Akhar"', '"Raavi"', 'serif'],
        gurserif: ['"Noto Serif Gurmukhi"', '"Noto Sans Gurmukhi"', '"Gurbani Akhar"', 'serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,19,26,.06), 0 10px 26px rgba(31,111,235,.08)',
        lift: '0 14px 34px rgba(31,111,235,.18)',
      },
      maxWidth: { content: '1100px' },
      // Deliberate global lever: the registrar's-ledger system uses a single
      // sharp radius. Lowering xl2 from 1.1rem to 3px sharpens every surface
      // that uses `rounded-xl2` (cards, glass, buttons via .btn, skeletons)
      // site-wide at once — intentional, per the redesign plan.
      borderRadius: { xl2: '3px' },
    },
  },
  plugins: [],
};
