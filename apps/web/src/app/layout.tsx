import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif, Space_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kharisma",
  description: "Kharisma rooms — group crypto investing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${dmSans.variable} ${spaceMono.variable} ${instrumentSerif.variable} font-[family-name:var(--font-sans)] antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
