import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Trading Monitor",
  description: "Mobile-first trading analytics dashboard for BadBot accounts.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content="BadBot" />
      </head>
      <body>{children}</body>
    </html>
  );
}
