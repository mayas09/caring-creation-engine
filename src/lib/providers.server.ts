/**
 * External provider access (server-only).
 * Firecrawl = real web search + page scraping (evidence with a source URL).
 * Mailgun  = real outbound email.
 * Both are routed through the Lovable connector gateway.
 */

const GATEWAY = "https://connector-gateway.lovable.dev";

function keys(name: "FIRECRAWL_API_KEY" | "MAILGUN_API_KEY") {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env[name];
  if (!lovable || !connection) {
    throw new Error(
      name === "MAILGUN_API_KEY"
        ? "Email provider is not connected."
        : "Web research provider is not connected.",
    );
  }
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": connection,
  };
}

export type SearchHit = { url: string; title: string; description: string };

/** Live web search. Results carry real URLs that can be cited as sources. */
export async function webSearch(query: string, limit = 8): Promise<SearchHit[]> {
  const res = await fetch(`${GATEWAY}/firecrawl/v2/search`, {
    method: "POST",
    headers: { ...keys("FIRECRAWL_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Web search failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as {
    success?: boolean;
    data?: { web?: SearchHit[] } | SearchHit[];
  };
  const raw = Array.isArray(json.data) ? json.data : (json.data?.web ?? []);
  return raw
    .filter((r) => Boolean(r?.url))
    .map((r) => ({ url: r.url, title: r.title ?? "", description: r.description ?? "" }));
}

export type ScrapeResult = {
  url: string;
  statusCode: number | null;
  title: string;
  markdown: string;
  html: string;
  links: string[];
};

/** Scrapes one page. Everything returned was actually observed at `url`. */
export async function scrapePage(url: string): Promise<ScrapeResult> {
  const res = await fetch(`${GATEWAY}/firecrawl/v2/scrape`, {
    method: "POST",
    headers: { ...keys("FIRECRAWL_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links", "html"],
      onlyMainContent: false,
      timeout: 30000,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Scrape failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as Record<string, unknown>;
  const doc = ((json["data"] as Record<string, unknown> | undefined) ?? json) as {
    markdown?: string;
    html?: string;
    links?: string[];
    metadata?: { title?: string; statusCode?: number; sourceURL?: string };
  };
  return {
    url: doc.metadata?.sourceURL ?? url,
    statusCode: doc.metadata?.statusCode ?? null,
    title: doc.metadata?.title ?? "",
    markdown: (doc.markdown ?? "").slice(0, 20000),
    html: (doc.html ?? "").slice(0, 40000),
    links: (doc.links ?? []).slice(0, 400),
  };
}

export const THIRD_PARTY_PLATFORMS: Array<{ key: string; label: string }> = [
  { key: "ubereats.com", label: "Uber Eats" },
  { key: "doordash.com", label: "DoorDash" },
  { key: "grubhub.com", label: "Grubhub" },
  { key: "postmates.com", label: "Postmates" },
  { key: "deliveroo.", label: "Deliveroo" },
  { key: "justeat.", label: "Just Eat" },
  { key: "takeaway.com", label: "Takeaway" },
  { key: "glovoapp.com", label: "Glovo" },
  { key: "talabat.com", label: "Talabat" },
  { key: "yassir.", label: "Yassir Express" },
  { key: "hungerstation", label: "HungerStation" },
  { key: "toasttab.com", label: "Toast" },
  { key: "clover.com", label: "Clover" },
  { key: "square.site", label: "Square Online" },
  { key: "chownow.com", label: "ChowNow" },
  { key: "slicelife.com", label: "Slice" },
  { key: "menufy.com", label: "Menufy" },
  { key: "opentable.com", label: "OpenTable" },
];

export type PageFacts = {
  reachable: boolean;
  statusCode: number | null;
  title: string;
  menuLinks: string[];
  orderLinks: string[];
  thirdParty: string[];
  hasOrderWord: boolean;
  hasMenuWord: boolean;
  socials: { instagram: string | null; facebook: string | null; tiktok: string | null };
  phones: string[];
  emails: string[];
};

/** Deterministic facts extracted from a scraped page — no model involved. */
export function extractPageFacts(page: ScrapeResult): PageFacts {
  const lower = `${page.markdown}\n${page.html}`.toLowerCase();
  const links = page.links.map((l) => l.toLowerCase());

  const thirdParty = Array.from(
    new Set(
      THIRD_PARTY_PLATFORMS.filter(
        (p) => links.some((l) => l.includes(p.key)) || lower.includes(p.key),
      ).map((p) => p.label),
    ),
  );

  const menuLinks = page.links.filter((l) => /menu|carte|قائمة/i.test(l)).slice(0, 10);
  const orderLinks = page.links.filter((l) => /order|commande|checkout|cart/i.test(l)).slice(0, 10);

  const emails = Array.from(
    new Set((page.markdown.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? []).slice(0, 5)),
  ).filter((e) => !/\.(png|jpg|svg|webp)$/i.test(e));
  const phones = Array.from(
    new Set((page.markdown.match(/\+?\d[\d\s().-]{7,16}\d/g) ?? []).map((p) => p.trim()).slice(0, 5)),
  );

  const find = (host: string) => page.links.find((l) => l.toLowerCase().includes(host)) ?? null;

  return {
    reachable: page.statusCode === null || page.statusCode < 400,
    statusCode: page.statusCode,
    title: page.title,
    menuLinks,
    orderLinks,
    thirdParty,
    hasOrderWord: /\border online\b|\border now\b|commander en ligne/i.test(page.markdown),
    hasMenuWord: /\bmenu\b|\bcarte\b/i.test(page.markdown),
    socials: {
      instagram: find("instagram.com"),
      facebook: find("facebook.com"),
      tiktok: find("tiktok.com"),
    },
    phones,
    emails,
  };
}

export type MailgunConfig = { domain: string; from: string; replyTo?: string | null };

export async function listMailgunDomains(): Promise<Array<{ name: string; state: string; type: string }>> {
  const res = await fetch(`${GATEWAY}/mailgun/domains`, { headers: keys("MAILGUN_API_KEY") });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mailgun domains failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { items?: Array<{ name: string; state: string; type: string }> };
  return (json.items ?? []).map((d) => ({ name: d.name, state: d.state, type: d.type }));
}

/** Sends a real email. Returns the provider message id. */
export async function sendEmail(
  cfg: MailgunConfig,
  msg: { to: string; subject: string; text: string; tags?: string[] },
): Promise<{ id: string; message: string }> {
  const form = new URLSearchParams();
  form.set("from", cfg.from);
  form.set("to", msg.to);
  form.set("subject", msg.subject);
  form.set("text", msg.text);
  if (cfg.replyTo) form.set("h:Reply-To", cfg.replyTo);
  for (const t of msg.tags ?? []) form.append("o:tag", t);

  const res = await fetch(`${GATEWAY}/mailgun/${encodeURIComponent(cfg.domain)}/messages`, {
    method: "POST",
    headers: { ...keys("MAILGUN_API_KEY"), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Email send failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { id?: string; message?: string };
  return { id: json.id ?? "", message: json.message ?? "" };
}
