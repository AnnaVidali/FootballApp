import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getServerLocale } from "@/lib/server-i18n";
import { LocaleProvider } from "@/lib/i18n-context";
import { CspNonceProvider } from "@/lib/csp-nonce";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Squad HQ",
  description: "Manage your football team, schedule trainings, and build lineups.",
  icons: {
    icon: "/soccerballimage.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  // Set by proxy.ts for this request; hand-written inline scripts need it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CspNonceProvider nonce={nonce}>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </CspNonceProvider>
      </body>
    </html>
  );
}
