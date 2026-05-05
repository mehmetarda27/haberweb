const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85";
const TOPIC_FILTERS = ["Tümü", "Yapay Zeka", "Siber Güvenlik", "Donanım", "Mobil", "Oyun"];

let allPublishedNews = [];
let activeSearch = "";
let activeTopic = "Tümü";

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

function shortContent(value, length = 150) {
  const text = stripHTML(value);
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function getArticleTopic(article) {
  const haystack = `${article.title || ""} ${article.content || ""}`.toLocaleLowerCase("tr-TR");
  if (haystack.includes("yapay zeka") || haystack.includes("ai")) return "Yapay Zeka";
  if (haystack.includes("siber") || haystack.includes("güvenlik")) return "Siber Güvenlik";
  if (haystack.includes("donanım") || haystack.includes("çip") || haystack.includes("gpu")) return "Donanım";
  if (haystack.includes("mobil") || haystack.includes("telefon")) return "Mobil";
  if (haystack.includes("oyun") || haystack.includes("gaming")) return "Oyun";
  return "Teknoloji";
}

function articleImage(article) {
  return article.image_url || FALLBACK_IMAGE;
}

function articleHref(article) {
  return `haber.html?id=${encodeURIComponent(article.id)}`;
}

function articleCard(article) {
  const topic = getArticleTopic(article);
  return `
    <article class="news-card" data-topic="${escapeHTML(topic)}">
      <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title || "Haberi oku")}">
        <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" loading="lazy" />
      </a>
      <div class="card-body news-card-body">
        <div class="meta-line"><span>${escapeHTML(topic)}</span><span>${formatDate(article.created_at)}</span></div>
        <h3><a href="${articleHref(article)}">${escapeHTML(article.title || "Başlıksız Haber")}</a></h3>
        <p>${escapeHTML(shortContent(article.content))}</p>
        <div class="card-footer">
          <span>Yayında</span>
          <a href="${articleHref(article)}" class="read-button btn">Haberi Oku</a>
        </div>
      </div>
    </article>
  `;
}

function getFilteredNews() {
  const search = activeSearch.toLocaleLowerCase("tr-TR").trim();
  return allPublishedNews.filter((article) => {
    const topic = getArticleTopic(article);
    const topicMatch = activeTopic === "Tümü" || topic === activeTopic;
    const haystack = `${article.title || ""} ${article.content || ""}`.toLocaleLowerCase("tr-TR");
    return topicMatch && (!search || haystack.includes(search));
  });
}

function renderStatus(container, message, state = "info") {
  container.innerHTML = `<div class="empty-state ${state === "error" ? "is-error" : ""}">${escapeHTML(message)}</div>`;
}

function renderFeatured() {
  const container = document.getElementById("featuredNews");
  if (!container) return;

  const article = allPublishedNews[0];
  if (!article) {
    renderStatus(container, "Öne çıkan haber için yayında içerik yok.");
    return;
  }

  container.innerHTML = `
    <a href="${articleHref(article)}" aria-label="${escapeHTML(article.title || "Öne çıkan haberi oku")}">
      <img src="${escapeHTML(articleImage(article))}" alt="${escapeHTML(article.title || "Haber görseli")}" />
      <div class="featured-overlay"></div>
      <div class="featured-content">
        <div class="meta-line"><span>${escapeHTML(getArticleTopic(article))}</span><span>${formatDate(article.created_at)}</span></div>
        <h2>${escapeHTML(article.title || "Başlıksız Haber")}</h2>
        <p>${escapeHTML(shortContent(article.content, 210))}</p>
        <span class="read-button">Haberi oku</span>
      </div>
    </a>
  `;
}

function renderTopicFilters() {
  const container = document.getElementById("categoryFilters");
  if (!container) return;

  container.innerHTML = TOPIC_FILTERS.map((topic) => `
    <button class="category-button ${topic === activeTopic ? "is-active" : ""}" type="button" data-topic-filter="${escapeHTML(topic)}">${escapeHTML(topic)}</button>
  `).join("");
}

function renderPopular() {
  const container = document.getElementById("popularList");
  if (!container) return;

  const items = allPublishedNews.slice(0, 5);
  container.innerHTML = items.map((article, index) => `
    <a class="popular-item" href="${articleHref(article)}">
      <span class="popular-rank">${index + 1}</span>
      <span><b>${escapeHTML(article.title || "Başlıksız Haber")}</b><span>${formatDate(article.created_at)} · ${escapeHTML(getArticleTopic(article))}</span></span>
    </a>
  `).join("") || `<div class="empty-state">Henüz editör seçkisi yok.</div>`;
}

function renderTags() {
  const container = document.getElementById("tagCloud");
  if (!container) return;

  const availableTopics = [...new Set(allPublishedNews.map(getArticleTopic))];
  container.innerHTML = availableTopics.map((topic) => `
    <button class="tag-button ${topic === activeTopic ? "is-active" : ""}" type="button" data-topic-filter="${escapeHTML(topic)}">#${escapeHTML(topic)}</button>
  `).join("") || `<div class="empty-state">Başlık verisi bekleniyor.</div>`;
}

function renderNewsList() {
  const container = document.querySelector("[data-news-list]");
  if (!container) return;

  const filteredNews = getFilteredNews();
  const resultMeta = document.getElementById("resultMeta");
  if (resultMeta) {
    resultMeta.textContent = `${filteredNews.length.toLocaleString("tr-TR")} yayınlanmış haber`;
  }

  if (!filteredNews.length) {
    renderStatus(container, "Bu arama veya filtreyle eşleşen yayınlanmış haber yok.");
    return;
  }

  container.innerHTML = filteredNews.map(articleCard).join("");
}

async function loadNews() {
  const container = document.querySelector("[data-news-list]");
  if (!container) return;

  renderStatus(container, "Haberler yükleniyor...");

  const { data, error } = await supabase
    .from("gönderiler")
    .select("id,title,content,image_url,published,created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    renderStatus(container, "Haberler yüklenirken bir hata oluştu. Lütfen Supabase publishable key ve RLS okuma izinlerini kontrol edin.", "error");
    return;
  }

  allPublishedNews = Array.isArray(data) ? data : [];
  if (!allPublishedNews.length) {
    renderStatus(container, "Henüz yayınlanmış haber yok.");
    renderFeatured();
    renderPopular();
    renderTags();
    return;
  }

  renderTopicFilters();
  renderFeatured();
  renderNewsList();
  renderPopular();
  renderTags();
}

async function loadSingleNews() {
  const container = document.querySelector("[data-news-detail]");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    renderStatus(container, "Haber bulunamadı. Eksik haber id değeri.");
    return;
  }

  renderStatus(container, "Haber yükleniyor...");

  const { data, error } = await supabase
    .from("gönderiler")
    .select("id,title,content,image_url,published,created_at")
    .eq("id", id)
    .eq("published", true)
    .single();

  if (error) {
    console.error(error);
    renderStatus(container, "Haber yüklenirken bir hata oluştu veya bu haber yayında değil.", "error");
    return;
  }

  document.title = `${data.title || "Haber"} | TechPulse`;
  container.innerHTML = `
    <article class="news-detail">
      <img src="${escapeHTML(articleImage(data))}" alt="${escapeHTML(data.title || "Haber görseli")}" />
      <div class="news-detail-body">
        <div class="meta-line"><span>${escapeHTML(getArticleTopic(data))}</span><span>${formatDate(data.created_at)}</span></div>
        <h1>${escapeHTML(data.title || "Başlıksız Haber")}</h1>
        <div class="modal-content">${String(data.content || "").split(/\n+/).filter(Boolean).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("")}</div>
      </div>
    </article>
  `;
}

