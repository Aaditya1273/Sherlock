/**
 * Firecrawl — Sherlock's browser.
 *
 * Two primitives are enough for the whole product:
 *   search()  discovers which pages are worth reading for a merchant
 *   scrape()  reads one page as LLM-ready markdown
 *
 * Results are persisted in `webSources` (see research.ts), which is both a
 * cache and Sherlock's browser history: a monitored page is re-scraped later
 * and diffed against the stored hash, which is what makes monitoring "alive"
 * rather than a one-shot crawl.
 *
 * Everything returned here is untrusted text and must pass through
 * `core/untrusted.ts` before it is shown to a model.
 */

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';

export class FirecrawlUnavailable extends Error {}

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    throw new FirecrawlUnavailable(
      'FIRECRAWL_API_KEY is not configured. Set it in the Convex dashboard to enable web investigation.'
    );
  }
  return key;
}

async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${FIRECRAWL_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new FirecrawlUnavailable(`Could not reach Firecrawl: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new FirecrawlUnavailable(`Firecrawl returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export interface SearchHit {
  url: string;
  title?: string;
  description?: string;
}

/**
 * Discover candidate sources. Scoped with a site: filter when we know the
 * merchant domain, so Sherlock reads the merchant's own policy rather than a
 * blog's summary of it.
 */
export async function search(query: string, limit = 5): Promise<SearchHit[]> {
  const data = await request<{ data?: { web?: SearchHit[] } | SearchHit[] }>('/search', {
    query,
    limit,
  });
  // The API has returned both shapes across versions; accept either.
  const raw = Array.isArray(data.data) ? data.data : (data.data?.web ?? []);
  return raw
    .filter((hit) => typeof hit?.url === 'string')
    .map((hit) => ({ url: hit.url, title: hit.title, description: hit.description }));
}

export interface ScrapeResult {
  url: string;
  title?: string;
  markdown: string;
}

/** Read one page as markdown. `onlyMainContent` drops nav/footer noise. */
export async function scrape(url: string, maxAgeMs = 0): Promise<ScrapeResult> {
  const data = await request<{
    data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
  }>('/scrape', {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    // Firecrawl serves its own cached copy when maxAge > 0; we pass 0 for
    // monitoring re-checks so a change is actually detected.
    maxAge: maxAgeMs,
  });

  const markdown = data.data?.markdown ?? '';
  if (!markdown.trim()) {
    throw new FirecrawlUnavailable(`Firecrawl returned no readable content for ${url}`);
  }

  return {
    url: data.data?.metadata?.sourceURL ?? url,
    title: data.data?.metadata?.title,
    markdown,
  };
}

/**
 * The queries Sherlock runs to find what a merchant owes.
 *
 * Deliberately a handful of targeted searches rather than a site-wide crawl:
 * the relevant clause lives on a known kind of page, and crawling a whole
 * retailer to find it wastes credits and time.
 */
export function policyQueries(merchant: string, domain?: string): string[] {
  const site = domain ? ` site:${domain}` : '';
  return [
    `${merchant} return and refund policy${site}`,
    `${merchant} price adjustment or price match guarantee${site}`,
    `${merchant} customer service contact email${site}`,
  ];
}
