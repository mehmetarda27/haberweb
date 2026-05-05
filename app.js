const STORAGE_KEY = "techpulse.news.v1";
const LEGACY_KEY = "tech_news_db";
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85";

const dictionaryItems = [
  { term: "Sıfır Güven", description: "Her erişim isteğini yeniden doğrulayan güvenlik yaklaşımı." },
  { term: "Uç Yapay Zeka", description: "Modelin bulut yerine cihaz üzerinde çalışması." },
  { term: "Katman-2", description: "Blockchain ana ağı üzerindeki ölçekleme katmanı." },
  { term: "NPU", description: "Yapay zeka işlemleri için özelleşmiş sinir ağı işlemcisi." }
];

let newsList = [];
let activeCategory = "Tümü";
let activeSearch = "";
let activeTag = "";

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function stripHTML(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function htmlToText(value) {
  return stripHTML(value).replace(/\.\s+/g, ".\n\n");
}

function toTagArray(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function createNewsId() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeContent(item) {
  const raw = String(item.content || item.excerpt || "Bu haber için tam içerik henüz girilmedi.");
  return raw.includes("<") ? htmlToText(raw) : raw.trim();
}

function normalizeNews(item, index = 0) {
  return {
    id: String(item.id || createNewsId()),
    title: String(item.title || "Başlıksız haber").trim(),
    excerpt: String(item.excerpt || stripHTML(item.content).slice(0, 150) || "Kısa açıklama eklenmedi.").trim(),
    content: normalizeContent(item),
    category: String(item.category || "Genel").trim(),
    image: String(item.image || FALLBACK_IMAGE).trim(),
    date: String(item.date || new Date().toISOString().slice(0, 10)),
    readTime: Math.max(1, Number(item.readTime || 3)),
    views: Math.max(0, Number(item.views || 0)),
    featured: Boolean(item.featured || index === 0),
    tags: toTagArray(item.tags)
  };
}

function normalizeNewsList(list) {
  const seen = new Set();
  return list.map((item, index) => {
    const normalized = normalizeNews(item, index);
    let id = normalized.id;
    let suffix = 1;
    while (seen.has(id)) id = `${normalized.id}-${suffix++}`;
    seen.add(id);
    return { ...normalized, id };
  });
}

function saveNews(list = newsList) {
  newsList = normalizeNewsList(list);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newsList));
  localStorage.removeItem(LEGACY_KEY);
  return newsList;
}

async function loadNews() {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (stored) {
    try {
      const parsedNews = JSON.parse(stored);
      if (Array.isArray(parsedNews) && parsedNews.length >= 24) return saveNews(parsedNews);
    } catch (error) {
      console.warn("Kayıtlı haber verisi okunamadı, data/news.json deneniyor.", error);
    }
  }

  try {
    const response = await fetch("data/news.json", { cache: "no-store" });
    if (response.ok) return saveNews(await response.json());
  } catch (error) {
    console.warn("data/news.json doğrudan okunamadı. Yerel sunucu üzerinden açmayı deneyin.", error);
  }

  return saveNews([]);
}

