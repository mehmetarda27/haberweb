const CATEGORY_LIST = ["Tümü", "Gündem", "Teknoloji", "Ekonomi", "Spor", "Dünya", "Sağlık"];

const CATEGORY_FALLBACK_IMAGES = {
  "Gündem": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=85",
  "Teknoloji": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
  "Ekonomi": "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=85",
  "Spor": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=85",
  "Dünya": "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=85",
  "Sağlık": "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1200&q=85",
  "Genel": "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=85"
};

const FINAL_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=85";
const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const LETTERS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/g;
const WORDS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]+/g;
const ENGLISH_WORDS = new Set(["the", "and", "with", "for", "from", "says", "after", "before", "new", "update", "report", "startup", "company", "game", "tech", "technology", "launch", "announces", "reveals", "could", "will", "is", "are", "was", "were", "has", "have", "this", "that", "you", "your", "about", "over", "more", "first", "latest"]);
const TURKISH_WORDS = new Set(["ve", "ile", "için", "bir", "son", "yeni", "gün", "sonra", "önce", "türkiye", "haber", "açıklandı", "geldi", "oldu", "var", "yok", "bu", "şu", "göre", "teknoloji", "ekonomi", "spor", "dünya", "sağlık", "gündem", "yerli", "kullanıcı", "şirket", "uygulama", "model", "pazar", "gelişme", "duyurdu", "başladı", "özellik", "çıktı", "tanıttı", "artık", "daha", "olarak", "olan"]);

let allPublishedNews = [];
let activeSearch = "";
let activeCategory = "Tümü";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function stripHTML(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return stripHTML(value).replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return normalizeText(value).toLocaleLowerCase("tr-TR").match(WORDS) || [];
}

function isTurkishNews(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description || article.content || article.excerpt || article.summary);
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

function isLikelyImageUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    if (!["http:", "https:", "data:"].includes(url.protocol)) return false;
    return !/\.(gif|webp)$/i.test(url.pathname) || url.hostname.includes("images.unsplash.com");
  } catch {
    return false;
  }
}

function normalizeCategory(category, article = {}) {
  const direct = normalizeText(category);
  const aliases = {
    "Son Dakika": "Gündem",
    "Türkiye": "Gündem",
    "Politika": "Gündem",
    "Teknoloji Haberleri": "Teknoloji",
    "Bilim ve Teknoloji": "Teknoloji",
    "Finans": "Ekonomi",
    "Piyasa": "Ekonomi",
    "Spor&Skor": "Spor",
    "Yaşam": "Sağlık"
  };
  if (CATEGORY_LIST.includes(direct)) return direct;
  if (aliases[direct]) return aliases[direct];

  const text = `${article.title || ""} ${article.content || ""} ${article.excerpt || ""}`.toLocaleLowerCase("tr-TR");
  if (/(ekonomi|piyasa|borsa|dolar|euro|altın|faiz|enflasyon|finans)/i.test(text)) return "Ekonomi";
  if (/(spor|futbol|basketbol|voleybol|maç|lig|transfer|takım)/i.test(text)) return "Spor";
  if (/(dünya|avrupa|amerika|rusya|ukrayna|gazze|çin|abd|iran|israil)/i.test(text)) return "Dünya";
  if (/(sağlık|hastane|doktor|ilaç|tedavi|virüs|aşı|uzman)/i.test(text)) return "Sağlık";
  if (/(teknoloji|yapay zeka|telefon|uygulama|yazılım|donanım|siber|robot|uzay)/i.test(text)) return "Teknoloji";
  return direct || "Gündem";
}

function getImageCandidates(article) {
  return [
    article.finalImage,
    article.image,
    article.image_url,
    article.imageUrl,
    article.urlToImage,
    article.enclosure,
    article.enclosure_url,
    article.mediaContent,
    article.media_content,
    article.media,
    article.thumbnail,
    article.ogImage,
    article["og:image"],
    article.sourceImage
  ].map((value) => normalizeText(value)).filter(isLikelyImageUrl);
}

function fallbackImageForCategory(category) {
  return CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES.Genel || FINAL_FALLBACK_IMAGE;
}

function stableSeed(article) {
  return encodeURIComponent(article.id || article.slug || article.title || "turkce-haber");
}

