/** Typed HTTP client for the trusthash sidecar manifest repository and search API. */
export class ManifestRepoClient {
  constructor(
    private baseUrl: string,
    private timeoutMs: number
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** GET /v1/manifests/:manifestId — retrieve manifest store bytes. */
  async getManifest(manifestId: string): Promise<Buffer> {
    const res = await this.fetch(`/manifests/${encodeURIComponent(manifestId)}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** GET /v1/search-similar — search by perceptual hash. */
  async searchSimilar(
    phash: string,
    options?: { threshold?: number; limit?: number }
  ): Promise<{
    results: Array<{
      manifestTxId: string;
      manifestId: string;
      distance: number;
      contentType: string;
      ownerAddress?: string;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams({ phash });
    if (options?.threshold !== undefined) params.set('threshold', String(options.threshold));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));

    const res = await this.fetch(`/search-similar?${params}`);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        results: Array<{
          manifestTxId: string;
          manifestId: string;
          distance: number;
          contentType: string;
          ownerAddress?: string;
        }>;
        total: number;
      };
    };
    return json.data;
  }

  /** POST /v1/matches/byContent — upload image and search by computed binding. */
  async matchByContent(
    imageBuffer: Buffer | Uint8Array,
    options?: { maxResults?: number }
  ): Promise<{ matches: Array<{ manifestId: string; similarityScore?: number }> }> {
    const params = new URLSearchParams();
    if (options?.maxResults !== undefined) params.set('maxResults', String(options.maxResults));

    const url = `/matches/byContent${params.toString() ? `?${params}` : ''}`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: imageBuffer as unknown as BodyInit,
    });
    return res.json() as Promise<{
      matches: Array<{ manifestId: string; similarityScore?: number }>;
    }>;
  }

  /** GET /v1/matches/byBinding — lookup by soft binding algorithm + value. */
  async matchByBinding(
    alg: string,
    value: string,
    options?: { maxResults?: number }
  ): Promise<{ matches: Array<{ manifestId: string; endpoint?: string }> }> {
    const params = new URLSearchParams({ alg, value });
    if (options?.maxResults !== undefined) params.set('maxResults', String(options.maxResults));

    const res = await this.fetch(`/matches/byBinding?${params}`);
    return res.json() as Promise<{
      matches: Array<{ manifestId: string; endpoint?: string }>;
    }>;
  }

  /** GET /health — sidecar health check. */
  async health(): Promise<boolean> {
    try {
      // Health is at root, not under /v1
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl.replace(/\/v1$/, '')}/health`, {
          signal: controller.signal,
        });
        return res.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`ManifestRepo ${path}: HTTP ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
