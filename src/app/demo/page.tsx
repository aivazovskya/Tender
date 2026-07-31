import React from 'react';
import { Metadata } from 'next';
import HomePage from '../page';

export const metadata: Metadata = {
  title: 'TenderAI — Демонстрационная версия агрегатора тендеров РК',
  description: 'Попробуйте ИИ-агрегатор госзакупок Казахстана (goszakup.gov.kz, Самрук-Казына, акиматы) в демонстрационном режиме без регистрации.',
  openGraph: {
    title: 'TenderAI KZ — Публичное демо ИИ-агрегатора тендеров',
    description: 'Семантический ИИ-поиск, авто-суммаризация ТЗ и оценка рисков тендеров РК.',
    type: 'website'
  }
};

export default function DemoPage() {
  return (
    <div className="relative min-h-screen">
      <HomePage />
    </div>
  );
}
