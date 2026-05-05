const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1600&q=85";
const CATEGORIES = ["Tümü", "Teknoloji", "Yapay Zeka", "Oyun", "Donanım", "Mobil", "Siber Güvenlik", "Girişimcilik", "İnceleme"];
const ENGLISH_WORDS = new Set(["the", "and", "with", "for", "from", "says", "after", "before", "new", "update", "report", "startup", "company", "game", "tech", "technology", "launch", "announces", "reveals", "could", "will", "is", "are", "was", "were", "has", "have", "this", "that", "you", "your", "as", "by", "on", "in", "to", "of", "at", "it", "its", "about", "over", "more", "first", "latest"]);
const TURKISH_WORDS = new Set(["ve", "ile", "için", "bir", "son", "yeni", "gün", "sonra", "önce", "türkiye", "haber", "açıklandı", "geldi", "oldu", "var", "yok", "bu", "şu", "göre", "teknoloji", "yapay", "zeka", "oyun", "donanım", "girişim", "siber", "güvenlik", "mobil", "yerli", "kullanıcı", "şirket", "uygulama", "model", "cihaz", "pazar", "gelişme", "duyurdu", "başladı", "özellik", "özellikleri", "çıktı", "tanıttı", "artık", "daha", "olarak", "olan"]);
const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const LETTERS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/g;
const WORDS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]+/g;

let allPublishedNews = [];
let activeSearch = "";
let activeCategory = "Tümü";
let activeSlide = 0;
let slideTimer = null;

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
  const description = normalizeText(article.description || article.content || article.excerpt);
  if (!title || title.length < 8) return false;

  const text = `${title} ${description}`;
  const tokens = tokenize(text);
  const letters = text.match(LETTERS) || [];
  const turkishChars = text.match(TURKISH_CHARS) || [];
  const englishHits = tokens.filter((token) => token !== "ai" && ENGLISH_WORDS.has(token)).length;
  const turkishHits = tokens.filter((token) => TURKISH_WORDS.has(token)).length;
  const englishRatio = tokens.length ? englishHits / tokens.length : 0;
  const turkishRatio = tokens.length ? turkishHits / tokens.length : 0;
  const turkishCharRatio = letters.length ? turkishChars.length / letters.length : 0;

  if (tokens.length < 4) return false;
  if (englishHits >= 4 && englishHits > turkishHits) return false;
  if (englishRatio >= 0.24 && turkishRatio < 0.14 && turkishCharRatio < 0.012) return false;
  if (turkishHits >= 2 || turkishCharRatio >= 0.018) return true;
  if (turkishHits >= 1 && englishHits <= 1 && tokens.length <= 10) return true;
  return false;
}

