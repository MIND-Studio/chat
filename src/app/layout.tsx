import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeShell } from "@/components/theme-shell";

// Mind theme's font axis (ui 0.4.0) reads these CSS vars off <html>.
const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jb", display: "swap" });

export const metadata: Metadata = {
  title: "Mind Chat",
  description: "Privacy-first chat on Solid pods. Your messages live in your pod.",
};

/**
 * Mirror both theme axes onto <html> BEFORE first paint to dodge the
 * flash-of-wrong-theme:
 *   • brand  → data-mind-theme   (localStorage `chat:brand`, default "mind")
 *   • mode   → .dark / .light    (next-themes key `chat:mode`, default dark)
 * <ThemeShell>/next-themes reconcile these on mount.
 */
const THEME_INIT = `(function(){try{var b=localStorage.getItem("chat:brand");if(b!=="deepspace"&&b!=="mind")b="deepspace";document.documentElement.setAttribute("data-mind-theme",b);var m=localStorage.getItem("chat:mode");var dark=m?m==="dark":true;document.documentElement.classList.toggle("dark",dark);document.documentElement.classList.toggle("light",!dark);}catch(e){document.documentElement.setAttribute("data-mind-theme","deepspace");document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-background text-foreground">
        <ThemeShell>{children}</ThemeShell>
      </body>
    </html>
  );
}
