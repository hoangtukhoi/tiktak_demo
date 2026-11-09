/** @type {import('tailwindcss').Config} */
// Màu lấy từ CSS variable (src/index.css) -> đổi theme sáng/tối chỉ bằng class `dark` trên <html>.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        line: v('line'),
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        brand: { DEFAULT: v('brand'), hover: v('brand-hover'), text: v('brand-text'), soft: v('brand-soft') },
        danger: v('danger'),
        success: v('success'),
        warn: v('warn'),
      },
      fontFamily: { sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'] },
      fontSize: {
        '2xs': ['11px', '16px'], xs: ['12px', '16px'], sm: ['13px', '18px'], base: ['15px', '22px'],
        md: ['17px', '24px'], lg: ['20px', '28px'], xl: ['24px', '30px'], '2xl': ['32px', '38px'], '3xl': ['40px', '44px'],
      },
      borderRadius: { sm: '6px', DEFAULT: '8px', md: '10px', lg: '12px', xl: '16px', '2xl': '20px' },
      boxShadow: {
        pop: '0 12px 32px -8px rgb(0 0 0 / .28), 0 0 0 1px rgb(var(--line))',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
      keyframes: { shimmer: { to: { backgroundPosition: '-200% 0' } } },
      animation: { shimmer: 'shimmer 1.4s linear infinite' },
    },
  },
  plugins: [],
};