function onlyTurkishNews(list) {
  return (Array.isArray(list) ? list : []).filter(isTurkishNews);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}sa önce`;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

function shortContent(value, length = 170) {
  const text = normalizeText(value);
  const summary = text || "Bu haber için kısa açıklama hazırlanıyor.";
  return summary.length > length ? `${summary.slice(0, length).trim()}...` : summary;
}

function normalizeCategory(category) {
  const value = String(category || "").trim();
  const aliases = {
    AI: "Yapay Zeka",
    "Yapay zeka": "Yapay Zeka",
    Gaming: "Oyun",
    Spor: "Oyun",
    Cyber: "Siber Güvenlik",
    Siber: "Siber Güvenlik",
    Startup: "Girişimcilik",
    Girişim: "Girişimcilik",
    Hardware: "Donanım",
    Mobile: "Mobil"
  };
  return aliases[value] || value;
}

function getCategory(article) {
  const directCategory = normalizeCategory(article.category);
  if (directCategory) return directCategory;

  const text = `${article.title || ""} ${article.content || ""}`.toLocaleLowerCase("tr-TR");
  if (/(yapay zeka|ai|gpt|model|robot|otomasyon|npu)/i.test(text)) return "Yapay Zeka";
  if (/(oyun|playstation|xbox|steam|nintendo|gaming|fps|konsol)/i.test(text)) return "Oyun";
  if (/(donanım|gpu|işlemci|amd|nvidia|intel|çip|bellek|laptop)/i.test(text)) return "Donanım";
  if (/(mobil|telefon|android|ios|apple|katlanabilir|5g)/i.test(text)) return "Mobil";
  if (/(siber|güvenlik|ransomware|parola|passkey|zero trust)/i.test(text)) return "Siber Güvenlik";
  if (/(girişim|startup|yatırım|uzay|roket|fintech|otomotiv)/i.test(text)) return "Girişimcilik";
  if (/(inceleme|test|performans|puan|karşılaştırma)/i.test(text)) return "İnceleme";
  return "Teknoloji";
}

function articleImage(article) {
  return article.image_url || article.image || FALLBACK_IMAGE;
}

function articleHref(article) {
  return `haber.html?id=${encodeURIComponent(article.id)}`;
}

function getSourceUrl(article) {
  const directUrl = article.source_url || article.sourceUrl || article.url;
  if (directUrl) return String(directUrl);
  const match = String(article.content || "").match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[).,;]+$/, "") : "";
}

function getSourceLabel(article) {
  const match = String(article.content || "").match(/Kaynak:\s*([^\n]+)/i);
  return match ? match[1].trim() : "TechPulse Editörleri";
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getFilteredNews() {
  const search = activeSearch.toLocaleLowerCase("tr-TR").trim();
  return onlyTurkishNews(allPublishedNews).filter((article) => {
    const category = getCategory(article);
    const categoryMatch = activeCategory === "Tümü" || category === activeCategory;
    const haystack = `${article.title || ""} ${article.content || ""}`.toLocaleLowerCase("tr-TR");
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
  grid.innerHTML = Array.from({ length: 6 }, () => `
    <article class="news-card skeleton-card">
      <div class="skeleton-media"></div>
      <div class="card-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </article>
  `).join("");
}

function renderCategoryFilters() {
  const container = document.getElementById("categoryFilters");
  if (!container) return;
  container.innerHTML = CATEGORIES.map((category) => `
    <button class="category-button ${category === activeCategory ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>
  `).join("");
}

function sourceAction(article) {
  const sourceUrl = getSourceUrl(article);
  return isValidUrl(sourceUrl)
    ? `<a href="${escapeHTML(sourceUrl)}" class="read-button" target="_blank" rel="noopener noreferrer">Devamını Oku <span aria-hidden="true">→</span></a>`
    : `<span class="read-button is-disabled" aria-disabled="true">Link yok</span>`;
}

function articleCard(article) {
  if (!isTurkishNews(article)) return "";
  const category = getCategory(article);
  return `
    <article class="news-card" data-category="${escapeHTML(category)}">
      <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title || "Haberi oku")}">
        <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" loading="lazy" />
      </a>
      <div class="card-body">
        <div class="meta-line"><span>${escapeHTML(category)}</span><span>${formatDate(article.created_at)}</span></div>
        <h3><a href="${articleHref(article)}">${escapeHTML(article.title || "Başlıksız Haber")}</a></h3>
        <p>${escapeHTML(shortContent(article.content || article.excerpt))}</p>
        <div class="card-footer">
          <span>${escapeHTML(getSourceLabel(article))}</span>
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
  if (resultMeta) resultMeta.textContent = `${items.length.toLocaleString("tr-TR")} haber`;

  if (!items.length) {
    renderStatus(container, "Haber bulunamadı", "Arama veya kategori filtresini değiştirerek tekrar dene.");
    return;
  }

  container.innerHTML = items.map(articleCard).join("");
}

function renderBreakingBand() {
  const container = document.getElementById("breakingTrack");
  if (!container) return;
  const items = onlyTurkishNews(allPublishedNews).slice(0, 10);
  const markup = items.map((article) => `
    <a href="${articleHref(article)}"><b>⚡</b>${escapeHTML(article.title || "Başlıksız haber")}<span>${formatDate(article.created_at)}</span></a>
  `).join("");
  container.innerHTML = markup ? `${markup}${markup}` : `<span>Son dakika akışı hazırlanıyor.</span>`;
}

function renderSlider() {
  const container = document.getElementById("headlineSlider");
  if (!container) return;
  const items = onlyTurkishNews(allPublishedNews).slice(0, 5);
  if (!items.length) {
    renderStatus(container, "Öne çıkan haber yok", "Yayınlanmış haberler geldiğinde slider burada görünecek.");
    return;
  }
  activeSlide = Math.min(activeSlide, items.length - 1);
  container.innerHTML = items.map((article, index) => `
    <a class="headline-slide ${index === activeSlide ? "is-active" : ""}" href="${articleHref(article)}" aria-label="${escapeHTML(article.title)}">
      <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" />
      <span class="slide-shade"></span>
      <span class="slide-copy">
        <span class="meta-line"><span>${escapeHTML(getCategory(article))}</span><span>${formatDate(article.created_at)}</span></span>
        <strong>${escapeHTML(article.title || "Başlıksız Haber")}</strong>
        <small>${escapeHTML(shortContent(article.content, 135))}</small>
      </span>
    </a>
  `).join("");
}

