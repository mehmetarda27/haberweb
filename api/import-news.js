import { readFile } from "node:fs/promises";

const MAX_NEWS_PER_RUN = 50;
const NEWS_API_EVERYTHING_ENDPOINT = "https://newsapi.org/v2/everything";
const NEWS_API_HEADLINES_ENDPOINT = "https://newsapi.org/v2/top-headlines";
const NEWS_QUERIES = ["teknoloji", "yapay zeka", "oyun", "donanım", "siber güvenlik", "girişim", "mobil"];
const TURKISH_DOMAINS = [
  "webtekno.com",
  "donanimhaber.com",
  "shiftdelete.net",
  "chip.com.tr",
  "log.com.tr",
  "technopat.net",
  "tamindir.com",
  "teknoblog.com",
  "hardwareplus.com.tr",
  "bthaber.com"
];

const ENGLISH_WORDS = new Set([
  "the", "and", "with", "for", "from", "says", "after", "before", "new", "update", "report",
  "startup", "company", "game", "tech", "technology", "launch", "announces", "reveals", "could",
  "will", "is", "are", "was", "were", "has", "have", "this", "that", "you", "your", "as", "by",
  "on", "in", "to", "of", "at", "it", "its", "about", "over", "more", "first", "latest"
]);

const TURKISH_WORDS = new Set([
  "ve", "ile", "için", "bir", "son", "yeni", "gün", "sonra", "önce", "türkiye", "haber",
  "açıklandı", "geldi", "oldu", "var", "yok", "bu", "şu", "göre", "teknoloji", "yapay",
  "zeka", "oyun", "donanım", "girişim", "siber", "güvenlik", "mobil", "yerli", "kullanıcı",
  "şirket", "uygulama", "model", "cihaz", "pazar", "gelişme", "duyurdu", "başladı",
  "özellik", "özellikleri", "çıktı", "tanıttı", "artık", "daha", "olarak", "olan"
]);

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const LETTERS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/g;
const WORDS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]+/g;

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Add it in Vercel Project Settings > Environment Variables for Production, then redeploy.`
    );
  }
  return value;
}

function getOptionalEnv(name) {
  return process.env[name] || "";
}

function getSecretFromRequest(req) {
  if (req.query?.secret) return req.query.secret;

  try {
    const url = new URL(req.url, "https://localhost");
    return url.searchParams.get("secret");
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .match(WORDS) || [];
}

function getLanguageScore(title, description) {
  const text = normalizeText(`${title} ${description}`);
  const tokens = tokenize(text);
  const letters = text.match(LETTERS) || [];
  const turkishChars = text.match(TURKISH_CHARS) || [];
  const englishHits = tokens.filter((token) => token !== "ai" && ENGLISH_WORDS.has(token)).length;
  const turkishHits = tokens.filter((token) => TURKISH_WORDS.has(token)).length;
  const englishRatio = tokens.length ? englishHits / tokens.length : 0;
  const turkishRatio = tokens.length ? turkishHits / tokens.length : 0;
  const turkishCharRatio = letters.length ? turkishChars.length / letters.length : 0;

  return {
    tokens: tokens.length,
    englishHits,
    turkishHits,
    englishRatio,
    turkishRatio,
    turkishCharRatio
  };
}

function isTurkishNews(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description || article.content || article.excerpt);
  if (!title || title.length < 8) return false;

  const score = getLanguageScore(title, description);
  if (score.tokens < 4) return false;
  if (score.englishHits >= 4 && score.englishHits > score.turkishHits) return false;
  if (score.englishRatio >= 0.24 && score.turkishRatio < 0.14 && score.turkishCharRatio < 0.012) return false;
  if (score.turkishHits >= 2 || score.turkishCharRatio >= 0.018) return true;
  if (score.turkishHits >= 1 && score.englishHits <= 1 && score.tokens <= 10) return true;
  return false;
}

function getHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLocaleLowerCase("tr-TR");
  } catch {
    return "";
  }
}

function isTurkishSource(article) {
  const urlHost = getHost(article.url || article.source_url);
  if (!urlHost) return true;
  return TURKISH_DOMAINS.some((domain) => urlHost === domain || urlHost.endsWith(`.${domain}`));
}

function normalizeArticle(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description || article.content);
  const url = normalizeText(article.url);
  const source = normalizeText(article.source?.name);

  return {
    title,
    content: [description || title, source ? `Kaynak: ${source}` : "", url ? `Haber linki: ${url}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    image_url: normalizeText(article.urlToImage),
    source_url: url,
    country: "tr",
    language: "tr",
    published: true
  };
}

