/**
 * RobotsTxtChecker - Respects target site robots.txt rules before scraping
 */
export class RobotsTxtChecker {
  private static cache: Map<string, string[]> = new Map();

  public static async isAllowed(url: string, userAgent = 'ScraperBot'): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;
      const path = parsedUrl.pathname + parsedUrl.search;

      if (!RobotsTxtChecker.cache.has(origin)) {
        await RobotsTxtChecker.fetchRobotsTxt(origin);
      }

      const disallowedPaths = RobotsTxtChecker.cache.get(origin) || [];
      for (const disallow of disallowedPaths) {
        if (disallow && path.startsWith(disallow)) {
          console.warn(`[RobotsTxtChecker] URL ${url} заблокирован директивой Disallow: ${disallow} в robots.txt`);
          return false;
        }
      }
      return true;
    } catch {
      // If robots.txt check fails or cannot be fetched, default to allowing unless explicit rule matches
      return true;
    }
  }

  private static async fetchRobotsTxt(origin: string): Promise<void> {
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(robotsUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        RobotsTxtChecker.cache.set(origin, []);
        return;
      }

      const text = await res.text();
      const lines = text.split('\n');
      const disallowed: string[] = [];
      let isTargetUserAgent = false;

      for (const line of lines) {
        const clean = line.trim();
        if (clean.toLowerCase().startsWith('user-agent:')) {
          const agent = clean.substring(11).trim();
          isTargetUserAgent = agent === '*' || agent.toLowerCase().includes('scraper');
        } else if (isTargetUserAgent && clean.toLowerCase().startsWith('disallow:')) {
          const path = clean.substring(9).trim();
          if (path) {
            disallowed.push(path);
          }
        }
      }

      RobotsTxtChecker.cache.set(origin, disallowed);
    } catch {
      RobotsTxtChecker.cache.set(origin, []);
    }
  }
}
