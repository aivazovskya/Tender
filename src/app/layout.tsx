import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TenderAI — Платформа агрегации тендеров Казахстана с ИИ-ботом',
  description: 'Единая система мониторинга, поиска, суммаризации и семантического матчинга тендеров РК (goszakup.gov.kz, Самрук-Казына, квазигоссектор).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-canvas text-ink font-geist antialiased selection:bg-ink selection:text-paper">
        {children}
      </body>
    </html>
  );
}

