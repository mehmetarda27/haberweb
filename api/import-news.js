import { readFile } from "node:fs/promises";

const MAX_NEWS_PER_RUN = 50;
const NEWS_API_EVERYTHING_ENDPOINT = "https://newsapi.org/v2/everything";
const NEWS_API_HEADLINES_ENDPOINT = "https://newsapi.org/v2/top-headlines";

const NEWS_API_QUERIES = ["gündem", "teknoloji", "ekonomi", "spor", "dünya", "sağlık"];
const TURKISH_DOMAINS = [
  "ntv.com.tr",
  "trthaber.com",
  "aa.com.tr",
  "iha.com.tr",
  "haberturk.com",
  "cnnturk.com",
  "hurriyet.com.tr",
  "milliyet.com.tr",
  "sabah.com.tr",
  "sozcu.com.tr",
  "webtekno.com",
  "donanimhaber.com",
  "shiftdelete.net"
];

const RSS_FEEDS = [
  { category: "Gündem", source: "NTV", url: "https://www.ntv.com.tr/gundem.rss" },
  { category: "Teknoloji", source: "NTV", url: "https://www.ntv.com.tr/teknoloji.rss" },
  { category: "Ekonomi", source: "NTV", url: "https://www.ntv.com.tr/ekonomi.rss" },
  { category: "Spor", source: "NTV", url: "https://www.ntv.com.tr/spor.rss" },
  { category: "Dünya", source: "NTV", url: "https://www.ntv.com.tr/dunya.rss" },
  { category: "Sağlık", source: "NTV", url: "https://www.ntv.com.tr/saglik.rss" },
  { category: "Gündem", source: "TRT Haber", url: "https://www.trthaber.com/sondakika.rss" },
  { category: "Gündem", source: "TRT Haber", url: "https://www.trthaber.com/gundem.rss" },
  { category: "Ekonomi", source: "TRT Haber", url: "https://www.trthaber.com/ekonomi.rss" },
  { category: "Spor", source: "TRT Haber", url: "https://www.trthaber.com/spor.rss" },
  { category: "Dünya", source: "TRT Haber", url: "https://www.trthaber.com/dunya.rss" },
  { category: "Sağlık", source: "TRT Haber", url: "https://www.trthaber.com/saglik.rss" },
  { category: "Teknoloji", source: "Webtekno", url: "https://www.webtekno.com/rss.xml" },
  { category: "Teknoloji", source: "Donanım Haber", url: "https://www.donanimhaber.com/rss.xml" }
];

