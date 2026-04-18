import type { Metadata } from "next";
import "./globals.css";
import { getLangFromCookies } from "@/app/actions/lang";

export const metadata: Metadata = {
  title: "Annotation Hub",
  description: "Case and review management for annotation teams",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLangFromCookies();
  return (
    <html lang={lang}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
