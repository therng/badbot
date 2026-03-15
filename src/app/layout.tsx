import type { Metadata } from 'next';
import { Azeret_Mono, Cormorant_Garamond } from 'next/font/google';
import './globals.css';

const sansFont = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic']
});

const monoFont = Azeret_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['300', '400', '500']
});

export const metadata: Metadata = {
  title: 'BadBot',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon_io/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/favicon_io/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon_io/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
    ],
    shortcut: '/favicon_io/favicon.ico',
    apple: '/favicon_io/apple-touch-icon.png'
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content="BadBot" />
      </head>
      <body className={`${sansFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
