import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.45s ease-out both",
        "slide-up": "slideUp 0.5s ease-out both",
        "scale-in": "scaleIn 0.3s ease-out both",
        "slide-up-delay-1": "slideUp 0.5s 0.05s ease-out both",
        "slide-up-delay-2": "slideUp 0.5s 0.1s ease-out both",
        "slide-up-delay-3": "slideUp 0.5s 0.15s ease-out both",
        "slide-up-delay-4": "slideUp 0.5s 0.2s ease-out both",
        "shimmer": "shimmer 1.6s linear infinite",
        "spin-slow": "spin 2s linear infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "bounce-bar": "bounceBar 1s ease-in-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        bounceBar: {
          "0%": { transform: "scaleX(0)", transformOrigin: "left" },
          "100%": { transform: "scaleX(1)", transformOrigin: "left" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-pattern": "linear-gradient(135deg, #0f172a 0%, #0d2d2a 50%, #0f172a 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
