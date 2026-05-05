import { readFile } from "node:fs/promises";

const MAX_NEWS_PER_RUN = 50;
const NEWS_API_ENDPOINT = "https://newsapi.org/v2/top-headlines";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4o-mini";
const NEWS_QUERIES = ["teknoloji", "yapay zeka", "oyun", "girişim", "donanım", "siber güvenlik"];
// External cron target, every 2 hours:
// https://haberweb.vercel.app/api/import-news?secret=IMPORT_SECRET
const TURKISH_SIGNAL_PATTERN = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]|\b(ve|ile|i\u00e7in|bir|son|yeni|g\u00fcn|sonra|\u00f6nce|t\u00fcrkiye|ankara|istanbul|izmir|haber|a\u00e7\u0131kland\u0131|geldi|oldu|var|yok|en|bu|\u015fu|g\u00f6re|karar|ba\u015fkan|bakan|d\u00fcnya|ekonomi|spor|teknoloji)\b/i;

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
  const turkishBody = [description, content].filter((value) => TURKISH_SIGNAL_PATTERN.test(value));

  return {
    title,
    content: [turkishBody.join("\n\n") || title, source ? `Kaynak: ${source}` : "", url ? `Haber linki: ${url}` : ""]
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
  const articles = (Array.isArray(items) ? items : [])
    .map(normalizeLocalSeedArticle)
    .filter((article) => article.title && article.content && isLikelyTurkishArticle(article))
    .slice(0, MAX_NEWS_PER_RUN);

  return {
    articles,
    fetched: articles.length,
    skippedEnglish: 0,
    skippedInvalid: 0,
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
    if (result.length >= MAX_NEWS_PER_RUN) break;
  }

  return result;
}

function getOptionalEnv(name) {
  return process.env[name] || "";
}

function extractResponseText(payload) {
  if (payload?.output_text) return payload.output_text;

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && part.text) return part.text;
      if (part?.text) return part.text;
    }
  }

  return "";
}

async function rewriteArticleInTurkish(article, openaiApiKey) {
  if (!openaiApiKey) return article;

  try {
    const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions:
          "Sen deneyimli bir Türkçe haber editörüsün. Metni NTV, Habertürk ve Webtekno çizgisinde net, doğal, profesyonel Türkçe haber diline çevirip yeniden yaz. Bozuk karakter kullanma. Yarım cümle kurma. Abartılı clickbait yazma. Sadece geçerli JSON döndür.",
        input: `Kaynak başlık: ${article.title}\n\nKaynak metin: ${article.content}\n\nKaynak link: ${article.source_url || ""}`,
        text: {
          format: {
            type: "json_schema",
            name: "turkish_news_article",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: {
                  type: "string",
                  description: "Kısa, vurucu ve doğal Türkçe haber başlığı."
                },
                description: {
                  type: "string",
                  description: "Doğal Türkçe haber özeti. 2-4 cümle."
                }
              },
              required: ["title", "description"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      console.warn("OpenAI rewrite skipped:", response.status);
      return article;
    }

    const payload = await response.json();
    const text = extractResponseText(payload);
    const rewritten = JSON.parse(text);
    const title = normalizeText(rewritten.title);
    const description = normalizeText(rewritten.description);

    if (!title || !description) return article;

    return {
      ...article,
      title,
      content: [description, article.source_url ? `Kaynak haberi oku: ${article.source_url}` : ""]
        .filter(Boolean)
        .join("\n\n")
    };
  } catch (error) {
    console.warn("OpenAI rewrite failed, original article kept:", error?.message || error);
    return article;
  }
}

async function rewriteArticlesInTurkish(articles) {
  const openaiApiKey = getOptionalEnv("OPENAI_API_KEY");
  const rewritten = [];

  for (const article of articles) {
    rewritten.push(await rewriteArticleInTurkish(article, openaiApiKey));
  }

  return rewritten;
}

function isLikelyTurkishArticle(article) {
  const title = normalizeText(article.title).toLocaleLowerCase("tr-TR");
  const content = normalizeText(article.content).toLocaleLowerCase("tr-TR");
  const haystack = `${title} ${content}`;
  if (!title) return false;
  return TURKISH_SIGNAL_PATTERN.test(haystack);
}

async function fetchNews(newsApiKey) {
  if (!newsApiKey) {
    console.log("NEWS_API_KEY not set. Using bundled Turkish TechPulse archive.");
    return fetchLocalSeedNews();
  }

  const rawArticles = [];
  let sourceCount = 0;

  for (const query of NEWS_QUERIES) {
    const params = new URLSearchParams({
      country: "tr",
      language: "tr",
      q: query,
      pageSize: String(MAX_NEWS_PER_RUN),
      apiKey: newsApiKey
    });

    let response = await fetch(`${NEWS_API_ENDPOINT}?${params.toString()}`);
    let payload = await response.json().catch(() => null);

    if (!response.ok && String(payload?.message || "").toLocaleLowerCase("tr-TR").includes("language")) {
      params.delete("language");
      response = await fetch(`${NEWS_API_ENDPOINT}?${params.toString()}`);
      payload = await response.json().catch(() => null);
    }

    if (!response.ok) {
      console.warn("News API source skipped:", query, response.status, payload?.message || payload);
      continue;
    }

    sourceCount += 1;
    rawArticles.push(...(Array.isArray(payload?.articles) ? payload.articles : []));
    if (dedupeArticles(rawArticles).length >= MAX_NEWS_PER_RUN) break;
  }

  const uniqueRawArticles = dedupeArticles(rawArticles);
  const normalizedArticles = uniqueRawArticles
    .slice(0, MAX_NEWS_PER_RUN)
    .map(normalizeArticle)
    .filter((article) => article.title && article.content)
    .slice(0, MAX_NEWS_PER_RUN);
  const rewrittenArticles = await rewriteArticlesInTurkish(normalizedArticles);
  const articles = rewrittenArticles.filter(isLikelyTurkishArticle).slice(0, MAX_NEWS_PER_RUN);
  const skippedInvalid = Math.max(0, uniqueRawArticles.length - normalizedArticles.length);
  const skippedEnglish = Math.max(0, normalizedArticles.length - articles.length);

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

function isMissingSourceUrlColumn(error) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return message.includes("source_url") && (message.includes("schema cache") || message.includes("column"));
}

function isMissingUrlColumn(error) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return (message.includes("url") || message.includes("sourceUrl")) && (message.includes("schema cache") || message.includes("column"));
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

      if (state.includeUrlFields && isMissingUrlColumn(error)) {
        state.includeUrlFields = false;
        console.warn("Retrying insert without url/sourceUrl:", article.title);
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

    const newsApiKey = getOptionalEnv("NEWS_API_KEY");
    const { articles, fetched, skippedEnglish, skippedInvalid, sourceCount } = await fetchNews(newsApiKey);
    let inserted = 0;
    let duplicates = 0;
    const insertState = {
      includeSourceUrl: true,
      includeUrlFields: true,
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
      skipped: skippedEnglish + skippedInvalid,
      skippedEnglish,
      skippedInvalid,
      sourceCount,
      sampleTitles: articles.slice(0, 5).map((article) => article.title),
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