function normalizeLocalSeedArticle(article) {
  return {
    title: normalizeText(article.title),
    content: normalizeText(article.content || article.excerpt),
    image_url: normalizeText(article.image || article.image_url),
    source_url: normalizeText(article.source_url || article.url),
    country: "tr",
    language: "tr",
    published: true
  };
}

async function fetchLocalSeedNews() {
  const fileUrl = new URL("../data/news.json", import.meta.url);
  const payload = await readFile(fileUrl, "utf8");
  const items = JSON.parse(payload);
  let skippedEnglish = 0;
  let skippedInvalid = 0;
  const articles = [];

  for (const item of Array.isArray(items) ? items : []) {
    const article = normalizeLocalSeedArticle(item);
    if (!article.title || !article.content) {
      skippedInvalid += 1;
      continue;
    }
    if (!isTurkishNews(article)) {
      skippedEnglish += 1;
      continue;
    }
    articles.push(article);
  }

  return {
    articles: articles.slice(0, MAX_NEWS_PER_RUN),
    fetched: Array.isArray(items) ? items.length : 0,
    skippedEnglish,
    skippedInvalid,
    sourceCount: 1
  };
}

function dedupeArticles(articles) {
  const seen = new Set();
  const result = [];

  for (const article of articles) {
    const key = normalizeText(article.url || article.title).toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(article);
    if (result.length >= MAX_NEWS_PER_RUN * 2) break;
  }

  return result;
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
  if (!response.ok) {
    console.warn("News API everything skipped:", query, response.status, payload?.message || payload);
    return [];
  }
  return Array.isArray(payload?.articles) ? payload.articles : [];
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
  if (!response.ok) {
    console.warn("News API headlines skipped:", query, response.status, payload?.message || payload);
    return [];
  }
  return Array.isArray(payload?.articles) ? payload.articles : [];
}

