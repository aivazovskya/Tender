'use client';

import React from 'react';
import { 
  Search, 
  Kanban, 
  Sparkles, 
  CreditCard, 
  Send, 
  Activity,
  Layers
} from 'lucide-react';

interface NavigationProps {
  activeTab: 'catalog' | 'kanban' | 'matching' | 'admin' | 'billing' | 'telegram';
  setActiveTab: (tab: 'catalog' | 'kanban' | 'matching' | 'admin' | 'billing' | 'telegram') => void;
  language: 'RU' | 'KK';
  setLanguage: (lang: 'RU' | 'KK') => void;
  kanbanCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  language,
  setLanguage,
  kanbanCount
}) => {
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
                {language === 'RU' ? 'Агрегатор и ИИ-Ассистент РК' : 'ҚР Тендерлерінің ИИ-агрегаторы'}
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
              <span>{language === 'RU' ? 'Каталог' : 'Каталог'}</span>
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
              <span>{language === 'RU' ? 'ИИ-Матчинг' : 'ИИ-Матчинг'}</span>
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
              <span>{language === 'RU' ? 'Воронка' : 'Воронка'}</span>
              {kanbanCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-semibold bg-ink text-paper rounded-full">
                  {kanbanCount}
                </span>
              )}
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
              <span>{language === 'RU' ? 'Админка' : 'Админка'}</span>
            </button>
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-2.5">
            
            {/* Telegram Bot shortcut */}
            <button
              onClick={() => setActiveTab('telegram')}
              className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-alt border border-hairline text-ink hover:bg-paper text-xs font-medium transition-colors shadow-subtle"
            >
              <Send className="w-3.5 h-3.5 text-sky-600" />
              <span>Telegram Bot</span>
            </button>

            {/* Billing Button */}
            <button
              onClick={() => setActiveTab('billing')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-ink text-paper hover:bg-ink-soft text-xs font-medium transition-all shadow-subtle"
            >
              <CreditCard className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Pro (29 900 ₸)</span>
              <span className="sm:hidden">Pro</span>
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

          </div>

        </div>
      </div>
    </header>
  );
};