const CATEGORY_FALLBACK_IMAGES = {
  "Gündem": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=85",
  "Teknoloji": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
  "Ekonomi": "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=85",
  "Spor": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=85",
  "Dünya": "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=85",
  "Sağlık": "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1200&q=85",
  "Genel": "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=85"
};

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const LETTERS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/g;
const WORDS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]+/g;
const ENGLISH_WORDS = new Set(["the", "and", "with", "for", "from", "says", "after", "before", "new", "update", "report", "startup", "company", "game", "tech", "technology", "launch", "announces", "reveals", "could", "will", "is", "are", "was", "were", "has", "have", "this", "that", "you", "your", "about", "over", "more", "first", "latest"]);
const TURKISH_WORDS = new Set(["ve", "ile", "için", "bir", "son", "yeni", "gün", "sonra", "önce", "türkiye", "haber", "açıklandı", "geldi", "oldu", "var", "yok", "bu", "şu", "göre", "teknoloji", "ekonomi", "spor", "dünya", "sağlık", "gündem", "yerli", "kullanıcı", "şirket", "uygulama", "model", "pazar", "gelişme", "duyurdu", "başladı", "özellik", "çıktı", "tanıttı", "artık", "daha", "olarak", "olan"]);

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function getOptionalEnv(name) {
  return process.env[name] || "";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ortam değişkeni eksik.`);
  return value;
}

function getSecretFromRequest(req) {
  if (req.query?.secret) return req.query.secret;
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  try {
    return new URL(req.url, "https://localhost").searchParams.get("secret");
  } catch {
    return null;
  }
}

function isAuthorizedRequest(req) {
  if (req.headers?.["x-vercel-cron"] || req.headers?.["X-Vercel-Cron"]) return true;
  const importSecret = getOptionalEnv("IMPORT_SECRET");
  const cronSecret = getOptionalEnv("CRON_SECRET");
  if (!importSecret && !cronSecret) return true;
  const requestSecret = getSecretFromRequest(req);
  return Boolean((importSecret && requestSecret === importSecret) || (cronSecret && requestSecret === cronSecret));
}

function normalizeText(value) {
  return decodeHtml(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function tokenize(value) {
  return normalizeText(value).toLocaleLowerCase("tr-TR").match(WORDS) || [];
}

function isTurkishNews(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description || article.content || article.excerpt);
  if (!title || title.length < 8) return false;

  const text = `${title} ${description}`;
  const tokens = tokenize(text);
  if (tokens.length < 3) return true;

  const letters = text.match(LETTERS) || [];
  const turkishChars = text.match(TURKISH_CHARS) || [];
  const englishHits = tokens.filter((token) => token !== "ai" && ENGLISH_WORDS.has(token)).length;
  const turkishHits = tokens.filter((token) => TURKISH_WORDS.has(token)).length;
  const englishRatio = englishHits / tokens.length;
  const turkishRatio = turkishHits / tokens.length;
  const turkishCharRatio = letters.length ? turkishChars.length / letters.length : 0;

  if (englishHits >= 4 && englishHits > turkishHits) return false;
  if (englishRatio >= 0.24 && turkishRatio < 0.12 && turkishCharRatio < 0.01) return false;
  return true;
}

function getHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLocaleLowerCase("tr-TR");
  } catch {
    return "";
  }
}

function isTurkishSource(article) {
  const host = getHost(article.url || article.source_url || article.link);
  if (!host) return true;
  return TURKISH_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function normalizeCategory(category, article = {}) {
  const direct = normalizeText(category);
  const text = `${direct} ${article.title || ""} ${article.content || ""} ${article.description || ""}`.toLocaleLowerCase("tr-TR");
  if (/(ekonomi|piyasa|borsa|dolar|euro|altın|faiz|enflasyon|finans)/i.test(text)) return "Ekonomi";
  if (/(spor|futbol|basketbol|voleybol|maç|lig|transfer|takım)/i.test(text)) return "Spor";
  if (/(dünya|avrupa|amerika|rusya|ukrayna|gazze|çin|abd|iran|israil)/i.test(text)) return "Dünya";
  if (/(sağlık|hastane|doktor|ilaç|tedavi|virüs|aşı|uzman)/i.test(text)) return "Sağlık";
  if (/(teknoloji|yapay zeka|telefon|uygulama|yazılım|donanım|siber|robot|uzay)/i.test(text)) return "Teknoloji";
  return direct || "Gündem";
}

function isValidImageUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fallbackImageForCategory(category) {
  return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES.Genel;
}

function firstValidImage(...values) {
  return values.map((value) => normalizeText(value)).find(isValidImageUrl) || "";
}

function extractTag(xml, tagName) {
  const escaped = tagName.replace(":", "\\:");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function extractAttr(xml, tagName, attrName) {
  const escaped = tagName.replace(":", "\\:");
  const match = xml.match(new RegExp(`<${escaped}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function extractImageFromHtml(value) {
  const match = String(value || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? decodeHtml(match[1]) : "";
}

function parseRssItems(xml, feed) {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return itemBlocks.map((item) => {
    const description = extractTag(item, "description");
    const content = extractTag(item, "content:encoded") || description;
    const enclosure = extractAttr(item, "enclosure", "url");
    const mediaContent = extractAttr(item, "media:content", "url") || extractAttr(item, "media:thumbnail", "url");
    const image = firstValidImage(mediaContent, enclosure, extractImageFromHtml(content), extractImageFromHtml(description));
    return normalizeArticle({
      title: extractTag(item, "title"),
      description,
      content,
      url: extractTag(item, "link") || extractTag(item, "guid"),
      publishedAt: extractTag(item, "pubDate") || extractTag(item, "dc:date"),
      category: feed.category || extractTag(item, "category"),
      source: feed.source,
      image,
      enclosure,
      mediaContent
    });
  });
}

function normalizeArticle(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description || article.content || article.excerpt || title);
  const sourceUrl = normalizeText(article.url || article.source_url || article.link);
  const source = normalizeText(article.source?.name || article.source || article.sourceName) || sourceLabelFromUrl(sourceUrl) || "Türkçe Haber";
  const category = normalizeCategory(article.category, article);
  const image = firstValidImage(article.finalImage, article.image, article.urlToImage, article.image_url, article.imageUrl, article.enclosure, article.mediaContent, article.media_content, article.thumbnail, article.ogImage, article["og:image"]);
  const finalImage = image || fallbackImageForCategory(category);
  const publishedAt = article.publishedAt || article.published_at || article.pubDate || article.created_at || article.date || new Date().toISOString();

  return {
    title,
    excerpt: description.slice(0, 220),
    content: [description || title, source ? `Kaynak: ${source}` : "", sourceUrl ? `Haber linki: ${sourceUrl}` : ""].filter(Boolean).join("\n\n"),
    category,
    source,
    source_url: sourceUrl,
    url: sourceUrl,
    image: finalImage,
    imageUrl: finalImage,
    image_url: finalImage,
    finalImage,
    publishedAt,
    created_at: publishedAt,
    published: true,
    country: "tr",
    language: "tr"
  };
}

function sourceLabelFromUrl(value) {
  const host = getHost(value);
  if (!host) return "";
  return host.split(".").slice(0, -1).join(".") || host;
}

function dedupeArticles(articles) {
  const seen = new Set();
  const result = [];
  for (const article of articles) {
    const key = normalizeText(article.source_url || article.url || article.title).toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(article);
  }
  return result;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TechPulseBot/1.0 (+https://haberweb.vercel.app)",
        Accept: "application/rss+xml, application/xml, text/xml, */*"
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRssNews() {
  const articles = [];
  let fetched = 0;
  let sourceCount = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const response = await fetchWithTimeout(feed.url);
      if (!response.ok) continue;
      const xml = await response.text();
      const items = parseRssItems(xml, feed);
      if (items.length) sourceCount += 1;
      fetched += items.length;
      articles.push(...items);
      if (dedupeArticles(articles).length >= MAX_NEWS_PER_RUN) break;
    } catch {
      // Kaynak geçici olarak yanıt vermeyebilir; diğer kaynaklarla devam edilir.
    }
  }

  return { articles: dedupeArticles(articles).slice(0, MAX_NEWS_PER_RUN), fetched, sourceCount };
}

async function fetchEverything(query, newsApiKey) {
  const params = new URLSearchParams({
    q: query,
    language: "tr",
    domains: TURKISH_DOMAINS.join(","),
    sortBy: "publishedAt",
    pageSize: String(MAX_NEWS_PER_RUN),
    apiKey: newsApiKey
  });
  const response = await fetch(`${NEWS_API_EVERYTHING_ENDPOINT}?${params.toString()}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) return [];
  return Array.isArray(payload?.articles) ? payload.articles.map(normalizeArticle) : [];
}

async function fetchTopHeadlines(query, newsApiKey) {
  const params = new URLSearchParams({
    q: query,
    country: "tr",
    pageSize: String(MAX_NEWS_PER_RUN),
    apiKey: newsApiKey
  });
  const response = await fetch(`${NEWS_API_HEADLINES_ENDPOINT}?${params.toString()}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok) return [];
  return Array.isArray(payload?.articles) ? payload.articles.map(normalizeArticle) : [];
}

async function fetchNewsApiNews(newsApiKey) {
  if (!newsApiKey) return { articles: [], fetched: 0, sourceCount: 0 };
  const articles = [];
  for (const query of NEWS_API_QUERIES) {
    articles.push(...(await fetchEverything(query, newsApiKey)), ...(await fetchTopHeadlines(query, newsApiKey)));
    if (dedupeArticles(articles).length >= MAX_NEWS_PER_RUN) break;
  }
  const unique = dedupeArticles(articles);
  return { articles: unique.slice(0, MAX_NEWS_PER_RUN), fetched: unique.length, sourceCount: unique.length ? 1 : 0 };
}

async function fetchLocalSeedNews() {
  const fileUrl = new URL("../data/news.json", import.meta.url);
  const payload = await readFile(fileUrl, "utf8");
  const items = JSON.parse(payload);
  const articles = (Array.isArray(items) ? items : []).map(normalizeArticle);
  return { articles, fetched: articles.length, sourceCount: articles.length ? 1 : 0 };
}

async function collectNews() {
  const newsApiKey = getOptionalEnv("NEWS_API_KEY");
  const [rssResult, apiResult, localResult] = await Promise.allSettled([
    fetchRssNews(),
    fetchNewsApiNews(newsApiKey),
    fetchLocalSeedNews()
  ]);

  const successful = [rssResult, apiResult, localResult].filter((result) => result.status === "fulfilled").map((result) => result.value);
  const rawArticles = successful.flatMap((result) => result.articles);
  let skippedEnglish = 0;
  let skippedInvalid = 0;
  const articles = [];

  for (const article of dedupeArticles(rawArticles)) {
    if (!article.title || !article.content) {
      skippedInvalid += 1;
      continue;
    }
    if (!isTurkishSource(article) || !isTurkishNews(article)) {
      skippedEnglish += 1;
      continue;
    }
    articles.push(article);
    if (articles.length >= MAX_NEWS_PER_RUN) break;
  }

  return {
    articles,
    fetched: successful.reduce((sum, result) => sum + result.fetched, 0),
    skippedEnglish,
    skippedInvalid,
    sourceCount: successful.reduce((sum, result) => sum + result.sourceCount, 0)
  };
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.message || `Supabase ${response.status} hatası`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function isMissingColumn(error, names) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return names.some((name) => message.includes(name)) && (message.includes("schema cache") || message.includes("column"));
}

async function titleExists(title) {
  const rows = await supabaseRequest(`posts?select=id&title=eq.${encodeURIComponent(title)}&limit=1`, { method: "GET" });
  return Array.isArray(rows) && rows.length > 0;
}

async function sourceUrlExists(sourceUrl) {
  if (!sourceUrl) return false;
  const rows = await supabaseRequest(`posts?select=id&source_url=eq.${encodeURIComponent(sourceUrl)}&limit=1`, { method: "GET" });
  return Array.isArray(rows) && rows.length > 0;
}

async function countStoredPosts() {
  const rows = await supabaseRequest("posts?select=id", { method: "GET" });
  return Array.isArray(rows) ? rows.length : 0;
}

function buildPost(article, state) {
  const post = {
    title: article.title,
    content: article.content,
    published: true
  };
  if (state.includeImageUrlSnake) post.image_url = article.finalImage;
  if (state.includeImageUrlCamel) post.imageUrl = article.finalImage;
  if (state.includeFinalImage) post.finalImage = article.finalImage;
  if (state.includeSourceUrl && article.source_url) post.source_url = article.source_url;
  if (state.includeUrlFields && article.source_url) {
    post.url = article.source_url;
    post.sourceUrl = article.source_url;
  }
  if (state.includeCategory) post.category = article.category;
  if (state.includeSource) post.source = article.source;
  if (state.includePublishedAt) post.published_at = article.publishedAt;
  if (state.includeLocaleFields) {
    post.country = "tr";
    post.language = "tr";
  }
  return post;
}

async function insertPostWithFallback(article, state) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await supabaseRequest("posts", {
        method: "POST",
        body: JSON.stringify([buildPost(article, state)])
      });
      return;
    } catch (error) {
      if (state.includeLocaleFields && isMissingColumn(error, ["country", "language"])) state.includeLocaleFields = false;
      else if (state.includeSourceUrl && isMissingColumn(error, ["source_url"])) state.includeSourceUrl = false;
      else if (state.includeUrlFields && isMissingColumn(error, ["url", "sourceUrl"])) state.includeUrlFields = false;
      else if (state.includeImageUrlCamel && isMissingColumn(error, ["imageUrl"])) state.includeImageUrlCamel = false;
      else if (state.includeImageUrlSnake && isMissingColumn(error, ["image_url"])) state.includeImageUrlSnake = false;
      else if (state.includeFinalImage && isMissingColumn(error, ["finalImage"])) state.includeFinalImage = false;
      else if (state.includeCategory && isMissingColumn(error, ["category"])) state.includeCategory = false;
      else if (state.includeSource && isMissingColumn(error, ["source"])) state.includeSource = false;
      else if (state.includePublishedAt && isMissingColumn(error, ["published_at"])) state.includePublishedAt = false;
      else throw error;
    }
  }
}

