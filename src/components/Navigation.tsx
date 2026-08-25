'use client';

import React from 'react';
import { 
  Search, 
  Kanban, 
  Sparkles, 
  CreditCard, 
  Send, 
  Activity,
  Layers,
  Key,
  BarChart3,
  ShieldAlert,
  User as UserIcon,
  LogOut
} from 'lucide-react';

import { useTranslation } from '../lib/i18n/useTranslation';

interface NavigationProps {
  activeTab: 'catalog' | 'kanban' | 'matching' | 'reports' | 'security' | 'admin' | 'billing' | 'telegram';
  setActiveTab: (tab: 'catalog' | 'kanban' | 'matching' | 'reports' | 'security' | 'admin' | 'billing' | 'telegram') => void;
  language: 'RU' | 'KK';
  setLanguage: (lang: 'RU' | 'KK') => void;
  kanbanCount: number;
  onOpenApiKeyModal?: () => void;
  onOpenSecurityModal?: () => void;
  userTariff?: string;
  currentUser?: { id: string; email: string; name?: string | null; role: string } | null;
  onOpenAuthModal?: () => void;
  onLogout?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  language,
  setLanguage,
  kanbanCount,
  onOpenApiKeyModal,
  userTariff = 'PRO',
  currentUser,
  onOpenAuthModal,
  onLogout
}) => {
  const t = useTranslation(language);

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-hairline shadow-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand with Ember Accent */}
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setActiveTab('catalog')}>
            <div className="w-9 h-9 rounded-xl bg-ink text-paper flex items-center justify-center shadow-subtle relative overflow-hidden group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5 text-paper" />
              <div className="absolute top-0 right-0 w-2 h-2 bg-ember rounded-full" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-ink">
                  Tender<span className="text-ember">AI</span>
                </span>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-alt text-mid-gray border border-hairline">
                  KZ v1.6
                </span>
              </div>
              <p className="text-[11px] text-mid-gray leading-none">
                {t.nav.brandSub}
              </p>
            </div>
          </div>

          {/* Navigation Links - Segmented Control */}
          <nav className="hidden md:flex items-center space-x-1 bg-surface-alt p-1 rounded-xl border border-hairline">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'catalog'
                  ? 'bg-paper text-ink shadow-subtle border border-hairline'
                  : 'text-mid-gray hover:text-ink hover:bg-paper/50'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>{t.nav.catalog}</span>
            </button>

            <button
              onClick={() => setActiveTab('matching')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'matching'
                  ? 'bg-paper text-ink shadow-subtle border border-hairline'
                  : 'text-mid-gray hover:text-ink hover:bg-paper/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-ember" />
              <span>{t.nav.matching}</span>
            </button>

            <button
              onClick={() => setActiveTab('kanban')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all relative ${
                activeTab === 'kanban'
                  ? 'bg-paper text-ink shadow-subtle border border-hairline'
                  : 'text-mid-gray hover:text-ink hover:bg-paper/50'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>{t.nav.kanban}</span>
              {kanbanCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-semibold bg-ink text-paper rounded-full">
                  {kanbanCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'reports'
                  ? 'bg-paper text-ink shadow-subtle border border-hairline'
                  : 'text-mid-gray hover:text-ink hover:bg-paper/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Отчёты KPI</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-paper text-ink shadow-subtle border border-hairline'
                  : 'text-mid-gray hover:text-ink hover:bg-paper/50'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Обеспечения</span>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'admin'
                  ? 'bg-paper text-ink shadow-subtle border border-hairline'
                  : 'text-mid-gray hover:text-ink hover:bg-paper/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{t.nav.admin}</span>
            </button>
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-2.5">
            
            {/* API Keys Modal Launcher */}
            {onOpenApiKeyModal && (
              <button
                onClick={onOpenApiKeyModal}
                className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-alt border border-hairline text-ink hover:bg-paper text-xs font-medium transition-colors shadow-subtle"
                title="Управление API-ключами REST API (1С/CRM)"
              >
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span>API REST</span>
              </button>
            )}

            {/* Telegram Bot shortcut */}
            <button
              onClick={() => setActiveTab('telegram')}
              className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-alt border border-hairline text-ink hover:bg-paper text-xs font-medium transition-colors shadow-subtle"
            >
              <Send className="w-3.5 h-3.5 text-sky-600" />
              <span>Telegram Bot</span>
            </button>

            {/* Language Switcher */}
            <div className="flex items-center bg-surface-alt border border-hairline rounded-lg p-0.5">
              <button
                onClick={() => setLanguage('RU')}
                className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-all ${
                  language === 'RU' ? 'bg-paper text-ink shadow-subtle' : 'text-mid-gray hover:text-ink'
                }`}
              >
                RU
              </button>
              <button
                onClick={() => setLanguage('KK')}
                className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-all ${
                  language === 'KK' ? 'bg-paper text-ink shadow-subtle' : 'text-mid-gray hover:text-ink'
                }`}
              >
                ҚАЗ
              </button>
            </div>

            {/* Auth / Profile Button */}
            {currentUser && currentUser.id !== 'demo-user-id' ? (
              <div className="flex items-center space-x-1.5 pl-1">
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-surface-alt border border-hairline text-xs">
                  <UserIcon className="w-3.5 h-3.5 text-ember" />
                  <span className="font-semibold text-ink max-w-[100px] truncate" title={currentUser.email}>
                    {currentUser.name || currentUser.email.split('@')[0]}
                  </span>
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1.5 rounded-lg bg-surface-alt border border-hairline text-mid-gray hover:text-red-600 hover:bg-red-500/10 transition-colors"
                    title="Выйти из аккаунта"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              onOpenAuthModal && (
                <button
                  onClick={onOpenAuthModal}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-ember text-paper hover:bg-ember-soft text-xs font-semibold transition-all shadow-subtle"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Войти</span>
                </button>
              )
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
