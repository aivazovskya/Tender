'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Tender } from '@/lib/types/tender';
import { TenderDetailContent } from '@/components/TenderDetailContent';
import { 
  ArrowLeft, 
  Loader2, 
  AlertCircle, 
  FileText, 
  ExternalLink,
  ShieldCheck,
  Building2,
  Share2,
  Check
} from 'lucide-react';

export default function TenderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isInKanban, setIsInKanban] = useState<boolean>(false);
  const [userTariff, setUserTariff] = useState<string>('PRO');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    loadTenderAndKanbanStatus();
  }, [id]);

  const loadTenderAndKanbanStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Tender Details
      const res = await fetch(`/api/tenders/${id}`);
      const json = await res.json();

      if (json.success && json.data) {
        setTender(json.data);

        // 2. Check if tender is already in user's Kanban
        try {
          const kanbanRes = await fetch('/api/kanban');
          const kanbanJson = await kanbanRes.json();
          if (kanbanJson.success && Array.isArray(kanbanJson.cards)) {
            const inKanban = kanbanJson.cards.some((c: any) => c.tenderId === json.data.id || c.tenderId === json.data.externalId);
            setIsInKanban(inKanban);
          }
        } catch {
          // ignore kanban check error
        }

        // 3. Fetch Company Profile
        try {
          const profileRes = await fetch('/api/company-profile');
          const profileJson = await profileRes.json();
          if (profileJson.success && profileJson.profile?.subscriptionPlan) {
            setUserTariff(profileJson.profile.subscriptionPlan);
          }
        } catch {
          // ignore
        }
      } else {
        setError(json.error || 'Тендер не найден');
      }
    } catch (err: any) {
      setError('Ошибка загрузки данных тендера');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToKanban = async (t: Tender) => {
    try {
      const res = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: t.id,
          stage: 'UNDER_REVIEW',
          priority: 'MEDIUM',
          notes: 'Добавлено со страницы лота'
        })
      });
      const json = await res.json();
      if (json.success) {
        setIsInKanban(true);
      }
    } catch (err) {
      console.error('Failed to add to Kanban:', err);
    }
  };

  const handleExportPDF = async (tenderId: string, externalId: string) => {
    try {
      const res = await fetch(`/api/export/tenders/${tenderId}/pdf`);
      if (!res.ok) throw new Error('Ошибка генерации PDF');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Тендер_${externalId || tenderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Не удалось сформировать PDF-отчёт по тендеру');
    }
  };

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans text-ink">
      
      {/* Top Main Navigation Bar */}
      <header className="sticky top-0 z-40 bg-paper/80 backdrop-blur-md border-b border-hairline px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-ink text-paper flex items-center justify-center font-bold text-sm shadow-subtle group-hover:scale-105 transition-transform">
                T
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-ink leading-none">TenderAI</span>
                <span className="text-[10px] text-mid-gray leading-tight">Госзакупки РК</span>
              </div>
            </Link>

            <span className="text-mid-gray/40">/</span>

            <Link
              href="/"
              className="text-xs font-semibold text-mid-gray hover:text-ink flex items-center space-x-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Каталог</span>
            </Link>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyShareLink}
              className="px-3 py-1.5 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-xs font-medium text-ink flex items-center space-x-1.5 transition-all shadow-subtle"
              title="Скопировать постоянную ссылку на этот лот"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Ссылка скопирована!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-mid-gray" />
                  <span>Поделиться</span>
                </>
              )}
            </button>

            <Link
              href="/"
              className="px-3.5 py-1.5 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold transition-all shadow-subtle"
            >
              В каталог
            </Link>
          </div>
        </div>
      </header>

      {/* Main Page Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="p-16 text-center space-y-4 bg-paper border border-hairline rounded-3xl shadow-subtle my-8">
            <Loader2 className="w-10 h-10 text-ember animate-spin mx-auto" />
            <h3 className="text-base font-bold text-ink">Загрузка информации о тендере...</h3>
            <p className="text-xs text-mid-gray font-mono">№ {id}</p>
          </div>
        ) : error || !tender ? (
          <div className="p-12 text-center space-y-4 bg-rose-50 border border-rose-200 rounded-3xl text-rose-900 my-8 shadow-subtle">
            <AlertCircle className="w-12 h-12 text-rose-600 mx-auto" />
            <h2 className="text-lg font-bold">Тендер не найден</h2>
            <p className="text-xs text-rose-800 max-w-md mx-auto">
              {error || `Не удалось найти закупку по идентификатору "${id}". Возможно, лот был удален или перемещен.`}
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs inline-flex items-center space-x-1.5 transition-all shadow-subtle"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Вернуться на главную</span>
              </Link>
            </div>
          </div>
        ) : (
          <TenderDetailContent
            tender={tender}
            isInKanban={isInKanban}
            onAddToKanban={handleAddToKanban}
            onExportPDF={handleExportPDF}
            userPlan={userTariff}
            language="RU"
            isStandalonePage={true}
          />
        )}
      </main>

      {/* Page Footer */}
      <footer className="border-t border-hairline py-6 text-center text-xs text-mid-gray">
        <p>© {new Date().getFullYear()} TenderAI — Платформа мониторинга и автоматизации госзакупок Казахстана</p>
      </footer>

    </div>
  );
}
