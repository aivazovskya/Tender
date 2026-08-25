'use client';

import React from 'react';
import { Tender } from '../lib/types/tender';
import { DataSourceMeta } from '../lib/utils/sourceLabel';
import { TenderDetailContent } from './TenderDetailContent';

interface TenderDetailModalProps {
  tender: Tender | null;
  onClose: () => void;
  onAddToKanban: (tender: Tender) => void;
  isInKanban: boolean;
  onExportPDF?: (tenderId: string, externalId: string) => void;
  userPlan?: string;
  dataSources?: DataSourceMeta[];
  language?: 'RU' | 'KK';
}

export const TenderDetailModal: React.FC<TenderDetailModalProps> = ({
  tender,
  onClose,
  onAddToKanban,
  isInKanban,
  onExportPDF,
  userPlan,
  dataSources,
  language = 'RU'
}) => {
  if (!tender) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn">
      <TenderDetailContent
        tender={tender}
        onClose={onClose}
        onAddToKanban={onAddToKanban}
        isInKanban={isInKanban}
        onExportPDF={onExportPDF}
        userPlan={userPlan}
        dataSources={dataSources}
        language={language}
        isStandalonePage={false}
      />
    </div>
  );
};