export async function runImportNews() {
  const { articles, fetched, skippedEnglish, skippedInvalid, sourceCount } = await collectNews();

  if (!getOptionalEnv("SUPABASE_URL") || !getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    return {
      ok: false,
      fetched,
      inserted: 0,
      duplicates: 0,
      error: "SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik. Haberler çekildi ancak veritabanına yazılamadı.",
      skippedEnglish,
      skippedInvalid,
      sourceCount,
      sampleTitles: articles.slice(0, 5).map((article) => article.title)
    };
  }

  let inserted = 0;
  let duplicates = 0;
  const state = {
    includeImageUrlSnake: true,
    includeImageUrlCamel: true,
    includeFinalImage: true,
    includeSourceUrl: true,
    includeUrlFields: true,
    includeCategory: true,
    includeSource: true,
    includePublishedAt: true,
    includeLocaleFields: true
  };

  for (const article of articles) {
    const duplicateByTitle = await titleExists(article.title);
    let duplicateByUrl = false;
    if (state.includeSourceUrl && article.source_url) {
      try {
        duplicateByUrl = await sourceUrlExists(article.source_url);
      } catch (error) {
        if (!isMissingColumn(error, ["source_url"])) throw error;
        state.includeSourceUrl = false;
      }
    }
    if (duplicateByTitle || duplicateByUrl) {
      duplicates += 1;
      continue;
    }
    await insertPostWithFallback(article, state);
    inserted += 1;
  }

  const totalStored = await countStoredPosts().catch(() => null);
  return {
    ok: true,
    fetched,
    inserted,
    duplicates,
    skippedEnglish,
    skippedInvalid,
    sourceCount,
    totalStored,
    sampleTitles: articles.slice(0, 5).map((article) => article.title)
  };
}

export function ensureAuthorized(req) {
  return isAuthorizedRequest(req);
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, { ok: false, error: "Bu endpoint yalnızca GET veya POST kabul eder." });
  }

  try {
    if (!ensureAuthorized(req)) {
      return sendJson(res, 401, { ok: false, error: "Yetkisiz istek. IMPORT_SECRET değerini kontrol edin." });
    }
    return sendJson(res, 200, await runImportNews());
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      error: error.message || "Haber içe aktarma sırasında hata oluştu."
    });
  }
}
