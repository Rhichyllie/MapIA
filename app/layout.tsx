import type { Metadata } from "next";
import localFont from "next/font/local";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { AppProviders } from "./providers";

const THEME_INIT_SCRIPT = `
(() => {
  const storageKey = "mapia-theme";
  const root = document.documentElement;
  const isValidTheme = (value) => value === "dark" || value === "light";

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const resolvedTheme = isValidTheme(storedTheme) ? storedTheme : preferredTheme;
    root.dataset.theme = resolvedTheme;
  } catch {
    root.dataset.theme = "light";
  }
})();
`;

const manrope = localFont({
  src: [
    {
      path: "../public/fonts/manrope-variable.woff2",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = localFont({
  src: [
    {
      path: "../public/fonts/ibm-plex-mono-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-mono-500.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MapIA",
  description:
    "Mapeamento de arquitetura da informacao com assistente de criacao e editor nodal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          id="mapia-theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className={`${manrope.variable} ${ibmPlexMono.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
