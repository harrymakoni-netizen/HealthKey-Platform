import { LocaleProvider } from "@/components/locale";
import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "HealthKey",
  description: "Private access to clinic support.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3342",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