async function fetchNews(newsApiKey) {
  if (!newsApiKey) {
    console.log("NEWS_API_KEY not set. Using bundled Turkish TechPulse archive.");
    return fetchLocalSeedNews();
  }

  const rawArticles = [];
  let sourceCount = 0;

  for (const query of NEWS_QUERIES) {
    const articles = [
      ...(await fetchEverything(query, newsApiKey)),
      ...(await fetchTopHeadlines(query, newsApiKey))
    ];
    if (articles.length) sourceCount += 1;
    rawArticles.push(...articles);
    if (dedupeArticles(rawArticles).length >= MAX_NEWS_PER_RUN) break;
  }

  const uniqueRawArticles = dedupeArticles(rawArticles);
  let skippedEnglish = 0;
  let skippedInvalid = 0;
  const articles = [];

  for (const rawArticle of uniqueRawArticles) {
    if (!rawArticle?.title || !(rawArticle.description || rawArticle.content)) {
      skippedInvalid += 1;
      continue;
    }

    if (!isTurkishSource(rawArticle) || !isTurkishNews(rawArticle)) {
      skippedEnglish += 1;
      continue;
    }

    const article = normalizeArticle(rawArticle);
    if (!article.title || !article.content) {
      skippedInvalid += 1;
      continue;
    }

    if (!isTurkishNews(article)) {
      skippedEnglish += 1;
      continue;
    }

    articles.push(article);
    if (articles.length >= MAX_NEWS_PER_RUN) break;
  }

  return {
    articles,
    fetched: uniqueRawArticles.length,
    skippedEnglish,
    skippedInvalid,
    sourceCount
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
    const error = new Error(payload?.message || `Supabase failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function countStoredPosts() {
  const rows = await supabaseRequest("posts?select=id", { method: "GET" });
  return Array.isArray(rows) ? rows.length : 0;
}

async function titleExists(title) {
  const rows = await supabaseRequest(
    `posts?select=id&title=eq.${encodeURIComponent(title)}&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function sourceUrlExists(sourceUrl) {
  if (!sourceUrl) return false;

  const rows = await supabaseRequest(
    `posts?select=id&source_url=eq.${encodeURIComponent(sourceUrl)}&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function sourceUrlExistsInContent(sourceUrl) {
  if (!sourceUrl) return false;

  const rows = await supabaseRequest(
    `posts?select=id&content=ilike.*${encodeURIComponent(sourceUrl)}*&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function insertPost(article, options = {}) {
  const { includeSourceUrl = true, includeUrlFields = true, includeLocaleFields = true } = options;
  const post = {
    title: article.title,
    content: article.content,
    image_url: article.image_url,
    published: true
  };

  if (includeSourceUrl && article.source_url) {
    post.source_url = article.source_url;
  }

  if (includeUrlFields && article.source_url) {
    post.url = article.source_url;
    post.sourceUrl = article.source_url;
  }

  if (includeLocaleFields) {
    post.country = "tr";
    post.language = "tr";
  }

  return supabaseRequest("posts", {
    method: "POST",
    body: JSON.stringify([post])
  });
}

function isMissingColumn(error, names) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return names.some((name) => message.includes(name)) && (message.includes("schema cache") || message.includes("column"));
}

async function insertPostWithFallback(article, state) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await insertPost(article, state);
      return;
    } catch (error) {
      if (state.includeLocaleFields && isMissingColumn(error, ["country", "language"])) {
        state.includeLocaleFields = false;
        continue;
      }

      if (state.includeSourceUrl && isMissingColumn(error, ["source_url"])) {
        state.includeSourceUrl = false;
        continue;
      }

      if (state.includeUrlFields && isMissingColumn(error, ["url", "sourceUrl"])) {
        state.includeUrlFields = false;
        continue;
      }

      throw error;
    }
  }

  await insertPost(article, state);
}

export default async function handler(req, res) {
  console.log("TechPulse import-news started:", new Date().toISOString());

  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const expectedSecret = requiredEnv("IMPORT_SECRET");
    const requestSecret = getSecretFromRequest(req);

    if (!requestSecret || requestSecret !== expectedSecret) {
      return sendJson(res, 401, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const newsApiKey = getOptionalEnv("NEWS_API_KEY");
    const { articles, fetched, skippedEnglish, skippedInvalid } = await fetchNews(newsApiKey);
    let inserted = 0;
    let duplicates = 0;
    let finalSkippedEnglish = skippedEnglish;
    const insertState = {
      includeSourceUrl: true,
      includeUrlFields: true,
      includeLocaleFields: true
    };

    for (const article of articles) {
      if (!isTurkishNews(article)) {
        finalSkippedEnglish += 1;
        continue;
      }

      const duplicateByTitle = await titleExists(article.title);
      let duplicateByUrl = false;

      if (insertState.includeSourceUrl && article.source_url) {
        try {
          duplicateByUrl = await sourceUrlExists(article.source_url);
        } catch (error) {
          if (!isMissingColumn(error, ["source_url"])) throw error;
          insertState.includeSourceUrl = false;
          duplicateByUrl = await sourceUrlExistsInContent(article.source_url);
        }
      }

      if (duplicateByTitle || duplicateByUrl) {
        duplicates += 1;
        continue;
      }

      await insertPostWithFallback(article, insertState);
      inserted += 1;
    }

    const totalStored = await countStoredPosts();

    return sendJson(res, 200, {
      ok: true,
      fetched,
      inserted,
      duplicates,
      skippedEnglish: finalSkippedEnglish,
      skippedInvalid,
      totalStored,
      sampleTitles: articles.slice(0, 5).map((article) => article.title)
    });
  } catch (error) {
    console.error("TechPulse import-news failed:", error);
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Import failed"
    });
  }
}