async function saveContactMessage(event) {
  event.preventDefault();
  const form = event.target;
  const messageBox = form.querySelector("[data-form-message]");
  if (messageBox) messageBox.textContent = "Mesaj gönderiliyor...";

  const message = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    message: form.message.value.trim()
  };

  const { error } = await supabase
    .from("iletişim_mesajları")
    .insert([message]);

  if (error) {
    console.error(error);
    if (messageBox) messageBox.textContent = "Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.";
    return;
  }

  if (messageBox) messageBox.textContent = "Mesaj gönderildi. Teşekkürler.";
  form.reset();
}

async function saveNewsletter(event) {
  event.preventDefault();
  const form = event.target;
  const messageBox = form.querySelector("[data-form-message]");
  if (messageBox) messageBox.textContent = "Abonelik kaydediliyor...";

  const subscriber = {
    email: form.email.value.trim()
  };

  const { error } = await supabase
    .from("bülten_aboneleri")
    .insert([subscriber]);

  if (error) {
    console.error(error);
    if (messageBox) messageBox.textContent = "Abonelik kaydedilemedi. E-posta adresini kontrol edip tekrar dene.";
    return;
  }

  if (messageBox) messageBox.textContent = "Abonelik kaydedildi.";
  form.reset();
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
    const filter = event.target.closest("[data-topic-filter]");
    if (!filter) return;
    activeTopic = filter.dataset.topicFilter || "Tümü";
    renderTopicFilters();
    renderNewsList();
    renderTags();
  });

  document.querySelectorAll("[data-contact-form]").forEach((form) => {
    form.addEventListener("submit", saveContactMessage);
  });

  document.querySelectorAll("[data-newsletter-form]").forEach((form) => {
    form.addEventListener("submit", saveNewsletter);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderTopicFilters();
  loadNews();
  loadSingleNews();
  bindNewsEvents();
});
