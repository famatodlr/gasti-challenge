import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gasti',
  description: 'Tu asistente financiero conversacional',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png', sizes: '172x100' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#050706',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
