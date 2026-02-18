import { config } from '../config.js';
import { fetchWithTimeout } from '../utils/http.js';
import { SOFT_BINDING_ALG_ID } from './softbinding.service.js';

type GatewayTag = {
  name: string;
  value: string;
};

type GatewayTxNode = {
  id: string;
  tags?: GatewayTag[];
  block?: {
    height?: number | null;
    timestamp?: number | null;
  } | null;
};

type TagFilter = {
  name: string;
  values: string[];
};

type GatewayGraphQLResponse = {
  data?: {
    transactions?: {
      edges?: Array<{
        node?: GatewayTxNode | null;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

export class GatewayGraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayGraphQLError';
  }
}

export interface SoftBindingManifestResult {
  manifestId: string;
  repoUrl?: string;
  fetchUrl?: string;
  endpoint?: string;
}

export interface ManifestLocatorResult {
  manifestId: string;
  manifestTxId: string;
  repoUrl?: string;
  fetchUrl?: string;
}

function normalizeTagName(value: string): string {
  return value.trim().toLowerCase();
}

function getTagValueByNames(tags: GatewayTag[] | undefined, names: string[]): string | undefined {
  if (!tags || tags.length === 0) {
    return undefined;
  }
  const normalized = new Set(names.map((name) => normalizeTagName(name)));
  for (const tag of tags) {
    if (normalized.has(normalizeTagName(tag.name))) {
      const trimmed = tag.value?.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function getGatewayGraphqlUrl(): string {
  const base = config.GATEWAY_URL.replace(/\/$/, '');
  if (base.endsWith('/graphql')) {
    return base;
  }
  return `${base}/graphql`;
}

async function postGraphqlQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(getGatewayGraphqlUrl(), config.REFERENCE_FETCH_TIMEOUT_MS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      redirect: 'error',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new GatewayGraphQLError('Gateway GraphQL request timed out');
    }
    throw new GatewayGraphQLError(`Gateway GraphQL request failed: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new GatewayGraphQLError(`Gateway GraphQL request failed with status ${response.status}`);
  }

  let body: GatewayGraphQLResponse;
  try {
    body = (await response.json()) as GatewayGraphQLResponse;
  } catch {
    throw new GatewayGraphQLError('Gateway GraphQL returned non-JSON response');
  }

  if (body.errors?.length) {
    const firstMessage = body.errors[0]?.message || 'Unknown GraphQL error';
    throw new GatewayGraphQLError(`Gateway GraphQL error: ${firstMessage}`);
  }

  if (!body.data) {
    throw new GatewayGraphQLError('Gateway GraphQL returned empty data payload');
  }

  return body.data as T;
}

const TRANSACTION_QUERY = `
query TransactionsByTags($first: Int!, $tags: [TagFilter!]!) {
  transactions(first: $first, sort: HEIGHT_DESC, tags: $tags) {
    edges {
      node {
        id
        tags {
          name
          value
        }
        block {
          height
          timestamp
        }
      }
    }
  }
}
`;

async function queryTransactionsByTags(
  tags: TagFilter[],
  first: number
): Promise<GatewayTxNode[]> {
  const data = await postGraphqlQuery<{
    transactions?: {
      edges?: Array<{ node?: GatewayTxNode | null }>;
    };
  }>(TRANSACTION_QUERY, { tags, first });
  return (data.transactions?.edges || [])
    .map((edge) => edge?.node)
    .filter((node): node is GatewayTxNode => !!node);
}

function toSortableHeight(node: GatewayTxNode): number {
  const value = node.block?.height;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return -1;
}

function dedupeAndSort(nodes: GatewayTxNode[]): GatewayTxNode[] {
  const byId = new Map<string, GatewayTxNode>();
  for (const node of nodes) {
    const existing = byId.get(node.id);
    if (!existing || toSortableHeight(node) > toSortableHeight(existing)) {
      byId.set(node.id, node);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const byHeight = toSortableHeight(b) - toSortableHeight(a);
    if (byHeight !== 0) {
      return byHeight;
    }
    return a.id.localeCompare(b.id);
  });
}

function normalizeResultList(results: SoftBindingManifestResult[]): SoftBindingManifestResult[] {
  const seen = new Set<string>();
  const output: SoftBindingManifestResult[] = [];
  for (const result of results) {
    const key = `${result.manifestId}|${result.repoUrl || ''}|${result.fetchUrl || ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(result);
  }
  return output;
}

export async function lookupBySoftBinding(options: {
  alg: string;
  valueB64: string;
  maxResults?: number;
}): Promise<SoftBindingManifestResult[]> {
  const alg = options.alg?.trim();
  const valueB64 = options.valueB64?.trim();
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 10, 100));

  if (!alg || !valueB64) {
    throw new Error('alg and value are required');
  }
  if (alg !== SOFT_BINDING_ALG_ID) {
    throw new Error(`Unsupported soft binding algorithm: ${alg}`);
  }

  const tagFamilies: Array<[string, string]> = [
    ['C2PA-Soft-Binding-Alg', 'C2PA-Soft-Binding-Value'],
    ['C2PA-SoftBinding-Alg', 'C2PA-SoftBinding-Value'],
  ];

  const allNodes: GatewayTxNode[] = [];
  for (const [algTag, valueTag] of tagFamilies) {
    const nodes = await queryTransactionsByTags(
      [
        { name: algTag, values: [alg] },
        { name: valueTag, values: [valueB64] },
      ],
      maxResults
    );
    allNodes.push(...nodes);
  }

  const sortedNodes = dedupeAndSort(allNodes);
  const results: SoftBindingManifestResult[] = [];
  for (const node of sortedNodes) {
    const tags = node.tags || [];
    const manifestId = getTagValueByNames(tags, ['C2PA-Manifest-ID', 'C2PA-Manifest-Id']);
    if (!manifestId) {
      continue;
    }
    const repoUrl = getTagValueByNames(tags, ['C2PA-Manifest-Repo-URL']);
    const fetchUrl = getTagValueByNames(tags, ['C2PA-Manifest-Fetch-URL']);
    results.push({
      manifestId,
      repoUrl,
      fetchUrl,
      endpoint: repoUrl,
    });
    if (results.length >= maxResults) {
      break;
    }
  }

  return normalizeResultList(results).slice(0, maxResults);
}

export async function lookupManifestLocatorById(
  manifestId: string
): Promise<ManifestLocatorResult | null> {
  const normalizedManifestId = manifestId.trim();
  if (!normalizedManifestId) {
    throw new Error('manifestId is required');
  }

  const manifestTagNames = ['C2PA-Manifest-ID', 'C2PA-Manifest-Id'];
  const allNodes: GatewayTxNode[] = [];
  for (const tagName of manifestTagNames) {
    const nodes = await queryTransactionsByTags(
      [{ name: tagName, values: [normalizedManifestId] }],
      5
    );
    allNodes.push(...nodes);
  }

  const [latest] = dedupeAndSort(allNodes);
  if (!latest) {
    return null;
  }

  const tags = latest.tags || [];
  const resolvedManifestId =
    getTagValueByNames(tags, ['C2PA-Manifest-ID', 'C2PA-Manifest-Id']) || normalizedManifestId;
  const repoUrl = getTagValueByNames(tags, ['C2PA-Manifest-Repo-URL']);
  const fetchUrl = getTagValueByNames(tags, ['C2PA-Manifest-Fetch-URL']);

  return {
    manifestId: resolvedManifestId,
    manifestTxId: latest.id,
    repoUrl,
    fetchUrl,
  };
}
