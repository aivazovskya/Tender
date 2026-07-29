import { URL } from 'url';

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

  // Check IPv4 addresses
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const o1 = parseInt(match[1], 10);
    const o2 = parseInt(match[2], 10);

    // Loopback 127.0.0.0/8 & 0.0.0.0/8
    if (o1 === 127 || o1 === 0) {
      return { allowed: false, reason: 'Обращение к loopback IP (127.0.0.0/8, 0.0.0.0) запрещено' };
    }

    // RFC 1918 Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (o1 === 10) {
      return { allowed: false, reason: 'Обращение к приватной сети 10.0.0.0/8 запрещено' };
    }
    if (o1 === 172 && o2 >= 16 && o2 <= 31) {
      return { allowed: false, reason: 'Обращение к приватной сети 172.16.0.0/12 запрещено' };
    }
    if (o1 === 192 && o2 === 168) {
      return { allowed: false, reason: 'Обращение к приватной сети 192.168.0.0/16 запрещено' };
    }

    // Cloud metadata link-local: 169.254.0.0/16 (e.g. 169.254.169.254)
    if (o1 === 169 && o2 === 254) {
      return { allowed: false, reason: 'Обращение к link-local / Cloud Metadata IP (169.254.0.0/16) запрещено' };
    }
  }

  // Check IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:') || hostname.startsWith('fc00:')) {
    return { allowed: false, reason: 'Обращение к локальным IPv6 адресам запрещено' };
  }

  return { allowed: true };
}
