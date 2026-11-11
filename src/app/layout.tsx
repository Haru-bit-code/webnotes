import "./globals.css";
// fonts are bundled with the app (no Google Fonts request), so they also work offline in the Android app
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-500.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import "@fontsource/hanken-grotesk/latin-700.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/kalam/latin-400.css";
import "@fontsource/kalam/latin-700.css";
import "@fontsource/caveat/latin-500.css";
import "@fontsource/caveat/latin-700.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/atom-one-dark.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "WebNotes", description: "Your personal markdown notes",
  appleWebApp: { capable: true, title: "WebNotes", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0f1115" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
