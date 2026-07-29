export type SourceType = 'GOSZAKUP' | 'SAMRUK_KAZYNA' | 'KAZATMROPROM' | 'B2B_PRIVATE';
export type AdapterType = 'API' | 'SCRAPER';
export type ProcurementMethod = 'OPEN_TENDER' | 'AUCTION' | 'PRICE_REQUEST' | 'SINGLE_SOURCE' | 'TWO_STAGE_TENDER';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type KanbanStage = 'UNDER_REVIEW' | 'PREPARING_BID' | 'SUBMITTED' | 'WON' | 'LOST';
export type TariffPlan = 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE';

export interface RiskFlag {
  id: string;
  code: string;
  severity: RiskSeverity;
  title: string;
  description: string;
}

export interface TenderDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize?: string;
  fileType?: string;
}

export interface TenderAuditTrail {
  id: string;
  changedBy: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string;
}

export interface Tender {
  id: string;
  source: SourceType;
  externalId: string;
  title: string;
  description?: string;
  customerName: string;
  customerBin: string;
  category: string;
  industryTags: string[];
  procurementMethod: ProcurementMethod;
  amount: number; // KZT
  currency: 'KZT';
  region: string;
  publishDate: string;
  deadlineDate: string;
  applicationSecurityAmount?: number;
  applicationSecurityPercent?: number;
  status: string;
  sourceUrl: string;
  
  // AI enrichment
  aiSummary?: string;
  aiKeyRequirements?: string[];
  riskScore: number; // 0 - 100
  riskFlags: RiskFlag[];
  documents: TenderDocument[];
  history: TenderAuditTrail[];
  
  // Semantic match percentage (dynamically populated per profile)
  matchPercentage?: number;
  matchReason?: string;
}

export interface DataSourceStatus {
  id: string;
  name: SourceType;
  displayName: string;
  adapterType: AdapterType;
  isActive: boolean;
  checkIntervalMins: number;
  lastSyncAt: string;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  successRate24h: number;
  totalIngested: number;
}

export interface CompanyProfileData {
  companyName: string;
  bin: string;
  activities: string;
  keywords: string[];
  regions: string[];
  minAmount: number;
  maxAmount: number;
  contactEmail: string;
  telegramChatId?: string;
}

export interface KanbanItem {
  id: string;
  tenderId: string;
  stage: KanbanStage;
  notes?: string;
  assignee?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  tender: Tender;
  updatedAt: string;
}
