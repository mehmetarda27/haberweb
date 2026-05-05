const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1600&q=85";
const CATEGORIES = ["Tümü", "Gündem", "Ekonomi", "Spor", "Teknoloji", "Sağlık", "Dünya", "Magazin"];
const TURKISH_SIGNAL_PATTERN = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]|\b(ve|ile|i\u00e7in|bir|son|yeni|g\u00fcn|sonra|\u00f6nce|t\u00fcrkiye|ankara|istanbul|izmir|haber|a\u00e7\u0131kland\u0131|geldi|oldu|var|yok|en|bu|\u015fu|g\u00f6re|karar|ba\u015fkan|bakan|d\u00fcnya|ekonomi|spor|teknoloji|sa\u011fl\u0131k|magazin|g\u00fcndem)\b/i;
const ENGLISH_SIGNAL_PATTERN = /\b(the|and|with|after|before|from|over|under|into|about|this|that|will|could|would|says|said|new|latest|breaking|report|update|source|news)\b/i;

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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

function shortContent(value, length = 170) {
  const text = stripHTML(value);
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function isLikelyTurkishArticle(article) {
  const title = String(article.title || "").toLocaleLowerCase("tr-TR");
  const content = String(article.content || "").toLocaleLowerCase("tr-TR");
  const haystack = `${title} ${content}`;
  if (!title.trim()) return false;
  if (TURKISH_SIGNAL_PATTERN.test(haystack)) return true;
  return !ENGLISH_SIGNAL_PATTERN.test(title);
}

function getCategory(article) {
  const text = `${article.title || ""} ${article.content || ""}`.toLocaleLowerCase("tr-TR");
  if (/(dolar|euro|altın|ekonomi|borsa|faiz|piyasa|kur|enflasyon|merkez bankası)/i.test(text)) return "Ekonomi";
  if (/(maç|spor|futbol|basketbol|voleybol|lig|gol|takım|transfer)/i.test(text)) return "Spor";
  if (/(teknoloji|yapay zeka|telefon|yazılım|donanım|robot|uygulama|siber|bilim)/i.test(text)) return "Teknoloji";
  if (/(sağlık|hastane|doktor|ilaç|tedavi|hasta|bakanlığı)/i.test(text)) return "Sağlık";
  if (/(dünya|abd|avrupa|rusya|ukrayna|çin|almanya|fransa|nato|bm)/i.test(text)) return "Dünya";
  if (/(ünlü|magazin|sanatçı|oyuncu|konser|dizi|film|şarkıcı)/i.test(text)) return "Magazin";
  return "Gündem";
}

function articleImage(article) {
  return article.image_url || FALLBACK_IMAGE;
}

function articleHref(article) {
  return `haber.html?id=${encodeURIComponent(article.id)}`;
}

function getSourceUrl(article) {
  const match = String(article.content || "").match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[).,;]+$/, "") : "";
}

function getFilteredNews() {
  const search = activeSearch.toLocaleLowerCase("tr-TR").trim();
  return allPublishedNews.filter((article) => {
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

function articleCard(article) {
  const category = getCategory(article);
  return `
    <article class="news-card" data-category="${escapeHTML(category)}">
      <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title || "Haberi oku")}">
        <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" loading="lazy" />
      </a>
      <div class="card-body">
        <div class="meta-line"><span>${escapeHTML(category)}</span><span>${formatDate(article.created_at)}</span></div>
        <h3><a href="${articleHref(article)}">${escapeHTML(article.title || "Başlıksız Haber")}</a></h3>
        <p>${escapeHTML(shortContent(article.content))}</p>
        <div class="card-footer">
          <span>Yayında</span>
          <a href="${articleHref(article)}" class="read-button">Devamını Oku</a>
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
  const items = allPublishedNews.slice(0, 10);
  container.innerHTML = items.map((article) => `
    <a href="${articleHref(article)}"><b>${escapeHTML(getCategory(article))}</b>${escapeHTML(article.title || "Başlıksız haber")}</a>
  `).join("");
}

function renderSlider() {
  const container = document.getElementById("headlineSlider");
  if (!container) return;
  const items = allPublishedNews.slice(0, 5);
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
  const count = Math.min(allPublishedNews.length, 5);
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
  const article = allPublishedNews[0];
  if (!article) {
    renderStatus(container, "Manşet bekleniyor", "Yayınlanmış haber bulunamadı.");
    return;
  }
  container.innerHTML = `
    <a href="${articleHref(article)}">
      <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" />
      <div class="featured-overlay"></div>
      <div class="featured-content">
        <div class="meta-line"><span>${escapeHTML(getCategory(article))}</span><span>${formatDate(article.created_at)}</span></div>
        <h2>${escapeHTML(article.title || "Başlıksız Haber")}</h2>
        <p>${escapeHTML(shortContent(article.content, 230))}</p>
        <span class="read-button">Devamını Oku</span>
      </div>
    </a>
  `;
}

function renderPopular() {
  const container = document.getElementById("popularList");
  if (!container) return;
  const items = allPublishedNews.slice(0, 6);
  container.innerHTML = items.map((article, index) => `
    <a class="popular-item" href="${articleHref(article)}">
      <span class="popular-rank">${index + 1}</span>
      <span><b>${escapeHTML(article.title || "Başlıksız Haber")}</b><span>${formatDate(article.created_at)} · ${escapeHTML(getCategory(article))}</span></span>
    </a>
  `).join("") || `<div class="empty-state">Henüz haber yok.</div>`;
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

async function loadNews() {
  const container = document.querySelector("[data-news-list]");
  if (container) renderSkeleton();
  try {
    allPublishedNews = (await fetchPosts()).filter(isLikelyTurkishArticle);
    renderCategoryFilters();
    renderBreakingBand();
    renderSlider();
    renderFeatured();
    renderNewsList();
    renderPopular();
    renderTags();
    startSlider();
  } catch {
    if (container) renderStatus(container, "Haberler yüklenemedi", "Bağlantı veya Supabase izinlerini kontrol et.", "error");
  }
}

function renderOtherNews(currentId) {
  const container = document.getElementById("relatedNews");
  if (!container) return;
  const items = allPublishedNews.filter((article) => String(article.id) !== String(currentId)).slice(0, 3);
  container.innerHTML = items.map(articleCard).join("") || `<div class="empty-state">Diğer haberler bulunamadı.</div>`;
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
    if (!window.supabaseClient) throw new Error("Supabase client is not initialized.");
    const { data, error } = await window.supabaseClient
      .from("posts")
      .select("id,title,content,image_url,published,created_at")
      .eq("id", id)
      .eq("published", true)
      .single();
    if (error) throw error;
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
          ${sourceUrl ? `<a class="source-link" href="${escapeHTML(sourceUrl)}" target="_blank" rel="noopener">Kaynağı görüntüle</a>` : ""}
        </div>
      </article>
    `;
    allPublishedNews = (await fetchPosts()).filter(isLikelyTurkishArticle);
    renderOtherNews(id);
  } catch {
    renderStatus(container, "Haber yüklenemedi", "Haber yayında olmayabilir veya bağlantı sorunu oluştu.", "error");
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
