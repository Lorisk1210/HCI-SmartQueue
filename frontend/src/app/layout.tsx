// =====================================================================
// Root Layout - Application Shell
// =====================================================================
// This is the root layout component that wraps all pages in the application.
// It sets up fonts, global styles, and provides the HTML structure for the app.

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// =====================================================================
// Font Configuration
// =====================================================================
// Load custom fonts from Google Fonts for typography. These fonts are made
// available as CSS variables that can be used throughout the application.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// =====================================================================
// Page Metadata
// =====================================================================
// Metadata for the application that appears in browser tabs and search results.
export const metadata: Metadata = {
  title: "SmartQueue",
  description: "SmartQueue",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
