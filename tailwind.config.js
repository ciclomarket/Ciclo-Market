
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mb: { bg: "#ffffff", surface: "#ffffff", ink: "#0f172a", primary: "#14212e", secondary: "#14212e" }
      },
      boxShadow: { soft: "0 8px 24px rgba(0,0,0,.2)" },
      borderRadius: { xl2: "1rem" }
    }
  },
  plugins: []
}
