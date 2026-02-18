import type { Dispatcher } from 'undici';

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  options: RequestInit & { dispatcher?: Dispatcher } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