async function fetchNewsFromApi() {
  console.warn("Gerçek haber API endpointi ve API key olmadan otomatik haber çekme çalışmaz.");
  // TODO: Gerçek endpoint, API key ve backend doğrulaması eklenince burada haberler çekilecek.
  // Saatlik gerçek güncelleme için frontend zamanlayıcı değil, backend cron görevi gerekir.
  return [];
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return escapeHTML(dateValue);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

function getCategories() {
  return ["Tümü", ...new Set(newsList.map((item) => item.category).filter(Boolean))];
}

function getFilteredNews() {
  const search = activeSearch.toLowerCase().trim();
  const tag = activeTag.toLowerCase().trim();
  return newsList.filter((item) => {
    const categoryMatch = activeCategory === "Tümü" || item.category === activeCategory;
    const tagMatch = !tag || item.tags.some((itemTag) => itemTag.toLowerCase() === tag);
    const haystack = `${item.title} ${item.excerpt} ${item.content} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
    return categoryMatch && tagMatch && (!search || haystack.includes(search));
  });
}

function renderFeatured() {
  const selectedNews = newsList.find((item) => item.featured) || newsList.find(Boolean);
  const container = $("featuredNews");
  if (!selectedNews) {
    container.innerHTML = `<div class="empty-state">Öne çıkan haber bulunamadı.</div>`;
    return;
  }

  container.dataset.id = selectedNews.id;
  container.innerHTML = `
    <img src="${escapeHTML(selectedNews.image)}" alt="${escapeHTML(selectedNews.title)}" />
    <div class="featured-overlay"></div>
    <div class="featured-content">
      <div class="meta-line"><span>${escapeHTML(selectedNews.category)}</span><span>${formatDate(selectedNews.date)}</span><span>${selectedNews.readTime} dk</span><span>${selectedNews.views.toLocaleString("tr-TR")} okunma</span></div>
      <h2>${escapeHTML(selectedNews.title)}</h2>
      <p>${escapeHTML(selectedNews.excerpt)}</p>
      <button class="read-button" type="button" data-id="${escapeHTML(selectedNews.id)}">Haberi oku</button>
    </div>
  `;
}

function renderNews() {
  const list = getFilteredNews();
  $("resultMeta").textContent = `${activeCategory}${activeTag ? ` · #${activeTag}` : ""}${activeSearch ? ` · ${list.length} sonuç` : ""}`;
  if (!list.length) {
    $("newsGrid").innerHTML = `<div class="empty-state">Bu filtrelerle eşleşen haber yok. Aramayı veya kategoriyi temizleyerek tekrar deneyin.</div>`;
    return;
  }

  $("newsGrid").innerHTML = list.map((item) => `
    <article class="news-card" data-id="${escapeHTML(item.id)}">
      <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" />
      <div class="card-body">
        <div class="meta-line"><span>${escapeHTML(item.category)}</span><span>${formatDate(item.date)}</span><span>${item.readTime} dk</span></div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.excerpt)}</p>
        <div class="card-footer">
          <span>${item.views.toLocaleString("tr-TR")} görüntülenme</span>
          <button class="read-button" type="button" data-id="${escapeHTML(item.id)}">Oku</button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderPopular() {
  const popular = [...newsList].sort((a, b) => b.views - a.views).slice(0, 6);
  $("popularList").innerHTML = popular.map((item, index) => `
    <button class="popular-item" type="button" data-id="${escapeHTML(item.id)}">
      <span class="popular-rank">${index + 1}</span>
      <span><b>${escapeHTML(item.title)}</b><span>${item.views.toLocaleString("tr-TR")} okunma · ${escapeHTML(item.category)}</span></span>
    </button>
  `).join("") || `<div class="empty-state">Okunma verisi yok.</div>`;
}

function renderTags() {
  const tags = [...new Set(newsList.flatMap((item) => item.tags))].slice(0, 24);
  $("tagCloud").innerHTML = tags.map((tag) => `
    <button class="tag-button ${activeTag === tag ? "is-active" : ""}" type="button" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</button>
  `).join("") || `<div class="empty-state">Etiket yok.</div>`;
}

function renderDictionary() {
  $("dictionaryList").innerHTML = dictionaryItems.map((item) => `
    <article class="dictionary-card"><b>${escapeHTML(item.term)}</b><p>${escapeHTML(item.description)}</p></article>
  `).join("");
}

function renderCategories() {
  $("categoryFilters").innerHTML = getCategories().map((category) => `
    <button class="category-button ${category === activeCategory ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>
  `).join("");
}

function renderAll() {
  renderCategories();
  renderFeatured();
  renderNews();
  renderPopular();
  renderTags();
  renderDictionary();
}

function contentToParagraphs(content) {
  return String(content || "")
    .split("\n")
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`)
    .join("");
}

function openNewsDetail(id) {
  const selectedNews = newsList.find((item) => String(item.id) === String(id));
  if (!selectedNews) {
    console.warn("Haber bulunamadı:", id);
    return;
  }

  selectedNews.views += 1;
  saveNews(newsList);

  $("modalImage").src = selectedNews.image;
  $("modalImage").alt = selectedNews.title;
  $("modalMeta").innerHTML = `
    <span>${escapeHTML(selectedNews.category)}</span>
    <span>${formatDate(selectedNews.date)}</span>
    <span>${selectedNews.readTime} dk okuma</span>
    <span>${selectedNews.views.toLocaleString("tr-TR")} görüntülenme</span>
  `;
  $("modalTitle").textContent = selectedNews.title;
  $("modalExcerpt").textContent = selectedNews.excerpt;
  $("modalContent").innerHTML = contentToParagraphs(selectedNews.content);
  $("modalTags").innerHTML = selectedNews.tags.map((tag) => `<span>#${escapeHTML(tag)}</span>`).join("");

  $("newsModal").classList.add("is-open");
  $("newsModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-lock");
  renderPopular();
  renderNews();
}

function closeNewsDetail() {
  $("newsModal").classList.remove("is-open");
  $("newsModal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-lock");
}

function filterNews(category) {
  activeCategory = category;
  activeTag = "";
  renderAll();
}

function searchNews(value) {
  activeSearch = value;
  renderNews();
}

function filterByTag(tag) {
  activeTag = activeTag === tag ? "" : tag;
  renderCategories();
  renderNews();
  renderTags();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const newsTrigger = event.target.closest("[data-id]");
    if (newsTrigger && (newsTrigger.classList.contains("read-button") || newsTrigger.classList.contains("popular-item") || newsTrigger.classList.contains("news-card") || newsTrigger.id === "featuredNews")) {
      event.preventDefault();
      openNewsDetail(newsTrigger.dataset.id);
      return;
    }

    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton) {
      event.preventDefault();
      filterNews(categoryButton.dataset.category);
      return;
    }

    const tagButton = event.target.closest("[data-tag]");
    if (tagButton) {
      event.preventDefault();
      filterByTag(tagButton.dataset.tag);
    }
  });

  $("searchInput").addEventListener("input", (event) => searchNews(event.target.value));
  $("closeModal").addEventListener("click", closeNewsDetail);
  $("newsModal").addEventListener("click", (event) => {
    if (event.target === $("newsModal")) closeNewsDetail();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNewsDetail();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      newsList = normalizeNewsList(JSON.parse(event.newValue || "[]"));
      renderAll();
    }
  });
}

async function init() {
  newsList = await loadNews();
  renderAll();
  bindEvents();
}

window.openNewsDetail = openNewsDetail;
window.closeNewsDetail = closeNewsDetail;
window.saveNews = saveNews;
window.loadNews = loadNews;
window.filterNews = filterNews;
window.searchNews = searchNews;
window.renderNews = renderNews;
window.renderFeatured = renderFeatured;
window.renderPopular = renderPopular;
window.renderTags = renderTags;
window.renderDictionary = renderDictionary;
window.fetchNewsFromApi = fetchNewsFromApi;

init();