function normalizeArticle(rawArticle) {
  const category = normalizeCategory(rawArticle.category, rawArticle);
  const imageCandidates = getImageCandidates(rawArticle);
  const categoryFallback = fallbackImageForCategory(category);
  const finalImage = imageCandidates[0] || categoryFallback;
  const sourceUrl = normalizeText(rawArticle.source_url || rawArticle.sourceUrl || rawArticle.url || rawArticle.link);
  const source = normalizeText(rawArticle.source || rawArticle.sourceName || rawArticle.author) || sourceLabelFromContent(rawArticle.content) || sourceLabelFromUrl(sourceUrl) || "TechPulse";
  const date = rawArticle.publishedAt || rawArticle.published_at || rawArticle.pubDate || rawArticle.created_at || rawArticle.date || new Date().toISOString();
  const id = String(rawArticle.id || rawArticle.slug || sourceUrl || rawArticle.title || crypto.randomUUID());
  const content = normalizeText(rawArticle.content || rawArticle.description || rawArticle.excerpt || rawArticle.summary || rawArticle.title);

  return {
    ...rawArticle,
    id,
    title: normalizeText(rawArticle.title) || "Başlıksız haber",
    excerpt: normalizeText(rawArticle.excerpt || rawArticle.description || content).slice(0, 220),
    content,
    category,
    source,
    source_url: sourceUrl,
    created_at: date,
    finalImage,
    image: finalImage,
    image_url: finalImage,
    fallbackImage: categoryFallback,
    lastFallbackImage: `https://picsum.photos/seed/${stableSeed(rawArticle)}/1200/700`
  };
}

function sourceLabelFromContent(content) {
  const match = String(content || "").match(/Kaynak:\s*([^\n]+)/i);
  return match ? normalizeText(match[1]) : "";
}

function sourceLabelFromUrl(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host.split(".").slice(0, -1).join(".") || host;
  } catch {
    return "";
  }
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

