'use client';

import React, { useState } from 'react';
import { CompanyProfileData } from '../lib/types/tender';
import { KZ_REGIONS } from '../lib/mockData';
import { Sparkles, Tag, Check, Save } from 'lucide-react';

import { useTranslation } from '../lib/i18n/useTranslation';
import { ReputationCheckWidget } from './ReputationCheckWidget';

interface CompanyProfileModalProps {
  profile: CompanyProfileData;
  onSaveProfile: (profile: CompanyProfileData) => void;
  onRunMatching: () => void;
  language?: 'RU' | 'KK';
}

export const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({
  profile,
  onSaveProfile,
  onRunMatching,
  language = 'RU'
}) => {
  const t = useTranslation(language);
  const [formData, setFormData] = useState<CompanyProfileData>(profile);
  const [keywordInput, setKeywordInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleAddKeyword = () => {
    if (!keywordInput.trim()) return;
    if (!formData.keywords.includes(keywordInput.trim())) {
      setFormData(prev => ({ ...prev, keywords: [...prev.keywords, keywordInput.trim()] }));
    }
    setKeywordInput('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setFormData(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));
  };

  const handleToggleRegion = (region: string) => {
    setFormData(prev => {
      const exists = prev.regions.includes(region);
      const updated = exists ? prev.regions.filter(r => r !== region) : [...prev.regions, region];
      return { ...prev, regions: updated.length === 0 ? ['Все регионы'] : updated };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    onRunMatching();
  };

  return (
    <div className="bg-paper border border-hairline rounded-3xl p-6 space-y-6 max-w-4xl mx-auto shadow-subtle animate-fadeIn">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center space-x-2 tracking-tight">
            <Sparkles className="w-5 h-5 text-ember" />
            <span>{t.companyProfile.title}</span>
          </h2>
          <p className="text-xs text-mid-gray mt-1">
            {t.companyProfile.subtitle}
          </p>
        </div>

        {savedSuccess && (
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center space-x-1 shadow-subtle">
            <Check className="w-4 h-4" />
            <span>{t.companyProfile.savedSuccess}</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Company Name & BIN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1.5">
              {t.companyProfile.orgName}
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              className="w-full bg-surface-alt border border-hairline rounded-xl px-4 py-2.5 text-xs sm:text-sm text-ink focus:outline-none focus:border-ink shadow-subtle"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1.5">
              {t.companyProfile.orgBin}
            </label>
            <input
              type="text"
              value={formData.bin}
              onChange={(e) => setFormData({ ...formData, bin: e.target.value })}
              className="w-full bg-surface-alt border border-hairline rounded-xl px-4 py-2.5 text-xs sm:text-sm text-ink font-mono focus:outline-none focus:border-ink shadow-subtle"
              required
            />
          </div>
        </div>

        {/* Business Activities Description */}
        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1.5">
            {t.companyProfile.activitiesLabel}
          </label>
          <textarea
            rows={3}
            value={formData.activities}
            onChange={(e) => setFormData({ ...formData, activities: e.target.value })}
            placeholder={t.companyProfile.activitiesPlaceholder}
            className="w-full bg-surface-alt border border-hairline rounded-xl p-4 text-xs sm:text-sm text-ink focus:outline-none focus:border-ink leading-relaxed shadow-subtle"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-1.5">
            {t.companyProfile.keywordsLabel}
          </label>
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={t.companyProfile.keywordPlaceholder}
              className="flex-1 bg-surface-alt border border-hairline rounded-xl px-4 py-2 text-xs text-ink focus:outline-none focus:border-ink shadow-subtle"
            />
            <button
              type="button"
              onClick={handleAddKeyword}
              className="px-4 py-2 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-xs font-semibold text-ink shadow-subtle transition-all"
            >
              {t.companyProfile.addButton}
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.keywords.map((kw) => (
              <span key={kw} className="px-3 py-1 rounded-lg bg-surface-alt border border-hairline text-ink text-xs font-medium flex items-center space-x-1.5 shadow-subtle">
                <Tag className="w-3 h-3 text-mid-gray" />
                <span>{kw}</span>
                <button type="button" onClick={() => handleRemoveKeyword(kw)} className="hover:text-ember ml-1">×</button>
              </span>
            ))}
          </div>
        </div>

        {/* Regions */}
        <div>
          <label className="text-xs font-semibold text-ink-soft block mb-2">
            {t.companyProfile.preferredRegions}
          </label>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-3 rounded-2xl bg-surface-alt border border-hairline">
            {KZ_REGIONS.map((reg) => {
              const selected = formData.regions.includes(reg);
              return (
                <button
                  type="button"
                  key={reg}
                  onClick={() => handleToggleRegion(reg)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selected 
                      ? 'bg-ink text-paper shadow-subtle' 
                      : 'bg-paper border border-hairline text-mid-gray hover:text-ink'
                  }`}
                >
                  {reg}
                </button>
              );
            })}
          </div>
        </div>

        {/* Budget Range (KZT) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1.5">
              {t.companyProfile.minAmount}
            </label>
            <input
              type="number"
              value={formData.minAmount}
              onChange={(e) => setFormData({ ...formData, minAmount: parseFloat(e.target.value) || 0 })}
              className="w-full bg-surface-alt border border-hairline rounded-xl px-4 py-2.5 text-xs sm:text-sm text-ink font-mono focus:outline-none focus:border-ink shadow-subtle"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-soft block mb-1.5">
              {t.companyProfile.maxAmount}
            </label>
            <input
              type="number"
              value={formData.maxAmount || ''}
              onChange={(e) => setFormData({ ...formData, maxAmount: parseFloat(e.target.value) || 0 })}
              placeholder={t.companyProfile.noLimits}
              className="w-full bg-surface-alt border border-hairline rounded-xl px-4 py-2.5 text-xs sm:text-sm text-ink font-mono focus:outline-none focus:border-ink shadow-subtle"
            />
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-hairline">
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-ink hover:bg-ink-soft text-paper font-semibold text-xs sm:text-sm shadow-subtle transition-all flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{t.companyProfile.saveAndMatch}</span>
          </button>
        </div>

      </form>

      {/* Embedded Reputation Check Widget (Phase 1: RNU) */}
      <div className="pt-6 border-t border-hairline">
        <ReputationCheckWidget userPlan={profile.subscriptionPlan || 'FREE'} />
      </div>
    </div>
  );
};

