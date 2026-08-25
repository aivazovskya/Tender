'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  LogIn, 
  UserPlus, 
  Mail, 
  Lock, 
  User as UserIcon, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ShieldCheck,
  Clock,
  ArrowRight
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams?.get('redirect') || '/';

  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSuccess, setPendingSuccess] = useState<boolean>(false);

  // Check if already authenticated
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user && data.user.id !== 'demo-user-id') {
          router.push(redirectPath);
        }
      })
      .catch(() => {});
  }, [redirectPath, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'REGISTER') {
      if (password.length < 8) {
        setError('Пароль должен содержать не менее 8 символов');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === 'LOGIN' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'LOGIN' 
        ? { email, password } 
        : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Ошибка аутентификации');
      }

      if (mode === 'REGISTER' && data.pending) {
        setPendingSuccess(true);
      } else if (mode === 'LOGIN') {
        router.push(redirectPath);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between font-sans text-ink">
      
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-hairline bg-paper/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-ink text-paper flex items-center justify-center font-bold text-sm shadow-subtle">
              T
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-ink leading-none">TenderAI</span>
              <span className="text-[10px] text-mid-gray leading-tight">Закрытый корпоративный контур</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs text-mid-gray font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Доступ только по пропускам</span>
          </div>
        </div>
      </header>

      {/* Main Login / Register Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-paper border border-hairline rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-elevated space-y-6 animate-fadeIn">
          
          {pendingSuccess ? (
            <div className="text-center space-y-5 py-4">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-subtle">
                <Clock className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-ink">Заявка на регистрацию отправлена</h2>
                <p className="text-xs text-ink-soft leading-relaxed max-w-xs mx-auto">
                  Ваша учетная запись ожидает рассмотрения и одобрения администратором системы.
                </p>
                <p className="text-[11px] text-mid-gray pt-1">
                  После одобрения вы сможете войти, используя адрес <span className="font-mono font-semibold text-ink">{email}</span>.
                </p>
              </div>

              <button
                onClick={() => {
                  setPendingSuccess(false);
                  setMode('LOGIN');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="w-full py-2.5 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-subtle"
              >
                <span>Перейти ко входу</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Card Header & Tabs */}
              <div className="space-y-4">
                <div className="flex items-center bg-surface-alt border border-hairline rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => { setMode('LOGIN'); setError(null); }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
                      mode === 'LOGIN'
                        ? 'bg-paper text-ink shadow-subtle'
                        : 'text-mid-gray hover:text-ink'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Вход</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMode('REGISTER'); setError(null); }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
                      mode === 'REGISTER'
                        ? 'bg-paper text-ink shadow-subtle'
                        : 'text-mid-gray hover:text-ink'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Регистрация</span>
                  </button>
                </div>

                <div className="text-center">
                  <h1 className="text-xl font-bold text-ink tracking-tight">
                    {mode === 'LOGIN' ? 'Вход в TenderAI' : 'Создание аккаунта'}
                  </h1>
                  <p className="text-xs text-mid-gray mt-1">
                    {mode === 'LOGIN' 
                      ? 'Введите данные вашей подтвержденной учетной записи' 
                      : 'Заполните форму для подачи заявки на доступ к платформе'}
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start space-x-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'REGISTER' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider block">
                      Ваше имя или название организации
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-mid-gray absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="ТОО Компания / Иван Иванов"
                        className="w-full pl-10 pr-4 py-2.5 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider block">
                    Электронная почта
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-mid-gray absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@company.kz"
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider block">
                    Пароль
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-mid-gray absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Минимум 8 символов"
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-colors"
                    />
                  </div>
                </div>

                {mode === 'REGISTER' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider block">
                      Повторите пароль
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-mid-gray absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Повторите пароль"
                        className="w-full pl-10 pr-4 py-2.5 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-colors"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-subtle disabled:opacity-50 mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{mode === 'LOGIN' ? 'Вход...' : 'Отправка заявки...'}</span>
                    </>
                  ) : (
                    <>
                      {mode === 'LOGIN' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      <span>{mode === 'LOGIN' ? 'Войти в систему' : 'Подать заявку на регистрацию'}</span>
                    </>
                  )}
                </button>
              </form>

              {/* Policy note */}
              <div className="pt-2 text-center text-[11px] text-mid-gray leading-tight">
                {mode === 'REGISTER' ? (
                  <p>
                    После регистрации заявка направляется на модерацию администратору.
                  </p>
                ) : (
                  <p>
                    Забыли пароль или возникли вопросы? Обратитесь к администратору системы.
                  </p>
                )}
              </div>
            </>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-hairline text-center text-xs text-mid-gray">
        <p>© {new Date().getFullYear()} TenderAI — Автоматизация и аналитика закупок Казахстана</p>
      </footer>

    </div>
  );
}
