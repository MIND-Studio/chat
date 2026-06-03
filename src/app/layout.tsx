import type { Metadata } from "next";
import "./globals.css";
import { ThemeShell } from "@/components/theme-shell";

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
const THEME_INIT = `(function(){try{var b=localStorage.getItem("chat:brand");if(b!=="deepspace"&&b!=="mind")b="mind";document.documentElement.setAttribute("data-mind-theme",b);var m=localStorage.getItem("chat:mode");var dark=m?m==="dark":true;document.documentElement.classList.toggle("dark",dark);document.documentElement.classList.toggle("light",!dark);}catch(e){document.documentElement.setAttribute("data-mind-theme","mind");document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-background text-foreground">
        <ThemeShell>{children}</ThemeShell>
      </body>
    </html>
  );
}