function shortContent(value, length = 170) {
  const text = normalizeText(value) || "Bu haber için kısa açıklama hazırlanıyor.";
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function articleHref(article) {
  return `haber.html?id=${encodeURIComponent(article.id || "")}`;
}

function imageMarkup(article, className = "") {
  const image = article.finalImage || article.image_url || fallbackImageForCategory(article.category);
  const fallback = article.fallbackImage || fallbackImageForCategory(article.category);
  const final = article.lastFallbackImage || FINAL_FALLBACK_IMAGE;
  return `<img class="${escapeHTML(className)}" src="${escapeHTML(image)}" alt="${escapeHTML(article.title || "Haber görseli")}" loading="lazy" data-fallback-src="${escapeHTML(fallback)}" data-final-src="${escapeHTML(final)}" onerror="window.TechPulseImageFallback(this)" />`;
}

window.TechPulseImageFallback = function handleTechPulseImageFallback(img) {
  const fallbackSrc = img.dataset.fallbackSrc;
  const finalSrc = img.dataset.finalSrc;
  img.classList.add("is-fallback-image");

  if (fallbackSrc && img.src !== fallbackSrc) {
    img.dataset.fallbackSrc = "";
    img.src = fallbackSrc;
    return;
  }

  if (finalSrc && img.src !== finalSrc) {
    img.dataset.finalSrc = "";
    img.src = finalSrc;
    return;
  }

  img.onerror = null;
  img.src = FINAL_FALLBACK_IMAGE;
};

function onlyTurkishNews(list) {
  return (Array.isArray(list) ? list : []).map(normalizeArticle).filter(isTurkishNews);
}

function dedupeNews(list) {
  const seen = new Set();
  return list.filter((article) => {
    const key = normalizeText(article.source_url || article.title).toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function getFilteredNews() {
  const search = activeSearch.toLocaleLowerCase("tr-TR").trim();
  return allPublishedNews.filter((article) => {
    const categoryMatch = activeCategory === "Tümü" || article.category === activeCategory;
    const haystack = `${article.title} ${article.excerpt} ${article.content} ${article.source} ${article.category}`.toLocaleLowerCase("tr-TR");
    return categoryMatch && (!search || haystack.includes(search));
  });
}

function renderStatus(container, title, text, state = "info") {
  container.innerHTML = `
    <div class="empty-state ${state === "error" ? "is-error" : ""}">
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(text)}</span>
    </div>
  `;
}

function renderSkeleton() {
  const grid = document.querySelector("[data-news-list]");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 9 }, () => `
    <article class="news-card skeleton-card">
      <div class="skeleton-media"></div>
      <div class="card-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </article>
  `).join("");
}

function renderCategoryFilters() {
  const container = document.getElementById("categoryFilters");
  if (!container) return;
  container.innerHTML = CATEGORY_LIST.map((category) => `
    <button class="category-button ${category === activeCategory ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>
  `).join("");
}

function sourceAction(article) {
  return isValidUrl(article.source_url)
    ? `<a href="${escapeHTML(article.source_url)}" class="read-button" target="_blank" rel="noopener noreferrer">Haberi Oku <span aria-hidden="true">→</span></a>`
    : `<a href="${articleHref(article)}" class="read-button">Haberi Oku <span aria-hidden="true">→</span></a>`;
}

function articleCard(article) {
  return `
    <article class="news-card" data-category="${escapeHTML(article.category)}">
      <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title)}">
        ${imageMarkup(article, "card-image")}
      </a>
      <div class="card-body">
        <div class="meta-line"><span>${escapeHTML(article.category)}</span><span>${formatDate(article.created_at)}</span></div>
        <h3><a href="${articleHref(article)}">${escapeHTML(article.title)}</a></h3>
        <p>${escapeHTML(shortContent(article.excerpt || article.content))}</p>
        <div class="card-footer">
          <span>${escapeHTML(article.source)}</span>
          ${sourceAction(article)}
        </div>
      </div>
    </article>
  `;
}

function renderNewsList() {
  const container = document.querySelector("[data-news-list]");
  if (!container) return;
  const items = getFilteredNews();
  const resultMeta = document.getElementById("resultMeta");
  if (resultMeta) resultMeta.textContent = `${items.length.toLocaleString("tr-TR")} haber gösteriliyor`;

  if (!items.length) {
    renderStatus(container, "Haber bulunamadı", "Arama veya kategori filtresini değiştirerek tekrar deneyin.");
    return;
  }

  container.innerHTML = items.map(articleCard).join("");
}

function renderBreakingBand() {
  const container = document.getElementById("breakingTrack");
  if (!container) return;
  const items = allPublishedNews.slice(0, 10);
  const markup = items.map((article) => `
    <a href="${articleHref(article)}"><b>•</b>${escapeHTML(article.title)}<span>${formatDate(article.created_at)}</span></a>
  `).join("");
  container.innerHTML = markup ? `${markup}${markup}` : `<span>Son dakika akışı hazırlanıyor.</span>`;
}

function renderFeatured() {
  const container = document.getElementById("featuredNews");
  if (!container) return;
  const article = allPublishedNews[0];
  if (!article) {
    renderStatus(container, "Manşet bekleniyor", "Yayınlanmış Türkçe haber bulunamadı.");
    return;
  }

  container.innerHTML = `
    <div class="featured-link">
      <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title)}">
        ${imageMarkup(article, "featured-image")}
      </a>
      <div class="featured-overlay"></div>
      <div class="featured-content">
        <div class="meta-line"><span>${escapeHTML(article.category)}</span><span>${formatDate(article.created_at)}</span><span>${escapeHTML(article.source)}</span></div>
        <h2>${escapeHTML(article.title)}</h2>
        <p>${escapeHTML(shortContent(article.content, 220))}</p>
        ${sourceAction(article)}
      </div>
    </div>
  `;
}

function renderPopular() {
  const container = document.getElementById("popularList");
  if (!container) return;
  const items = allPublishedNews.slice(0, 4);
  container.innerHTML = items.map((article, index) => `
    <a class="popular-item" href="${articleHref(article)}">
      <span class="popular-rank">${String(index + 1).padStart(2, "0")}</span>
      <span><b>${escapeHTML(article.title)}</b><span>${escapeHTML(article.category)} · ${formatDate(article.created_at)}</span></span>
    </a>
  `).join("") || `<div class="empty-state">Henüz Türkçe haber yok.</div>`;
}

function renderTags() {
  const container = document.getElementById("tagCloud");
  if (!container) return;
  container.innerHTML = CATEGORY_LIST.filter((category) => category !== "Tümü").map((category) => `
    <button class="tag-button ${category === activeCategory ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}">#${escapeHTML(category)}</button>
  `).join("");
}

async function fetchPosts() {
  if (!window.supabaseClient) return [];
  const { data, error } = await window.supabaseClient
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchRawLocalNews() {
  const response = await fetch("data/news.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Yerel haber arşivi okunamadı.");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function withTimeout(promise, timeoutMs, message) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

function mergeNews(primary, secondary) {
  return sortByDateDesc(dedupeNews([...onlyTurkishNews(primary), ...onlyTurkishNews(secondary)]));
}

function renderAllNewsSurfaces() {
  renderCategoryFilters();
  renderBreakingBand();
  renderFeatured();
  renderNewsList();
  renderPopular();
  renderTags();
}

async function loadNews() {
  const container = document.querySelector("[data-news-list]");
  if (container) renderSkeleton();

  try {
    const remoteNews = await withTimeout(fetchPosts(), 3000, "Supabase haberleri zamanında yanıt vermedi.");
    const localNews = await fetchRawLocalNews().catch(() => []);
    allPublishedNews = mergeNews(remoteNews, localNews);
    renderAllNewsSurfaces();
  } catch {
    try {
      allPublishedNews = sortByDateDesc(dedupeNews(onlyTurkishNews(await fetchRawLocalNews())));
      renderAllNewsSurfaces();
    } catch {
      if (container) renderStatus(container, "Haberler yüklenemedi", "Haber kaynağına şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyin.", "error");
    }
  }
}

function renderOtherNews(currentId) {
  const container = document.getElementById("relatedNews");
  if (!container) return;
  const items = allPublishedNews.filter((article) => String(article.id) !== String(currentId)).slice(0, 3);
  container.innerHTML = items.map(articleCard).join("") || `<div class="empty-state">Diğer Türkçe haberler bulunamadı.</div>`;
}

async function fetchPostById(id) {
  if (window.supabaseClient) {
    const { data, error } = await window.supabaseClient.from("posts").select("*").eq("id", id).maybeSingle();
    if (!error && data) return normalizeArticle(data);
  }

  const localNews = onlyTurkishNews(await fetchRawLocalNews());
  const selected = localNews.find((article) => [article.id, article.slug, article.source_url, article.title].filter(Boolean).some((value) => String(value) === String(id)));
  if (selected) return selected;
  throw new Error("Haber bulunamadı.");
}

async function loadSingleNews() {
  const container = document.querySelector("[data-news-detail]");
  if (!container) return;
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    renderStatus(container, "Haber bulunamadı", "Eksik haber id değeri.", "error");
    return;
  }

  renderStatus(container, "Haber yükleniyor", "Detaylar hazırlanıyor.");
  try {
    const data = await fetchPostById(id);
    document.title = `${data.title} | TechPulse`;
    container.innerHTML = `
      <article class="news-detail">
        <div class="detail-media">
          ${imageMarkup(data, "detail-image")}
        </div>
        <div class="news-detail-body">
          <div class="meta-line"><span>${escapeHTML(data.category)}</span><span>${formatDate(data.created_at)}</span><span>${escapeHTML(data.source)}</span></div>
          <h1>${escapeHTML(data.title)}</h1>
          <div class="modal-content">${String(data.content || data.excerpt || "").split(/\n+/).filter(Boolean).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("")}</div>
          ${isValidUrl(data.source_url) ? `<a class="source-link" href="${escapeHTML(data.source_url)}" target="_blank" rel="noopener noreferrer">Kaynak haberi oku</a>` : `<p class="source-missing">Kaynak link bulunamadı</p>`}
        </div>
      </article>
    `;
    allPublishedNews = mergeNews(await fetchPosts().catch(() => []), await fetchRawLocalNews().catch(() => []));
    renderOtherNews(id);
  } catch {
    renderStatus(container, "Haber bulunamadı", "Bu haber yayından kaldırılmış olabilir. Ana sayfadaki güncel haberlerden devam edebilirsiniz.", "error");
  }
}

function bindNewsEvents() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      activeSearch = event.target.value;
      renderNewsList();
    });
  }

  document.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-menu-toggle]");
    if (menuButton) {
      document.querySelector(".site-header")?.classList.toggle("is-open");
      return;
    }

    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton) {
      activeCategory = categoryButton.dataset.category || "Tümü";
      renderCategoryFilters();
      renderNewsList();
      renderPopular();
      renderTags();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderCategoryFilters();
  loadNews();
  loadSingleNews();
  bindNewsEvents();
});