function moveSlide(direction) {
  const count = Math.min(onlyTurkishNews(allPublishedNews).length, 5);
  if (!count) return;
  activeSlide = (activeSlide + direction + count) % count;
  renderSlider();
}

function startSlider() {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = setInterval(() => moveSlide(1), 5500);
}

function renderFeatured() {
  const container = document.getElementById("featuredNews");
  if (!container) return;
  const article = onlyTurkishNews(allPublishedNews)[0];
  if (!article) {
    renderStatus(container, "Manşet bekleniyor", "Yayınlanmış Türkçe haber bulunamadı.");
    return;
  }

  container.innerHTML = `
    <div class="featured-link">
      <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title || "Manşet haberi oku")}">
        <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" />
      </a>
      <div class="featured-overlay"></div>
      <div class="featured-content">
        <div class="meta-line"><span>${escapeHTML(getCategory(article))}</span><span>${formatDate(article.created_at)}</span></div>
        <h2>${escapeHTML(article.title || "Başlıksız Haber")}</h2>
        <p>${escapeHTML(shortContent(article.content || article.excerpt, 220))}</p>
        ${sourceAction(article)}
      </div>
    </div>
  `;
}

function renderPopular() {
  const container = document.getElementById("popularList");
  if (!container) return;
  const items = onlyTurkishNews(allPublishedNews).slice(0, 4);
  container.innerHTML = items.map((article, index) => `
    <a class="popular-item" href="${articleHref(article)}">
      <span class="popular-rank">${String(index + 1).padStart(2, "0")}</span>
      <span><b>${escapeHTML(article.title || "Başlıksız Haber")}</b><span>${formatDate(article.created_at)}</span></span>
    </a>
  `).join("") || `<div class="empty-state">Henüz Türkçe haber yok.</div>`;
}

function renderTags() {
  const container = document.getElementById("tagCloud");
  if (!container) return;
  const categories = CATEGORIES.filter((category) => category !== "Tümü");
  container.innerHTML = categories.map((category) => `
    <button class="tag-button ${category === activeCategory ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}">#${escapeHTML(category)}</button>
  `).join("");
}

