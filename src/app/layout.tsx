import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GasoilRutas — Precios Diesel en Carretera',
  description:
    'Seguimiento de precios de gasóleo en rutas de carretera españolas. Actualización diaria desde la API del MINETUR.',
  keywords: ['gasóleo', 'diesel', 'precios', 'carretera', 'España', 'MINETUR'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-900 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
