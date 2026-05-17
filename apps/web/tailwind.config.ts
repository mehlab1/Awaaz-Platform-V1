import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/** State/orientation variants expected by Base UI–style UI components (replacement for unresolved `shadcn/tailwind.css` preset). */
const shadcnUiStateVariants = plugin(({ addVariant }) => {
  addVariant(
    "data-open",
    '&:where([data-state="open"]), &:where([data-open]:not([data-open="false"]))',
  );
  addVariant(
    "data-closed",
    '&:where([data-state="closed"]), &:where([data-closed]:not([data-closed="false"]))',
  );
  addVariant(
    "data-checked",
    '&:where([data-state="checked"]), &:where([data-checked]:not([data-checked="false"]))',
  );
  addVariant(
    "data-unchecked",
    '&:where([data-state="unchecked"]), &:where([data-unchecked]:not([data-unchecked="false"]))',
  );
  addVariant("data-selected", '&:where([data-selected="true"])');
  addVariant(
    "data-disabled",
    '&:where([data-disabled="true"]), &:where([data-disabled]:not([data-disabled="false"]))',
  );
  addVariant(
    "data-active",
    '&:where([data-state="active"]), &:where([data-active]:not([data-active="false"]))',
  );
  addVariant(
    "data-horizontal",
    '&:where([data-orientation="horizontal"])',
  );
  addVariant(
    "data-vertical",
    '&:where([data-orientation="vertical"])',
  );
  addVariant("data-ending-style", "&:where([data-ending-style])");
  addVariant("data-starting-style", "&:where([data-starting-style])");
});

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: "var(--destructive)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [shadcnUiStateVariants],
} satisfies Config;
