export type ScraperRenderMode = 'STATIC' | 'JS_RENDERED';

export type TransformName =
  | 'trim'
  | 'stripHtml'
  | 'absoluteUrl'
  | 'parseAmountKzt'
  | 'parseDateRu'
  | 'parseDateISO'
  | 'regexExtract';

export interface FieldExtractionRule {
  selector: string;
  attr?: 'text' | 'html' | string;
  transform?: TransformName;
  transformParam?: string;
}

export interface PaginationConfig {
  startPage: number;
  maxPages: number;
  stopOnEmpty?: boolean;
}

export interface DetailPageConfig {
  enabled: boolean;
  fields?: Record<string, FieldExtractionRule>;
}

export interface ScraperSourceConfigData {
  id?: string;
  dataSourceId: string;
  renderMode: ScraperRenderMode;
  listUrlTemplate: string;
  pagination: PaginationConfig;
  listItemSelector: string;
  fields: Record<string, FieldExtractionRule>;
  detailPage?: DetailPageConfig;
  respectRobotsTxt?: boolean;
  active?: boolean;
}

export interface TestScraperRequest {
  listUrlTemplate: string;
  renderMode: ScraperRenderMode;
  listItemSelector: string;
  fields: Record<string, FieldExtractionRule>;
  detailPage?: DetailPageConfig;
  respectRobotsTxt?: boolean;
}

export interface TestScraperResponse {
  success: boolean;
  itemsFound: number;
  durationMs: number;
  warnings: string[];
  sampleTenders: any[];
  error?: string;
}
