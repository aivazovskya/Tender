export type SourceType = string;
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
  id?: string;
  fileName: string;
  fileUrl: string;
  fileSize?: string;
  fileType?: string;
  docType?: string;
  extractedText?: string;
}

export interface TenderAuditTrail {
  id: string;
  changedBy: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string;
}

export type RiskScoringStatus = 'NOT_SCORED' | 'DEFAULT_ADAPTER' | 'AI_SCORED';

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
  riskScoringStatus?: RiskScoringStatus;
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
  subscriptionPlan?: string;
}

export interface KanbanItem {
  id: string;
  tenderId: string;
  stage: KanbanStage;
  notes?: string;
  assignee?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  tender: Tender;
  stageEnteredAt?: string;
  stageSlaHours?: number;
  requirementsStats?: { completed: number; total: number };
  updatedAt: string;
}

export type ReputationEntityType = 'CUSTOMER' | 'SUPPLIER';

export interface ReputationCheckResult {
  bin: string;
  entityType: ReputationEntityType;
  isBlacklisted: boolean;
  registryRecordId?: string | null;
  reason?: string | null;
  banStartDate?: string | null;
  banEndDate?: string | null;
  status: 'CLEAN' | 'BLACKLISTED' | 'NOT_FOUND' | 'UNKNOWN';
  stale?: boolean;
  isFallback?: boolean;
  checkedAt?: string;
  expiresAt?: string;
  source: string;
}

export type CompetitionLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EstimateConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CompetitionEstimate {
  tenderId: string;
  competitionLevel: CompetitionLevel;
  estimatedParticipants: number | null;
  procurementMethod: ProcurementMethod;
  isSingleSource: boolean;
  confidence: EstimateConfidence;
  sampleSize: number;
  basis: string;
  winProbability: number | null;
  winProbabilityReason?: string | null;
  userHistoryCount?: number;
  hideDetailedCounts?: boolean;
}

export type TenderCostCategory =
  | 'PURCHASE'
  | 'LOGISTICS'
  | 'INSTALLATION'
  | 'WARRANTY_SERVICE'
  | 'LABOR'
  | 'BID_SECURITY'
  | 'PERFORMANCE_BOND'
  | 'PLATFORM_FEES'
  | 'OVERHEAD'
  | 'TAXES'
  | 'FX_RISK'
  | 'OTHER';

export type TenderCostValueType = 'FIXED' | 'PERCENTAGE';

export interface TenderCostItem {
  id: string;
  calculationId: string;
  category: TenderCostCategory;
  label: string;
  valueType: TenderCostValueType;
  amount: number;
  baseAmount?: number | null;
  computedAmount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenderCalculation {
  id: string;
  tenderId: string;
  companyId: string;
  startPrice: number;
  totalCost: number;
  targetMarginPct: number;
  minMarginPct: number;
  riskAdjustedMarginPct: number | null;
  recommendedPrice: number;
  minAcceptablePrice: number;
  biddingRoomPct: number | null;
  biddingRoomAmount: number | null;
  costItems: TenderCostItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PriceBenchmarkResult {
  category: string;
  region?: string | null;
  sampleSize: number;
  avgAmount: number;
  medianAmount: number;
  minAmount: number;
  maxAmount: number;
  periodMonths: number;
  isReliable: boolean;
}

export interface CategoryBreakdown {
  category: string;
  submitted: number;
  won: number;
  winRatePct: number;
  totalWonValue: number;
}

export interface ManagementReport {
  periodStart: Date | string;
  periodEnd: Date | string;
  totalSubmitted: number;
  totalWon: number;
  winRatePct: number;
  avgDiscountFromStartPricePct: number;
  totalContractValueWon: number;
  byCategory: CategoryBreakdown[];
}

// ==========================================
// Supplier Comparison Sheet (Конкурентный лист)
// ==========================================

export interface ComparisonSupplierPriceData {
  id?: string;
  lineItemId: string;
  supplierId: string;
  proposedName?: string;
  priceKzt0?: number;
  priceKzt12?: number;
  priceRub0?: number;
  currency?: string;
}

export interface ComparisonLineItemData {
  id?: string;
  order: number;
  mpzCode?: string;
  name: string;
  unit?: string;
  quantity: number;
  budgetPriceKzt0?: number;
  budgetPriceKzt12?: number;
  prices: Record<string, ComparisonSupplierPriceData>; // supplierId => priceData
}

export interface ComparisonSupplierData {
  id?: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  paymentTerms?: string;
  paymentForm?: string;
  bidSecurity?: number;
  discountPercent?: number;
  order: number;
  isSelected?: boolean;
}

export interface ComparisonSupplierSummary {
  supplierId: string;
  name: string;
  totalKzt0: number;
  totalKzt12: number;
  totalRub0: number;
  discountPercent: number;
  totalWithDiscountKzt0: number;
  totalWithDiscountKzt12: number;
  revenueKzt: number;
  grossMarginKzt: number;
  grossMarginPct: number;
  netMarginWithCreditKzt: number;
  netMarginWithCreditPct: number;
  isSelected: boolean;
  isBestPrice: boolean;
}

export interface TenderSupplierComparisonData {
  id?: string;
  tenderId: string;
  companyId?: string;
  tenderTitle?: string;
  tenderNumber?: string;
  tradingPlatform?: string;
  customerName?: string;
  customerBin?: string;
  publishDate?: string;
  deadlineDate?: string;
  totalBudgetKzt0?: number;
  totalBudgetKzt12?: number;
  exchangeRate: number; // RUB to KZT
  notes?: string;
  selectedSupplierId?: string | null;
  creditAmount?: number;
  creditDays?: number;
  creditCost?: number;
  suppliers: ComparisonSupplierData[];
  lineItems: ComparisonLineItemData[];
  summaries?: ComparisonSupplierSummary[];
  createdAt?: string;
  updatedAt?: string;
}




