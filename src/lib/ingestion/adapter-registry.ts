import { BaseTenderAdapter } from './base.adapter';
import { GoszakupApiAdapter } from './goszakup.adapter';
import { SamrukApiAdapter } from './samruk.adapter';

export type AdapterConstructor = new () => BaseTenderAdapter;

const API_ADAPTER_REGISTRY: Record<string, AdapterConstructor> = {
  GOSZAKUP: GoszakupApiAdapter,
  SAMRUK_KAZYNA: SamrukApiAdapter,
};

/**
 * Register a new API adapter constructor dynamically.
 * Use when implementing new procurement API integrations.
 */
export function registerApiAdapter(name: string, adapterClass: AdapterConstructor) {
  API_ADAPTER_REGISTRY[name] = adapterClass;
}

/**
 * Unregister an API adapter by source name.
 */
export function unregisterApiAdapter(name: string) {
  delete API_ADAPTER_REGISTRY[name];
}

/**
 * Factory function to retrieve an initialized API adapter for a source.
 * Returns null if no registered API adapter exists for the given source name.
 */
export function getApiAdapter(source: string): BaseTenderAdapter | null {
  const AdapterClass = API_ADAPTER_REGISTRY[source];
  return AdapterClass ? new AdapterClass() : null;
}

/**
 * Get list of all registered API source names.
 */
export function listRegisteredApiSources(): string[] {
  return Object.keys(API_ADAPTER_REGISTRY);
}
