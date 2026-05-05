const MAX_NEWS_PER_RUN = 50;
const NEWS_API_ENDPOINT = "https://newsapi.org/v2/top-headlines";
// External cron target, every 2 hours:
// https://haberweb.vercel.app/api/import-news?secret=IMPORT_SECRET
const TURKISH_SIGNAL_PATTERN = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]|\b(ve|ile|i\u00e7in|bir|son|yeni|g\u00fcn|sonra|\u00f6nce|t\u00fcrkiye|ankara|istanbul|izmir|haber|a\u00e7\u0131kland\u0131|geldi|oldu|var|yok|en|bu|\u015fu|g\u00f6re|karar|ba\u015fkan|bakan|d\u00fcnya|ekonomi|spor|teknoloji)\b/i;
const ENGLISH_SIGNAL_PATTERN = /\b(the|and|with|after|before|from|over|under|into|about|this|that|will|could|would|says|said|new|latest|breaking|report|update)\b/i;

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
  return String(value || "").trim();
}

function normalizeArticle(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description);
  const content = normalizeText(article.content);
  const url = normalizeText(article.url);
  const source = normalizeText(article.source?.name);

  return {
    title,
    content: [description, content, source ? `Kaynak: ${source}` : "", url ? `Haber linki: ${url}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    image_url: normalizeText(article.urlToImage),
    source_url: url,
    country: "tr",
    language: "tr",
    published: true
  };
}

function isLikelyTurkishArticle(article) {
  const title = normalizeText(article.title).toLocaleLowerCase("tr-TR");
  const content = normalizeText(article.content).toLocaleLowerCase("tr-TR");
  const haystack = `${title} ${content}`;
  if (!title) return false;
  if (TURKISH_SIGNAL_PATTERN.test(haystack)) return true;
  return !ENGLISH_SIGNAL_PATTERN.test(title);
}

async function fetchNews(newsApiKey) {
  const params = new URLSearchParams({
    country: "tr",
    pageSize: String(MAX_NEWS_PER_RUN),
    apiKey: newsApiKey
  });

  const response = await fetch(`${NEWS_API_ENDPOINT}?${params.toString()}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("News API error:", response.status, payload);
    throw new Error(payload?.message || `News API failed with status ${response.status}`);
  }

  const rawArticles = Array.isArray(payload?.articles) ? payload.articles.slice(0, MAX_NEWS_PER_RUN) : [];
  const articles = rawArticles
    .map(normalizeArticle)
    .filter((article) => article.title && article.content)
    .filter(isLikelyTurkishArticle)
    .slice(0, MAX_NEWS_PER_RUN);

  return {
    articles,
    fetched: rawArticles.length,
    skipped: Math.max(0, rawArticles.length - articles.length)
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
  const { includeSourceUrl = true, includeLocaleFields = true } = options;
  const post = {
    title: article.title,
    content: article.content,
    image_url: article.image_url,
    published: true
  };

  if (includeSourceUrl && article.source_url) {
    post.source_url = article.source_url;
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

function isMissingSourceUrlColumn(error) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return message.includes("source_url") && (message.includes("schema cache") || message.includes("column"));
}

function isMissingLocaleColumn(error) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return (message.includes("country") || message.includes("language")) && (message.includes("schema cache") || message.includes("column"));
}

async function insertPostWithFallback(article, state) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await insertPost(article, state);
      return;
    } catch (error) {
      if (state.includeLocaleFields && isMissingLocaleColumn(error)) {
        state.includeLocaleFields = false;
        console.warn("Retrying insert without country/language:", article.title);
        continue;
      }

      if (state.includeSourceUrl && isMissingSourceUrlColumn(error)) {
        state.includeSourceUrl = false;
        console.warn("Retrying insert without source_url:", article.title);
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
      console.warn("Unauthorized import-news request.");
      return sendJson(res, 401, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const newsApiKey = requiredEnv("NEWS_API_KEY");
    const { articles, fetched, skipped } = await fetchNews(newsApiKey);
    let inserted = 0;
    let duplicates = 0;
    const insertState = {
      includeSourceUrl: true,
      includeLocaleFields: true
    };

    console.log(`Fetched ${articles.length} articles.`);

    for (const article of articles) {
      const duplicateByTitle = await titleExists(article.title);
      let duplicateByUrl = false;

      if (insertState.includeSourceUrl && article.source_url) {
        try {
          duplicateByUrl = await sourceUrlExists(article.source_url);
        } catch (error) {
          if (!isMissingSourceUrlColumn(error)) throw error;
          insertState.includeSourceUrl = false;
          console.warn("posts.source_url column not found. Continuing with title duplicate checks.");
          duplicateByUrl = await sourceUrlExistsInContent(article.source_url);
        }
      }

      if (duplicateByTitle || duplicateByUrl) {
        duplicates += 1;
        console.log("Duplicate skipped:", article.title);
        continue;
      }

      await insertPostWithFallback(article, insertState);

      inserted += 1;
      console.log("Inserted:", article.title);
    }

    return sendJson(res, 200, {
      ok: true,
      fetched,
      inserted,
      duplicates,
      skipped,
      total: articles.length
    });
  } catch (error) {
    console.error("TechPulse import-news failed:", error);
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Import failed"
    });
  }
}
