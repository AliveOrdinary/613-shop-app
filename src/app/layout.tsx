import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/saira/500.css";
import "@fontsource/saira/600-italic.css";
import "@fontsource/saira/700-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "613 Automotive",
  description: "Estimates, work orders and invoices for 613 Automotive",
  appleWebApp: { capable: true, title: "613 Shop", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
