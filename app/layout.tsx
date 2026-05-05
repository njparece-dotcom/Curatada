import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import ConditionalAppShell from "@/components/ConditionalAppShell";

export const metadata: Metadata = {
  title: "Curatada",
  description: "Track your collectibles — Guitars, Watches, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-background text-text">
        <SessionProvider>
          <ConditionalAppShell>{children}</ConditionalAppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