async function fetchPosts(select = "id,title,content,image_url,published,created_at") {
  if (!window.supabaseClient) throw new Error("Supabase client is not initialized.");
  const { data, error } = await window.supabaseClient
    .from("posts")
    .select(select)
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchPublishedPosts() {
  try {
    return await fetchPosts("id,title,content,image_url,published,created_at,source_url,url,sourceUrl,category");
  } catch {
    return fetchPosts();
  }
}

async function fetchPostById(id) {
  let data = null;
  if (window.supabaseClient) {
    try {
      const response = await window.supabaseClient
        .from("posts")
        .select("id,title,content,image_url,published,created_at,source_url,url,sourceUrl,category")
        .eq("id", id)
        .eq("published", true)
        .single();
      if (response.error) throw response.error;
      data = response.data;
    } catch {
      data = null;
    }
  }

  if (!data) {
    const localNews = await fetchLocalNews();
    data = localNews.find((item) => String(item.id) === String(id));
  }

  if (!data || !isTurkishNews(data)) throw new Error("Turkish article not found.");
  return data;
}

function normalizeLocalArticle(article) {
  return {
    ...article,
    image_url: article.image_url || article.image,
    created_at: article.created_at || article.date || new Date().toISOString(),
    content: article.content || article.excerpt || "",
    source_url: article.source_url || article.url || ""
  };
}

async function fetchLocalNews() {
  const response = await fetch("data/news.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Local news fallback failed.");
  const data = await response.json();
  return onlyTurkishNews((Array.isArray(data) ? data : []).map(normalizeLocalArticle));
}

function renderAllNewsSurfaces() {
  allPublishedNews = onlyTurkishNews(allPublishedNews);
  renderCategoryFilters();
  renderBreakingBand();
  renderSlider();
  renderFeatured();
  renderNewsList();
  renderPopular();
  renderTags();
  startSlider();
}

async function loadNews() {
  const container = document.querySelector("[data-news-list]");
  if (container) renderSkeleton();

  try {
    const remoteNews = window.supabaseClient ? await fetchPublishedPosts() : [];
    allPublishedNews = onlyTurkishNews(remoteNews);
    if (!allPublishedNews.length) {
      allPublishedNews = await fetchLocalNews();
    }
    renderAllNewsSurfaces();
  } catch {
    try {
      allPublishedNews = await fetchLocalNews();
      renderAllNewsSurfaces();
    } catch {
      if (container) renderStatus(container, "Haberler yüklenemedi", "Yerel haber arşivi de okunamadı.", "error");
    }
  }
}

function renderOtherNews(currentId) {
  const container = document.getElementById("relatedNews");
  if (!container) return;
  const items = onlyTurkishNews(allPublishedNews).filter((article) => String(article.id) !== String(currentId)).slice(0, 3);
  container.innerHTML = items.map(articleCard).join("") || `<div class="empty-state">Diğer Türkçe haberler bulunamadı.</div>`;
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
    const category = getCategory(data);
    const sourceUrl = getSourceUrl(data);
    document.title = `${data.title || "Haber"} | TechPulse`;
    container.innerHTML = `
      <article class="news-detail">
        <img src="${escapeHTML(articleImage(data))}" alt="${escapeHTML(data.title || "Haber görseli")}" />
        <div class="news-detail-body">
          <div class="meta-line"><span>${escapeHTML(category)}</span><span>${formatDate(data.created_at)}</span></div>
          <h1>${escapeHTML(data.title || "Başlıksız Haber")}</h1>
          <div class="modal-content">${String(data.content || "").split(/\n+/).filter(Boolean).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("")}</div>
          ${isValidUrl(sourceUrl) ? `<a class="source-link" href="${escapeHTML(sourceUrl)}" target="_blank" rel="noopener noreferrer">Kaynak haberi oku</a>` : `<p class="source-missing">Kaynak link bulunamadı</p>`}
        </div>
      </article>
    `;
    allPublishedNews = window.supabaseClient ? onlyTurkishNews(await fetchPublishedPosts()) : await fetchLocalNews();
    if (!allPublishedNews.length) allPublishedNews = await fetchLocalNews();
    renderOtherNews(id);
  } catch {
    renderStatus(container, "Haber yüklenemedi", "Haber Türkçe olmayabilir, yayında olmayabilir veya bağlantı sorunu oluştu.", "error");
  }
}

async function saveContactMessage(event) {
  event.preventDefault();
  const form = event.target;
  const messageBox = form.querySelector("[data-form-message]");
  if (messageBox) messageBox.textContent = "Mesaj gönderiliyor...";
  try {
    if (!window.supabaseClient) throw new Error("Supabase client is not initialized.");
    const { error } = await window.supabaseClient.from("contact_messages").insert([{
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim()
    }]);
    if (error) throw error;
    if (messageBox) messageBox.textContent = "Mesaj gönderildi. Teşekkürler.";
    form.reset();
  } catch {
    if (messageBox) messageBox.textContent = "Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.";
  }
}

async function saveNewsletter(event) {
  event.preventDefault();
  const form = event.target;
  const messageBox = form.querySelector("[data-form-message]");
  if (messageBox) messageBox.textContent = "Abonelik kaydediliyor...";
  try {
    if (!window.supabaseClient) throw new Error("Supabase client is not initialized.");
    const { error } = await window.supabaseClient.from("newsletter_subscribers").insert([{ email: form.email.value.trim() }]);
    if (error) throw error;
    if (messageBox) messageBox.textContent = "Abonelik kaydedildi.";
    form.reset();
  } catch {
    if (messageBox) messageBox.textContent = "Abonelik kaydedilemedi. E-posta adresini kontrol edip tekrar dene.";
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
      renderTags();
    }

    if (event.target.closest("[data-slide-prev]")) moveSlide(-1);
    if (event.target.closest("[data-slide-next]")) moveSlide(1);
  });

  document.querySelectorAll("[data-contact-form]").forEach((form) => form.addEventListener("submit", saveContactMessage));
  document.querySelectorAll("[data-newsletter-form]").forEach((form) => form.addEventListener("submit", saveNewsletter));
}

document.addEventListener("DOMContentLoaded", () => {
  renderCategoryFilters();
  loadNews();
  loadSingleNews();
  bindNewsEvents();
});
