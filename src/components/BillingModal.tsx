'use client';

import React, { useState, useEffect } from 'react';
import { TARIFF_PLANS, KaspiPayService, KaspiQrPaymentResponse } from '../lib/services/kaspi.service';
import { Check, CreditCard, QrCode, ShieldCheck, X, AlertTriangle, RefreshCw, Sparkles, CheckCircle2, Lock } from 'lucide-react';

interface BillingModalProps {
  onClose: () => void;
  currentPlan?: string;
  onSelectPlan?: (planId: string) => void;
}

export const BillingModal: React.FC<BillingModalProps> = ({ onClose, currentPlan = 'PRO', onSelectPlan }) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(currentPlan);
  const [paymentQr, setPaymentQr] = useState<KaspiQrPaymentResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'UNKNOWN'>('PENDING');

  const selectedPlan = TARIFF_PLANS.find(p => p.id.toUpperCase() === selectedPlanId.toUpperCase()) || TARIFF_PLANS[1];

  const currentPlanRank = TARIFF_PLANS.findIndex(p => p.id.toUpperCase() === currentPlan.toUpperCase());
  const targetPlanRank = TARIFF_PLANS.findIndex(p => p.id.toUpperCase() === selectedPlan.id.toUpperCase());

  const isCurrentPlan = selectedPlan.id.toUpperCase() === currentPlan.toUpperCase();
  const isDowngradeOrFree = selectedPlan.id === 'FREE' || (targetPlanRank >= 0 && currentPlanRank >= 0 && targetPlanRank <= currentPlanRank);

  const handleDowngradePlan = (planId: string) => {
    if (onSelectPlan) {
      onSelectPlan(planId);
    }
  };

  const handleGenerateKaspiQr = async () => {
    setPaymentStatus('PENDING');
    const qrData = await KaspiPayService.createOrder(selectedPlan.id, selectedPlan.priceKztMonth);
    setPaymentQr(qrData);
  };

  useEffect(() => {
    if (!paymentQr || paymentStatus === 'PAID' || paymentStatus === 'FAILED') return;

    const interval = setInterval(async () => {
      const serverStatus = await KaspiPayService.checkPaymentStatus(paymentQr.paymentId);
      if (serverStatus === 'PAID') {
        setPaymentStatus('PAID');
        if (onSelectPlan) {
          onSelectPlan(selectedPlan.id);
        }
        clearInterval(interval);
      } else if (serverStatus === 'FAILED' || serverStatus === 'EXPIRED') {
        setPaymentStatus(serverStatus);
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [paymentQr, paymentStatus, selectedPlan.id, onSelectPlan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-paper border border-hairline rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-elevated overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-hairline flex items-center justify-between bg-surface-alt">
          <div>
            <div className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-ink" />
              <h2 className="text-lg font-bold text-ink tracking-tight">Тарифные планы TenderAI & Оплата Kaspi Pay</h2>
            </div>
            <p className="text-xs text-mid-gray mt-1">
              Официальный эквайринг Kaspi Pay (KZT). Повышение тарифа выполняется исключительно после подтвержденной оплаты.
            </p>
          </div>

          <button onClick={onClose} className="p-2 text-mid-gray hover:text-ink rounded-xl hover:bg-paper transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {TARIFF_PLANS.map((plan) => {
              const isCurrent = currentPlan.toUpperCase() === plan.id.toUpperCase();
              const isSelected = selectedPlanId.toUpperCase() === plan.id.toUpperCase();

              return (
                <div
                  key={plan.id}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    setPaymentQr(null);
                    setPaymentStatus('PENDING');
                  }}
                  className={`p-5 rounded-2xl cursor-pointer transition-all flex flex-col justify-between relative shadow-subtle ${
                    isSelected
                      ? 'bg-paper border-2 border-ink shadow-elevated'
                      : 'bg-surface-alt border border-hairline hover:border-mid-gray/40'
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-600 text-paper font-semibold text-[10px] uppercase tracking-wider">
                      Текущий тариф
                    </span>
                  )}
                  {!isCurrent && plan.recommended && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-ember text-paper font-semibold text-[10px] uppercase">
                      Популярный
                    </span>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-ink mb-1">{plan.name}</h3>
                    <div className="mb-4">
                      <span className="text-xl font-extrabold text-ink font-mono tracking-tight">
                        {plan.priceKztMonth === 0 ? '0 ₸' : `${plan.priceKztMonth.toLocaleString('ru-RU')} ₸`}
                      </span>
                      {plan.priceKztMonth > 0 && <span className="text-xs text-mid-gray">/мес</span>}
                    </div>

                    <ul className="space-y-2 text-xs text-ink-soft">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlanId(plan.id);
                    }}
                    className={`w-full mt-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-subtle flex items-center justify-center space-x-1 ${
                      isCurrent
                        ? 'bg-emerald-600 text-paper'
                        : isSelected
                        ? 'bg-ink text-paper'
                        : 'bg-paper border border-hairline text-ink hover:bg-surface-alt'
                    }`}
                  >
                    {isCurrent ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-paper" />
                        <span>Активен</span>
                      </>
                    ) : (
                      <span>{isSelected ? 'Выбран' : 'Выбрать'}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Status & Action Banner */}
          <div className="p-5 rounded-2xl bg-surface-alt border border-hairline flex flex-col md:flex-row items-center justify-between gap-4 shadow-subtle">
            <div>
              <h4 className="text-sm font-bold text-ink flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-ember" />
                <span>Выбранный тариф: {selectedPlan.name}</span>
              </h4>
              <p className="text-xs text-mid-gray mt-0.5">
                {isCurrentPlan
                  ? 'Этот тарифный план в данный момент активен.'
                  : isDowngradeOrFree
                  ? 'Вы можете переключиться на этот тариф без оплаты.'
                  : 'Повышение тарифа требует оплаты счета через Kaspi QR.'}
              </p>
            </div>

            {!isCurrentPlan && isDowngradeOrFree && (
              <button
                onClick={() => handleDowngradePlan(selectedPlan.id)}
                className="px-5 py-2.5 rounded-xl bg-ink hover:bg-ink-soft text-paper font-bold text-xs shadow-subtle transition-all flex items-center space-x-2 shrink-0"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Перейти на {selectedPlan.name}</span>
              </button>
            )}

            {!isCurrentPlan && !isDowngradeOrFree && (
              <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-semibold flex items-center space-x-2 shrink-0">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Требуется оплата через Kaspi QR</span>
              </div>
            )}
          </div>

          {/* Payment Details & Kaspi QR UI for Upgrades or Paid Plans */}
          {!isCurrentPlan && !isDowngradeOrFree && selectedPlan.priceKztMonth > 0 && (
            <div className="p-6 rounded-2xl bg-surface-alt border border-hairline flex flex-col md:flex-row items-center justify-between gap-6 shadow-subtle">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-ink font-bold">
                  <QrCode className="w-5 h-5 text-ember" />
                  <span>Оплата через Kaspi.kz (Kaspi Pay QR)</span>
                </div>
                <p className="text-xs text-mid-gray max-w-md leading-relaxed">
                  Отсканируйте QR-код в приложении Kaspi.kz. Тариф {selectedPlan.name} активируется автоматически после подтверждения оплаты сервером.
                </p>
                <div className="text-xs font-mono text-ink font-semibold">
                  Сумма счета: <span className="text-base font-bold">{selectedPlan.priceKztMonth.toLocaleString('ru-RU')} KZT</span>
                </div>
              </div>

              {!paymentQr ? (
                <button
                  onClick={handleGenerateKaspiQr}
                  className="px-6 py-3 rounded-xl bg-ink hover:bg-ink-soft text-paper font-bold text-xs shadow-subtle transition-all flex items-center space-x-2 shrink-0"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Сгенерировать Kaspi QR</span>
                </button>
              ) : paymentStatus === 'PAID' ? (
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1 shrink-0 min-w-[220px]">
                  <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold text-emerald-900">Платёж подтверждён через Webhook!</p>
                  <p className="text-[10px] text-mid-gray font-mono">Заказ: {paymentQr.paymentId}</p>
                  <p className="text-[10px] text-emerald-700 font-semibold pt-1">Тариф {selectedPlan.name} активирован</p>
                </div>
              ) : paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED' ? (
                <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-center space-y-2 shrink-0 min-w-[220px]">
                  <AlertTriangle className="w-7 h-7 text-red-600 mx-auto" />
                  <p className="text-xs font-bold text-red-900">Ошибка или истечение счета</p>
                  <button
                    onClick={handleGenerateKaspiQr}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-paper text-[11px] font-semibold flex items-center space-x-1 mx-auto"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Повторить QR</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-paper border border-hairline text-center space-y-2 shrink-0 min-w-[200px] shadow-subtle">
                  <div className="w-32 h-32 bg-paper rounded-xl p-2 mx-auto flex items-center justify-center border border-hairline">
                    <QrCode className="w-24 h-24 text-ink" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-ink font-mono animate-pulse">Ожидание вебхука от сервера Kaspi...</p>
                    <p className="text-[9px] text-mid-gray font-mono">Поллинг статуса /api/billing/kaspi/status</p>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
