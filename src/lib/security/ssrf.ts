import { URL } from 'url';
import dns from 'dns';
import net from 'net';

/**
 * Checks if a given IP address is private, loopback, link-local, or cloud-metadata.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;

  // IPv4 check
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(isNaN)) return true;

    const [o1, o2] = parts;

    // Loopback 127.0.0.0/8 & 0.0.0.0/8
    if (o1 === 127 || o1 === 0) return true;

    // RFC 1918 Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;

    // Cloud metadata link-local: 169.254.0.0/16
    if (o1 === 169 && o2 === 254) return true;

    // Broadcast / Multicast / Future use
    if (o1 >= 224) return true;

    return false;
  }

  // IPv6 check
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe80:') || // Link-local
      normalized.startsWith('fc00:') || // Unique local address (ULA)
      normalized.startsWith('fd00:') ||
      normalized.startsWith('ff00:') // Multicast
    ) {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:192.168.1.1)
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.substring(7);
      return isPrivateIp(v4Part);
    }

    return false;
  }

  return true;
}

/**
 * Validates target URL against Server-Side Request Forgery (SSRF) vulnerabilities.
 * Rejects private, loopback, link-local IPs and internal Docker container hostnames.
 */
export function validateUrlForSSRF(targetUrl: string): { allowed: boolean; reason?: string } {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { allowed: false, reason: 'URL не указан или имеет неверный тип' };
  }

  // Handle template placeholders e.g. {page}
  const cleanUrl = targetUrl.replace(/\{page\}/g, '1').trim();

  let parsed: URL;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return { allowed: false, reason: 'Некорректный формат URL' };
  }

  // Restrict to HTTP and HTTPS protocols only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: `Разрешены только протоколы http: и https: (получен ${parsed.protocol})` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Internal docker service names & common local hostnames
  const forbiddenHosts = [
    'localhost',
    'localhost.localdomain',
    'db',
    'postgres',
    'redis',
    'worker',
    'web',
    'tender_web',
    'tender_worker',
    'tender_postgres',
    'tender_redis'
  ];

  if (forbiddenHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { allowed: false, reason: `Обращение к внутреннему хосту '${hostname}' заблокировано по соображениям безопасности (SSRF Protection)` };
  }

  // Direct IP address check
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { allowed: false, reason: `Обращение к приватному/локальному IP-адресу (${hostname}) запрещено` };
    }
  }

  return { allowed: true };
}

/**
 * Resolves domain hostname via DNS and verifies that all resolved IPs are public.
 */
export async function resolveAndValidateHost(hostname: string): Promise<{ allowed: boolean; reason?: string; addresses?: string[] }> {
  const basicCheck = validateUrlForSSRF(`http://${hostname}`);
  if (!basicCheck.allowed) {
    return basicCheck;
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { allowed: false, reason: `Прямой IP ${hostname} находится в приватном диапазоне` };
    }
    return { allowed: true, addresses: [hostname] };
  }

  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { allowed: false, reason: `Не удалось разрешить домен ${hostname} через DNS` };
    }

    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        return {
          allowed: false,
          reason: `Домен ${hostname} разрешается в приватный IP-адрес ${record.address} (SSRF DNS Rebinding Protection)`
        };
      }
    }

    return { allowed: true, addresses: addresses.map(a => a.address) };
  } catch (err: any) {
    return { allowed: false, reason: `Ошибка DNS-резолвинга домена ${hostname}: ${err?.message || err}` };
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  finalUrl: string;
  buffer: Buffer;
  text: string;
  contentType: string;
}

/**
 * Performs a secure HTTP(S) GET request with:
 * - Protocol enforcement (http/https only)
 * - DNS pre-resolution & IP validation before request
 * - Hop-by-hop redirect verification against private/local networks
 * - 10-second default timeout
 * - 5 MB default size limit
 */
export async function safeFetchUrl(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxSizeBytes = options.maxSizeBytes ?? 5 * 1024 * 1024; // 5 MB
  const maxRedirects = options.maxRedirects ?? 5;

  let currentUrl = initialUrl.trim();
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    // 1. Static SSRF validation
    const ssrfCheck = validateUrlForSSRF(currentUrl);
    if (!ssrfCheck.allowed) {
      throw new Error(`[SSRF Blocked] ${ssrfCheck.reason}`);
    }

    const parsed = new URL(currentUrl);

    // 2. DNS Resolution & IP Range validation before request
    const dnsCheck = await resolveAndValidateHost(parsed.hostname);
    if (!dnsCheck.allowed) {
      throw new Error(`[SSRF Blocked] ${dnsCheck.reason}`);
    }

    // 3. Fetch with manual redirect handling to check every hop
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 TenderAI-ComplianceChecker/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          ...(options.headers || {})
        }
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutTimer);
      if (fetchErr.name === 'AbortError') {
        throw new Error(`Превышен лимит времени ожидания ответа (${timeoutMs / 1000} сек) при загрузке ${currentUrl}`);
      }
      throw fetchErr;
    }

    clearTimeout(timeoutTimer);

    // 4. Handle HTTP Redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Получен редирект ${response.status} без заголовка Location от ${currentUrl}`);
      }

      // Resolve relative redirect URL
      const redirectUrl = new URL(location, currentUrl).toString();
      redirectCount++;

      if (redirectCount > maxRedirects) {
        throw new Error(`Превышено максимальное количество перенаправлений (${maxRedirects})`);
      }

      currentUrl = redirectUrl;
      continue;
    }

    // 5. Enforce Content-Length header limit before body read
    const headerContentLength = response.headers.get('content-length');
    if (headerContentLength && parseInt(headerContentLength, 10) > maxSizeBytes) {
      throw new Error(`Размер ответа (${headerContentLength} байт) превышает допустимый лимит (${maxSizeBytes} байт)`);
    }

    // 6. Stream and buffer body with hard size clamp
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxSizeBytes) {
      throw new Error(`Загруженный размер контента (${buffer.length} байт) превысил максимальный лимит ${maxSizeBytes} байт`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = buffer.toString('utf8');

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: currentUrl,
      buffer,
      text,
      contentType
    };
  }

  throw new Error(`Не удалось загрузить URL после ${maxRedirects} перенаправлений`);
}

