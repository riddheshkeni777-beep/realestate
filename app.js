/* ============ REAL ESTATE INTELLIGENCE DESK — FRONTEND APPLICATION ============ */

// ===== 1. CONSTANTS =====
const DEFAULT_RECIPIENTS = [
  { id: 'g1', name: 'Builder Clients', count: 0, desc: 'Developers & promoters you advise', contacts: [] },
  { id: 'g2', name: 'Broker Groups', count: 0, desc: 'Channel partners across MMR & Pune', contacts: [] },
  { id: 'g3', name: 'Investor Groups', count: 0, desc: 'HNI & retail investor circles', contacts: [] },
  { id: 'g4', name: 'Internal Team', count: 0, desc: 'Office & field staff', contacts: [] }
];

// Category-specific default images (served locally)
const CATEGORY_IMAGES = {
  'Project Launch': '/images/categories/project-launch.png',
  'Land Acquisition': '/images/categories/land-acquisition.png',
  'Redevelopment': '/images/categories/redevelopment.png',
  'RERA': '/images/categories/rera.png',
  'Funding': '/images/categories/funding.png',
  'Government Policy': '/images/categories/government-policy.png',
  'Infrastructure': '/images/categories/infrastructure.png',
  'Litigation': '/images/categories/litigation.png'
};

function extractActualSource(title, link, defaultSource) {
  let source = defaultSource || 'Unknown Source';
  
  if (source.includes('Google') || source.includes('Indexer') || source.toLowerCase().includes('search')) {
    if (title && (title.includes(' - ') || title.includes(' | '))) {
      const parts = title.split(/ \- | \| /);
      const possibleSource = parts[parts.length - 1].trim();
      if (possibleSource.length > 2 && possibleSource.length < 25) {
        return possibleSource;
      }
    }
  }

  if (link) {
    try {
      const url = new URL(link);
      const host = url.hostname.replace('www.', '').toLowerCase();
      
      const domainMap = {
        'realty.economictimes.indiatimes.com': 'ET Realty',
        'economictimes.indiatimes.com': 'Economic Times',
        'moneycontrol.com': 'Moneycontrol',
        'livemint.com': 'Livemint',
        'hindustantimes.com': 'Hindustan Times',
        'indianexpress.com': 'Indian Express',
        'timesofindia.indiatimes.com': 'Times of India',
        'thehindu.com': 'The Hindu',
        'financialexpress.com': 'Financial Express',
        'cnbctv18.com': 'CNBC-TV18',
        'business-standard.com': 'Business Standard',
        'housing.com': 'Housing News',
        'constructionweekonline.in': 'Construction Week',
        'realtyplusmag.com': 'Realty Plus',
        'magicbricks.com': 'Magicbricks',
        '99acres.com': '99acres',
        'maharera.maharashtra.gov.in': 'MahaRERA',
        'mohua.gov.in': 'MoHUA'
      };

      for (const [domain, brand] of Object.entries(domainMap)) {
        if (host.includes(domain)) {
          return brand;
        }
      }
      
      const hostParts = host.split('.');
      if (hostParts.length >= 2) {
        const primary = hostParts[hostParts.length - 2];
        return primary.charAt(0).toUpperCase() + primary.slice(1);
      }
    } catch (e) {
      // ignore
    }
  }

  return source;
}

// ===== 2. STATE VARIABLES =====
let NEWS = [];
let saved = new Set();
let selected = new Set();
let activeView = 'feed';
let recipientGroups = [];
let campaigns = [];
let sourceConfigs = [];
let dispatchLogs = [];
let scrapeRuns = [];
let systemSettings = { autosend_enabled: true, maharashtra_first: false };
let expandedGroupId = null;
let filterCity = 'All';
let filterCategory = 'All';
let filterRera = 'All';
let filterPriority = 'All';
let modalStep = 1;
let chosenFormats = new Set(['whatsapp', 'email', 'pdf']);
let chosenRecipients = new Set();

// ===== 3. ENVIRONMENT DETECTION =====
// Backend mode ONLY when running on Netlify Dev (port 8888) or a real deployed domain.
// VS Code Live Server (port 5500), port 3000, direct file:// etc. are all static-only.
const isBackendMode = (
  window.location.port === '8888' ||
  (window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1' &&
    window.location.protocol !== 'file:')
);

// ===== 4. SECURE HEADERS =====
// API keys MUST NEVER be sent from the frontend.
// They are stored exclusively in Netlify environment variables (process.env on the serverless function).
// This function only sets Content-Type.
function getHeaders() {
  return { 'Content-Type': 'application/json' };
}

// ===== 5. TOAST NOTIFICATION SYSTEM =====
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warn: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show'); }); });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ===== 6. STORAGE HELPER =====
function saveToLocalStorage(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ===== 7. INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  // NOTE: API keys are NEVER hardcoded here.
  // On Netlify (backend mode): keys live exclusively in Netlify env vars (GROQ_API_KEY_1, GROQ_API_KEY_2).
  // On client-side mode: users enter their own key via Admin Panel > AI Engine Settings.

  // Load from localStorage
  NEWS = JSON.parse(localStorage.getItem('re_news')) || [];
  saved = new Set(JSON.parse(localStorage.getItem('re_saved')) || []);
  recipientGroups = JSON.parse(localStorage.getItem('re_recipients')) || DEFAULT_RECIPIENTS;
  campaigns = JSON.parse(localStorage.getItem('re_campaigns')) || [];

  // Migration: clean up cached 'Google News Indexer' sources on load
  let migrationUpdated = false;
  NEWS.forEach(n => {
    if (n.source === 'Google News Indexer' || n.source === 'Google News') {
      const betterSource = extractActualSource(n.project || n.headline, n.link, n.source);
      if (betterSource && betterSource !== n.source) {
        n.source = betterSource;
        migrationUpdated = true;
      }
    }
  });
  if (migrationUpdated) {
    saveToLocalStorage('re_news', NEWS);
  }

  // Startup Cleanup: Only keep news from last 3 days and remove duplicates
  const startupCutoff = new Date();
  startupCutoff.setDate(startupCutoff.getDate() - 3);

  // 1. Filter out articles older than 3 days
  NEWS = NEWS.filter(n => {
    const d = new Date(n.date || n.pubDate);
    return !isNaN(d.getTime()) && d >= startupCutoff;
  });

  // 2. Link-based deduplication (fast pass — catches exact same source article)
  const seenLinks = new Set();
  NEWS = NEWS.filter(n => {
    const normLink = n.originalLink || normalizeUrl(n.link);
    if (normLink && normLink !== '' && seenLinks.has(normLink)) return false;
    if (normLink) seenLinks.add(normLink);
    return true;
  });

  // 3. Jaccard Deduplication on BOTH originalTitle and headline
  const uniqueNews = [];
  const uniqueOrigTokenSets = [];  // tokens from originalTitle
  const uniqueHeadTokenSets = [];  // tokens from headline
  for (const item of NEWS) {
    const origTitle = item.originalTitle || item.title || '';
    const headline = item.headline || '';
    const origTokens = clientGetTokens(origTitle);
    const headTokens = clientGetTokens(headline);
    let isDup = false;
    for (let i = 0; i < uniqueNews.length; i++) {
      // Check similarity against both originalTitle and headline of existing items
      const simOrig = clientJaccardSimilarity(origTokens, uniqueOrigTokenSets[i]);
      const simHead = clientJaccardSimilarity(headTokens, uniqueHeadTokenSets[i]);
      const simCross1 = clientJaccardSimilarity(origTokens, uniqueHeadTokenSets[i]);
      const simCross2 = clientJaccardSimilarity(headTokens, uniqueOrigTokenSets[i]);
      const maxSim = Math.max(simOrig, simHead, simCross1, simCross2);
      if (maxSim > 0.35) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      uniqueNews.push(item);
      uniqueOrigTokenSets.push(origTokens);
      uniqueHeadTokenSets.push(headTokens);
    }
  }
  NEWS = uniqueNews;
  saveToLocalStorage('re_news', NEWS);

  if (isBackendMode) {
    console.log('%c[System] Backend mode detected. Syncing cloud data...', 'color:#1B4332;font-weight:bold;');
    try {
      const res = await fetch('/api/recipients', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.groups && data.groups.length > 0) {
          recipientGroups = data.groups;
          saveToLocalStorage('re_recipients', recipientGroups);
        }
      }
    } catch (e) { console.log('[Offline] Backend recipients sync failed. Using local data.'); }

    try {
      const res = await fetch('/api/broadcast', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.campaigns) {
          campaigns = data.campaigns;
          saveToLocalStorage('re_campaigns', campaigns);
        }
      }
    } catch (e) { console.log('[Offline] Backend campaigns sync failed. Using local data.'); }

    try {
      const res = await fetch('/api/system-status', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          sourceConfigs = data.configs || [];
          systemSettings = data.settings || systemSettings;
          scrapeRuns = data.runs || [];
          dispatchLogs = data.dispatches || [];
          if (data.articles && data.articles.length > 0) {
            NEWS = data.articles;
            saveToLocalStorage('re_news', NEWS);
          }
          saveToLocalStorage('re_source_configs', sourceConfigs);
          saveToLocalStorage('re_system_settings', systemSettings);
          saveToLocalStorage('re_scrape_runs', scrapeRuns);
          saveToLocalStorage('re_dispatch_logs', dispatchLogs);
        }
      }
    } catch (e) { console.log('[Offline] Backend system status sync failed. Using local data.'); }
  } else {
    console.log('%c[System] Static file mode (VS Code Live Server). Backend API calls are disabled.', 'color:#B68D40;font-weight:bold;');
    sourceConfigs = JSON.parse(localStorage.getItem('re_source_configs')) || [];
    systemSettings = JSON.parse(localStorage.getItem('re_system_settings')) || systemSettings;
    scrapeRuns = JSON.parse(localStorage.getItem('re_scrape_runs')) || [];
    dispatchLogs = JSON.parse(localStorage.getItem('re_dispatch_logs')) || [];
  }

  setupMobileNav();
  setupEvents();
  switchView('feed');
});

// ===== 8. MOBILE NAV =====
function setupMobileNav() {
  const hamburger = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (mobileNav.classList.contains('open') &&
      !hamburger.contains(e.target) &&
      !mobileNav.contains(e.target)) {
      mobileNav.classList.remove('open');
    }
  });
}

// ===== 9. VIEW SWITCHING =====
function switchView(view) {
  activeView = view;
  ['feed', 'detail', 'saved', 'admin'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== view);
  });

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  // Close mobile nav after navigation
  document.getElementById('mobileNav')?.classList.remove('open');

  if (view === 'feed') renderFeed();
  if (view === 'saved') renderSaved();
  if (view === 'admin') renderAdmin();

  updateTray();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 10. UTILITY FUNCTIONS =====
function statusColor(status) {
  const map = {
    'New Launch': 'var(--rust)',
    'Under Construction': '#8A6A2A',
    'Completed': 'var(--forest)',
    'Redevelopment': '#5B4636',
    'Regulatory Update': '#3A4A6B',
    'Infrastructure Update': '#1565c0',
    'Litigation Update': '#6a1b9a',
    'Acquisition Complete': '#0277bd',
    'Policy Approved': '#00695c',
    'Funding Closed': '#1565c0'
  };
  return map[status] || 'var(--ink-soft)';
}

function priorityClass(score) {
  if (score >= 7) return 'priority-high';
  if (score >= 5) return 'priority-mid';
  return 'priority-low';
}

function hasValidThumbnail(img) {
  if (!img) return false;
  // Filter out old Unsplash stock placeholders
  if (img.includes('images.unsplash.com/photo-') && (
    img.includes('1545324418') ||
    img.includes('1502672260') ||
    img.includes('1486406146') ||
    img.includes('1582407947') ||
    img.includes('1565182999') ||
    img.includes('1493809842') ||
    img.includes('1600585154') ||
    img.includes('1589829545') ||
    img.includes('1486325212')
  )) {
    return false;
  }
  // Filter out local category default images (these are fallbacks, not real thumbnails)
  if (img.startsWith('/images/categories/')) {
    return false;
  }
  return true;
}

function getCategoryImage(category) {
  return CATEGORY_IMAGES[category] || '/images/categories/project-launch.png';
}

// ===== 11. NEWS CARD TEMPLATE =====
function categoryCoverHTML(category, city) {
  const cat = category ? category.trim() : '';
  let initial = 'RE';
  let className = 'cover-general';

  if (cat === 'Project Launch') {
    initial = 'PL';
    className = 'cover-launch';
  } else if (cat === 'Land Acquisition') {
    initial = 'LA';
    className = 'cover-land';
  } else if (cat === 'Redevelopment') {
    initial = 'RD';
    className = 'cover-redev';
  } else if (cat === 'RERA') {
    initial = 'RR';
    className = 'cover-rera';
  } else if (cat === 'Funding') {
    initial = 'FD';
    className = 'cover-funding';
  } else if (cat === 'Government Policy') {
    initial = 'GP';
    className = 'cover-policy';
  } else if (cat === 'Infrastructure') {
    initial = 'IF';
    className = 'cover-infra';
  } else if (cat === 'Litigation') {
    initial = 'LT';
    className = 'cover-lit';
  }

  const cityDisplay = city && city !== '—' ? city.toUpperCase() : 'INDIA';

  return `
    <div class="card-cover-template ${className}">
      <div class="cover-pattern"></div>
      <div class="cover-initial">${initial}</div>
      <div class="cover-city-stamp">${cityDisplay}</div>
    </div>
  `;
}

function cardTemplate(n) {
  const isChecked = selected.has(n.id);
  const isSaved = saved.has(n.id);

  return `
  <div class="card ${isChecked ? 'selected' : ''}" data-id="${n.id}">
    <div class="card-top">
      <div class="card-img">
        ${hasValidThumbnail(n.img) ? `<img src="${n.img}" alt="${n.headline}" loading="lazy">` : `<img src="${getCategoryImage(n.category)}" alt="${n.category}" loading="lazy">`}
        <div class="card-checkbox ${isChecked ? 'checked' : ''}" data-action="select" data-id="${n.id}" title="Select for bulletin">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="card-status" style="background:${statusColor(n.status)}">${n.status}</div>
        <div class="card-priority ${priorityClass(n.priorityScore)}" title="Priority Score: ${n.priorityScore}/10">${n.priorityScore}</div>
      </div>
      <div class="card-body">
        <div class="card-meta-row">
          <span class="badge cat">${n.category}</span>
          <span class="badge src">${n.source}</span>
          <span class="card-date">${n.date}</span>
        </div>
        <h2 data-action="open" data-id="${n.id}">${n.headline}</h2>
        <p class="card-summary">${n.summary}</p>
        <div class="facts">
          <div class="fact"><label>Builder</label><span>${n.builder}</span></div>
          <div class="fact"><label>Project</label><span>${n.project || '—'}</span></div>
          <div class="fact"><label>City / Locality</label><span>${n.city}${n.locality ? ', ' + n.locality : ''}</span></div>
          <div class="fact"><label>State</label><span>${n.state}</span></div>
          <div class="fact"><label>Project Type</label><span>${n.type || '—'}</span></div>
          <div class="fact"><label>RERA No.</label><span class="mono">${n.rera || '—'}</span></div>
        </div>
        <div class="card-foot">
          <button class="icon-btn ${isSaved ? 'saved' : ''}" data-action="save" data-id="${n.id}" title="Save">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          </button>
          <button class="icon-btn" data-action="share-whatsapp" data-id="${n.id}" title="Share via WhatsApp" style="color:#25D366;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.3A8 8 0 003.9 16.9L3 21l4.2-1.1A8 8 0 0017.6 6.3z"/></svg>
          </button>
          ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener" class="readmore">Read Original <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a>` : `<button class="readmore" data-action="open" data-id="${n.id}">Read More <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>`}
        </div>
      </div>
    </div>
  </div>`;
}

// ===== 12. FILTER LOGIC =====
function getFilteredNews() {
  const filtered = NEWS.filter(n => {
    if (filterCity !== 'All' && n.city.toLowerCase() !== filterCity.toLowerCase()) return false;
    if (filterCategory !== 'All' && n.category.toLowerCase() !== filterCategory.toLowerCase()) return false;
    if (filterRera !== 'All' && (n.rera === '—' || !n.rera || n.rera === 'Pending Registration')) return false;
    if (filterPriority === 'High' && n.priorityScore < 7) return false;
    if (filterPriority === 'Normal' && n.priorityScore >= 7) return false;
    return true;
  });

  // Always sort: latest date first, fallback to highest priority score
  filtered.sort((a, b) => {
    const dateA = new Date(a.date || a.pubDate);
    const dateB = new Date(b.date || b.pubDate);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      if (dateA.getTime() !== dateB.getTime()) {
        return dateB - dateA;
      }
    }
    return (b.priorityScore || 0) - (a.priorityScore || 0);
  });

  return filtered;
}

// ===== 13. RENDER FEED =====
function renderFeed() {
  const listEl = document.getElementById('feedList');
  if (!listEl) return;

  if (NEWS.length === 0) {
    listEl.innerHTML = `
      <div class="welcome-hero">
        <div class="welcome-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          System Ready
        </div>
        <div class="welcome-grid">
          <div>
            <h1 class="welcome-title">Real Estate News Intelligence &amp; Distribution Portal</h1>
            <p class="welcome-desc">Automatically collect, filter, summarize and distribute Indian real estate news daily. Click below to run the first AI pipeline and populate your desk with live news.</p>
            <div class="welcome-action-box">
              <p>Your desk is empty. Click below to fetch today's real estate news from 8+ national and regional sources.</p>
              <button class="pulse-btn" id="btnWelcomeScrape">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
                Collect &amp; Process Today's News
              </button>
              <div class="welcome-console" id="welcomeConsole"></div>
            </div>
          </div>
          <div class="welcome-guide-box">
            <h3>How It Works</h3>
            <div class="guide-steps">
              <div class="guide-step">
                <div class="guide-num">1</div>
                <div class="guide-text">
                  <p>AI Scraping Pipeline</p>
                  <span>Collects 500+ articles daily from RSS feeds, newspapers, and RERA portals. Filters top 50 relevant items.</span>
                </div>
              </div>
              <div class="guide-step">
                <div class="guide-num">2</div>
                <div class="guide-text">
                  <p>Automated at 8:00 AM IST</p>
                  <span>Pipeline runs daily automatically. All API keys are pre-configured on the server — no manual setup needed.</span>
                </div>
              </div>
              <div class="guide-step">
                <div class="guide-num">3</div>
                <div class="guide-text">
                  <p>Distribute to 5,000+ Recipients</p>
                  <span>Select news cards, create bulletins and send via WhatsApp, Email, and PDF to your full subscriber database.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('resultCount').textContent = 'Desk is empty — Ready for first AI run';

    // FIXED: Button now triggers scraper inline without redirecting to Admin Panel
    document.getElementById('btnWelcomeScrape').addEventListener('click', () => {
      triggerManualScrape({ inline: true });
    });
    return;
  }

  const filtered = getFilteredNews();

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="stamp"><span>NO<br>MATCH</span></div>
        <p>No updates match the active filters. Try resetting your filters.</p>
      </div>`;
    document.getElementById('resultCount').textContent = '0 updates matched filters';
  } else {
    listEl.innerHTML = filtered.map(cardTemplate).join('');
    document.getElementById('resultCount').textContent = `${filtered.length} updates · sorted by latest`;
  }
}

// ===== 14. RENDER SAVED =====
function renderSaved() {
  const list = NEWS.filter(n => saved.has(n.id));
  const countEl = document.getElementById('savedCount');
  const listEl = document.getElementById('savedList');
  countEl.textContent = `${list.length} bookmarked update${list.length !== 1 ? 's' : ''}`;
  listEl.innerHTML = list.length
    ? list.map(cardTemplate).join('')
    : `<div class="empty-state"><div class="stamp"><span>NO<br>SAVES</span></div><p>Nothing saved yet. Tap the bookmark icon on any update to keep it here.</p></div>`;
}
// ===== 15. RENDER ADMIN =====
function renderAdmin() {
  const inputGroq = document.getElementById('inputGroqKey');
  const inputGrok = document.getElementById('inputGrokKey');
  const selectProvider = document.getElementById('selectAiProvider');
  const inputResend = document.getElementById('inputResendKey');
  const inputWaToken = document.getElementById('inputWaToken');
  const inputWaPhoneId = document.getElementById('inputWaPhoneId');

  const groqKey = localStorage.getItem('api_groq_1') || '';
  const grokKey = localStorage.getItem('api_grok_1') || '';
  const provider = localStorage.getItem('api_provider') || 'groq';

  if (inputGroq) inputGroq.value = groqKey;
  if (inputGrok) inputGrok.value = grokKey;
  if (selectProvider) selectProvider.value = provider;
  if (inputResend) inputResend.value = localStorage.getItem('api_resend_key') || '';
  if (inputWaToken) inputWaToken.value = localStorage.getItem('api_wa_token') || '';
  if (inputWaPhoneId) inputWaPhoneId.value = localStorage.getItem('api_wa_phone_id') || '';

  const msgEl = document.getElementById('keyStatusMsg');
  if (msgEl) {
    if (isBackendMode) {
      msgEl.textContent = '✓ Running in production mode — AI engine credentials live on the backend server.';
      msgEl.style.color = 'var(--success)';
    } else {
      const activeKey = provider === 'grok' ? grokKey : groqKey;
      const activeName = provider === 'grok' ? 'Grok' : 'Groq';
      if (activeKey) {
        msgEl.textContent = `✓ API key saved. Client-side scraper is ready using ${activeName}.`;
        msgEl.style.color = 'var(--success)';
      } else {
        msgEl.textContent = `⚠ No API key configured. Enter a key above for browser bypass. In production, keys are managed on the server.`;
        msgEl.style.color = 'var(--rust)';
      }
    }
  }

  // Load toggles based on systemSettings
  const chkAutoSend = document.getElementById('chkAutoSend');
  const chkMH = document.getElementById('chkMaharashtraFirst');
  if (chkAutoSend) chkAutoSend.checked = systemSettings.autosend_enabled;
  if (chkMH) chkMH.checked = systemSettings.maharashtra_first;

  renderAdminRecipients();
  renderAnalytics();
  renderAdminSources();
  renderScrapeRunsStatus();
  renderDispatchLogs();
}

// --- Admin: Recipients Management ---
function renderAdminRecipients() {
  const container = document.getElementById('adminContactList');
  if (!container) return;

  if (recipientGroups.length === 0) {
    container.innerHTML = `<p style="color:var(--ink-soft);font-size:13px;margin:8px 0;">No recipient groups yet. Create your first group below.</p>`;
    return;
  }

  container.innerHTML = recipientGroups.map(g => {
    const isExpanded = expandedGroupId === g.id;
    const count = g.contacts ? g.contacts.length : 0;

    const expandedHTML = isExpanded ? `
      <div class="admin-recipient-expand">
        <p class="section-label" style="margin-bottom:8px;">Contacts in ${g.name}</p>
        <div class="contacts-table-wrap">
          <table class="contacts-table">
            <thead>
              <tr>
                <th>Name &amp; Filtering Preferences</th>
                <th>Email</th>
                <th>WhatsApp</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              ${(g.contacts || []).length > 0 ? (g.contacts || []).map((c, idx) => {
                const channel = c.preferred_channel || 'whatsapp';
                const states = c.preferred_states && c.preferred_states.length > 0 ? c.preferred_states.join(', ') : 'All';
                const cities = c.preferred_cities && c.preferred_cities.length > 0 ? c.preferred_cities.join(', ') : 'All';
                const cats = c.preferred_categories && c.preferred_categories.length > 0 ? c.preferred_categories.join(', ') : 'All';
                return `
                <tr>
                  <td>
                    <b>${c.name}</b>
                    <div style="font-size:10px; color:var(--ink-soft); margin-top:2px;">
                      Channel: <span style="text-transform:capitalize; font-weight:600;">${channel}</span> | 
                      States: ${states} | Cities: ${cities} | Cats: ${cats}
                    </div>
                  </td>
                  <td style="color:var(--ink-soft); font-size:11.5px;">${c.email || '—'}</td>
                  <td style="font-family:monospace; color:var(--ink-soft); font-size:11.5px;">${c.whatsapp || '—'}</td>
                  <td>
                    <button style="background:none; border:none; cursor:pointer; color:var(--rust); padding:4px; font-size:12px; font-weight:700;" 
                      data-action="delete-single-contact" data-gid="${g.id}" data-idx="${idx}" title="Remove">✕</button>
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="4" style="padding:16px; text-align:center; color:var(--ink-soft); font-size:12px;">No contacts yet. Add manually or import CSV.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="add-contact-form" style="display:flex; flex-direction:column; gap:8px; border:1px solid var(--sand-dark); padding:10px; border-radius:6px; background:var(--sand); margin-top:10px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:120px;">
              <label>Full Name</label>
              <input type="text" id="addName_${g.id}" placeholder="e.g. Rahul Sharma" style="width:100%;">
            </div>
            <div class="form-group" style="flex:1; min-width:120px;">
              <label>Email Address</label>
              <input type="email" id="addEmail_${g.id}" placeholder="e.g. rahul@example.com" style="width:100%;">
            </div>
            <div class="form-group" style="flex:1; min-width:120px;">
              <label>WhatsApp</label>
              <input type="text" id="addWa_${g.id}" placeholder="+919876543210" style="width:100%;">
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:100px;">
              <label>Channel</label>
              <select id="addChannel_${g.id}" style="height:36px; border:1px solid var(--sand-dark); border-radius:6px; padding:0 8px; background:white; width:100%;">
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div class="form-group" style="flex:1.5; min-width:120px;">
              <label>Preferred States (Semicolon-sep)</label>
              <input type="text" id="addStates_${g.id}" placeholder="e.g. Maharashtra; Rajasthan" style="width:100%;">
            </div>
            <div class="form-group" style="flex:1.5; min-width:120px;">
              <label>Preferred Cities (Semicolon-sep)</label>
              <input type="text" id="addCities_${g.id}" placeholder="e.g. Mumbai; Pune" style="width:100%;">
            </div>
            <div class="form-group" style="flex:1.5; min-width:120px;">
              <label>Preferred Categories</label>
              <input type="text" id="addCategories_${g.id}" placeholder="e.g. Launch; RERA" style="width:100%;">
            </div>
          </div>
          <button class="btn primary small" data-action="save-manual-contact" data-gid="${g.id}" style="height:32px; align-self:flex-end;">+ Add Contact</button>
        </div>

        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <label class="btn ghost small" style="display:inline-flex; align-items:center; cursor:pointer;">
            Import CSV
            <input type="file" class="csv-group-uploader hidden" data-gid="${g.id}" accept=".csv">
          </label>
        </div>
      </div>` : '';

    return `
      <div class="admin-recipient-group">
        <div class="admin-recipient-head" data-action="toggle-expand-group" data-gid="${g.id}">
          <div class="r-avatar">${count}</div>
          <div class="r-info">
            <p>${g.name}</p>
            <small>${count} contacts · ${g.desc}</small>
          </div>
          <div class="r-actions" onclick="event.stopPropagation()">
            <button data-action="delete-group" data-gid="${g.id}" class="del-btn">Delete</button>
            <span style="color:var(--ink-soft); transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; display:inline-block; transition:transform .2s; pointer-events:none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
        </div>
        ${expandedHTML}
      </div>`;
  }).join('');

  container.querySelectorAll('.csv-group-uploader').forEach(input => {
    input.onchange = (e) => handleCSVFileSelect(e.target.files[0], input.dataset.gid);
  });
}

// --- Admin: Campaign Analytics ---
function renderAnalytics() {
  let totalSent = 0, totalOpens = 0, totalClicks = 0;
  campaigns.forEach(c => {
    totalSent += c.stats.sent || 0;
    totalOpens += c.stats.opened || 0;
    totalClicks += c.stats.clicked || 0;
  });

  const sentEl = document.getElementById('statSent');
  const opensEl = document.getElementById('statOpens');
  const clicksEl = document.getElementById('statClicks');
  if (sentEl) sentEl.textContent = totalSent.toLocaleString();
  if (opensEl) opensEl.textContent = totalOpens.toLocaleString();
  if (clicksEl) clicksEl.textContent = totalClicks.toLocaleString();

  const chartEl = document.getElementById('analyticsChart');
  if (chartEl) {
    const recent = campaigns.slice(0, 5).reverse();
    if (recent.length === 0) {
      chartEl.innerHTML = `<div style="margin:auto; font-size:12px; color:var(--ink-soft);">No campaign data yet.</div>`;
    } else {
      chartEl.innerHTML = recent.map(c => {
        const openPct = c.stats.sent > 0 ? (c.stats.opened / c.stats.sent) * 100 : 0;
        const clickPct = c.stats.sent > 0 ? (c.stats.clicked / c.stats.sent) * 100 : 0;
        return `
          <div class="chart-bar-wrap">
            <div style="display:flex; gap:3px; height:110px; align-items:flex-end; width:100%; justify-content:center;">
              <div class="chart-bar opens" style="height:${openPct}%" data-val="${c.stats.opened} Opens"></div>
              <div class="chart-bar clicks" style="height:${clickPct}%" data-val="${c.stats.clicked} Clicks"></div>
            </div>
            <span class="chart-label" title="${c.subject}">${c.date}</span>
          </div>`;
      }).join('');
    }
  }

  const logListEl = document.getElementById('campaignLogList');
  if (logListEl) {
    logListEl.innerHTML = campaigns.length === 0
      ? `<p style="font-size:12px; color:var(--ink-soft); margin:0;">No campaigns dispatched yet.</p>`
      : campaigns.map(c => `
          <div class="campaign-row">
            <div class="campaign-info">
              <p>${c.subject}</p>
              <small>${c.date} · ${c.formats ? c.formats.join(', ') : 'N/A'} · ${c.mode || 'Live'}</small>
            </div>
            <div class="campaign-metrics">
              <span><b>S:</b>${c.stats.sent}</span>
              <span style="color:#8A6A2A"><b>O:</b>${c.stats.opened}</span>
              <span style="color:var(--rust)"><b>C:</b>${c.stats.clicked}</span>
            </div>
          </div>`).join('');
  }
}

// --- Admin: Source Configurations ---
function renderAdminSources() {
  const container = document.getElementById('adminSourceConfigList');
  if (!container) return;

  if (sourceConfigs.length === 0) {
    container.innerHTML = `<p style="padding:16px; text-align:center; color:var(--ink-soft); font-size:12px;">No news sources configured. Add one below.</p>`;
    return;
  }

  container.innerHTML = `
    <table class="contacts-table" style="margin:0; width:100%;">
      <thead>
        <tr>
          <th>Source Name &amp; URL</th>
          <th>Type</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${sourceConfigs.map((s, idx) => `
          <tr>
            <td>
              <b style="font-size:12.5px;">${s.name}</b>
              <div style="font-size:10px; color:var(--ink-soft); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${s.url}
              </div>
              ${s.selector ? `<div style="font-size:9.5px; color:var(--rust);">Selector: ${s.selector}</div>` : ''}
            </td>
            <td style="font-size:11.5px; text-transform:uppercase; color:var(--ink-soft); font-weight:600;">
              ${s.type.replace('_', ' ')}
            </td>
            <td>
              <span class="status-val ${s.active ? 'green' : 'rust'}" style="font-size:10px; padding:2px 6px; cursor:pointer;" data-action="toggle-source-active" data-id="${s.id}">
                ${s.active ? 'Active' : 'Disabled'}
              </span>
            </td>
            <td>
              <button style="background:none; border:none; cursor:pointer; color:var(--rust); padding:4px; font-size:12px; font-weight:700;" 
                data-action="delete-source" data-id="${s.id}" title="Delete">✕</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// --- Admin: Scraper Runs Log Status ---
function renderScrapeRunsStatus() {
  const lblTime = document.getElementById('lblLastScrapeTime');
  const lblScraped = document.getElementById('lblLastScrapedCount');
  const lblDedup = document.getElementById('lblLastDedupCount');
  const lblShortlisted = document.getElementById('lblLastShortlistedCount');

  if (scrapeRuns.length > 0) {
    const last = scrapeRuns[0];
    const date = new Date(last.run_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    if (lblTime) lblTime.textContent = `${date} (${last.status || 'Success'})`;
    if (lblScraped) lblScraped.textContent = last.items_collected || 0;
    if (lblDedup) lblDedup.textContent = last.items_after_dedup || 0;
    if (lblShortlisted) lblShortlisted.textContent = last.items_shortlisted || 0;
  }
}

// --- Admin: Personalized Dispatches Log ---
function renderDispatchLogs() {
  const container = document.getElementById('dispatchLogList');
  if (!container) return;

  if (dispatchLogs.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:var(--ink-soft); margin:0;">No personalized dispatches logged yet.</p>`;
    return;
  }

  container.innerHTML = dispatchLogs.map((log, idx) => `
    <div class="campaign-row" style="display:flex; justify-content:space-between; align-items:center;">
      <div class="campaign-info">
        <p style="font-weight:600; font-size:13px;">${log.recipient_name}</p>
        <small>${log.date} · Channel: <span style="text-transform:capitalize;">${log.channel}</span> · ${log.news_item_ids ? log.news_item_ids.length : 0} items</small>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span class="status-val green" style="font-size:10px; padding:2px 6px;">${log.status || 'Sent'}</span>
        <button class="btn ghost small" style="padding:2px 8px; font-size:10.5px; height:24px;" 
          data-action="download-personal-pdf" data-idx="${idx}">PDF</button>
      </div>
    </div>`).join('');
}


// ===== 16. DETAIL VIEW =====
function openDetail(id) {
  const n = NEWS.find(x => x.id === id);
  if (!n) return;
  const related = NEWS.filter(x => x.id !== id && (x.city === n.city || x.category === n.category)).slice(0, 3);
  const imgSrc = hasValidThumbnail(n.img) ? n.img : getCategoryImage(n.category);
  const fallbackImg = getCategoryImage(n.category);

  document.getElementById('view-detail').innerHTML = `
    <a class="back-link" href="#" data-action="back">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      Back to feed
    </a>
    <div class="detail-hero">
      <img src="${imgSrc}" alt="${n.headline}" onerror="this.src='${fallbackImg}'">
      ${n.rerastatus && n.rerastatus.includes('Registered') ? `<div class="stamp"><span>RERA<br>VERIFIED</span></div>` : ''}
    </div>
    <div class="detail">
      <div class="detail-title-row">
        <span class="badge cat">${n.category}</span>
        <span class="badge src">${n.source}</span>
        <span class="card-status" style="background:${statusColor(n.status)};position:static;">${n.status}</span>
        <div class="card-priority ${priorityClass(n.priorityScore)}" style="position:static;width:28px;height:28px;box-shadow:none;" title="Priority: ${n.priorityScore}">${n.priorityScore}</div>
      </div>
      <h1>${n.headline}</h1>
      <div class="detail-byline">${n.date} · ${n.city}, ${n.state} · Source: ${n.source}</div>

      <div class="detail-summary">
        <b>Editorial Summary</b>
        ${n.summary}
      </div>

      <div class="detail-body">
        <p>Local industry participants are tracking the regulatory timeline, compliance mandates, and land registration metrics associated with this update. Market observers note that this development reflects broader trends in Indian real estate, with significant implications for both end-users and institutional investors in the region.</p>
        <p>Brokers and advisors are recommended to cross-verify RERA registration number <b>${n.rera !== '—' ? n.rera : 'Pending'}</b> directly on the state RERA portal before making any investment or advisory commitments. <a href="${n.link || '#'}" target="_blank" rel="noopener" style="color:var(--forest);font-weight:600;">Read the original source article ↗</a></p>
      </div>

      <div class="spec-table">
        <h3>Project Intelligence Specifications</h3>
        <div class="spec-grid">
          <div class="fact"><label>Builder</label><span>${n.builder}</span></div>
          <div class="fact"><label>Project Name</label><span>${n.project || '—'}</span></div>
          <div class="fact"><label>City</label><span>${n.city}</span></div>
          <div class="fact"><label>Locality</label><span>${n.locality || 'Statewide'}</span></div>
          <div class="fact"><label>State</label><span>${n.state}</span></div>
          <div class="fact"><label>Project Type</label><span>${n.type || '—'}</span></div>
          <div class="fact"><label>RERA Number</label><span class="mono">${n.rera || '—'}</span></div>
          <div class="fact"><label>RERA Status</label><span>${n.rerastatus || '—'}</span></div>
          <div class="fact"><label>Configuration</label><span>${n.config || '—'}</span></div>
          <div class="fact"><label>Starting Price</label><span>${n.price || '—'}</span></div>
          <div class="fact"><label>Possession Date</label><span>${n.possession || '—'}</span></div>
          <div class="fact"><label>Address</label><span>${n.address || '—'}</span></div>
        </div>
      </div>

      ${n.amenities && n.amenities.length ? `
      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-soft);margin-bottom:10px;">Amenities</h3>
      <div class="amenity-row">${n.amenities.map(a => `<span class="amenity">${a}</span>`).join('')}</div>` : ''}

      <div class="map-block">
        <div class="map-pin"><div class="map-pin-dot"></div><span>${n.locality || n.city}, ${n.city}</span></div>
      </div>

      <div class="share-row">
        <button class="share-btn" data-action="share-whatsapp" data-id="${n.id}" style="color:#25D366;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.3A8 8 0 003.9 16.9L3 21l4.2-1.1A8 8 0 0017.6 6.3z"/></svg>
          Share on WhatsApp
        </button>
        ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener" class="share-btn">Open Original Article ↗</a>` : ''}
        <button class="share-btn" id="btnCopyLink">Copy Link</button>
        <button class="icon-btn ${saved.has(n.id) ? 'saved' : ''}" data-action="save" data-id="${n.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${saved.has(n.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </button>
      </div>

      <p class="related-head">Related Articles</p>
      <div class="related-grid">
        ${related.map(r => `
          <a class="related-card" href="#" data-action="open" data-id="${r.id}">
            <img src="${hasValidThumbnail(r.img) ? r.img : getCategoryImage(r.category)}" loading="lazy">
            <div><p>${r.headline}</p><small>${r.city} · ${r.date}</small></div>
          </a>`).join('') || '<p style="color:var(--ink-soft);font-size:13px;">No related updates found.</p>'}
      </div>
    </div>
  `;

  document.getElementById('btnCopyLink')?.addEventListener('click', () => {
    navigator.clipboard.writeText(n.link || window.location.href);
    showToast('Link copied to clipboard!', 'success');
  });

  // switchView calls scrollTo internally — no need to call it twice
  switchView('detail');
}

// ===== 17. TRAY =====
function updateTray() {
  const tray = document.getElementById('tray');
  document.getElementById('trayNum').textContent = selected.size;
  const isShowable = selected.size > 0 && ['feed', 'saved', 'detail'].includes(activeView);
  tray.classList.toggle('show', isShowable);
}

// ===== 18. EVENTS =====
function setupEvents() {
  // Global click delegation
  document.addEventListener('click', (e) => {
    // Admin Tabs Click Navigation
    const tabBtn = e.target.closest('#adminTabs .tab-btn');
    if (tabBtn) {
      const tabName = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('#adminTabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn === tabBtn);
      });

      const sections = {
        'pipeline': ['settingsCard', 'pipelineCard', 'exportCard'],
        'recipients': ['recipientsCard'],
        'sources': ['sourcesCard'],
        'analytics': ['analyticsCard']
      };

      for (const [key, cardIds] of Object.entries(sections)) {
        cardIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.classList.toggle('hidden', key !== tabName);
          }
        });
      }
      return;
    }

    // Navigation
    const navBtn = e.target.closest('.nav-btn');
    if (navBtn && navBtn.dataset.view) {
      switchView(navBtn.dataset.view);
      return;
    }

    // Back from detail
    const back = e.target.closest('[data-action="back"]');
    if (back) { e.preventDefault(); switchView('feed'); return; }

    // Open detail
    const openBtn = e.target.closest('[data-action="open"]');
    if (openBtn) { e.preventDefault(); openDetail(Number(openBtn.dataset.id)); return; }

    // Checkbox select
    const selBtn = e.target.closest('[data-action="select"]');
    if (selBtn) {
      e.preventDefault(); e.stopPropagation();
      const id = Number(selBtn.dataset.id);
      selected.has(id) ? selected.delete(id) : selected.add(id);
      renderFeed();
      if (activeView === 'saved') renderSaved();
      updateTray();
      return;
    }

    // Bookmark/Save
    const saveBtn = e.target.closest('[data-action="save"]');
    if (saveBtn) {
      e.preventDefault(); e.stopPropagation();
      const id = Number(saveBtn.dataset.id);
      const wasSaved = saved.has(id);
      wasSaved ? saved.delete(id) : saved.add(id);
      saveToLocalStorage('re_saved', Array.from(saved));
      renderFeed();
      if (activeView === 'saved') renderSaved();
      // Use wasSaved (before toggle) to get correct message
      showToast(wasSaved ? 'Removed from bookmarks' : 'Saved to bookmarks', wasSaved ? 'info' : 'success');
      return;
    }

    // WhatsApp Share
    const shareWA = e.target.closest('[data-action="share-whatsapp"]');
    if (shareWA) {
      e.preventDefault(); e.stopPropagation();
      const n = NEWS.find(x => x.id === Number(shareWA.dataset.id));
      if (n) {
        const text = `*${n.headline}*\n\n${n.summary}\n\n*Builder:* ${n.builder}\n*City:* ${n.city}\n*RERA:* ${n.rera || '—'}\n*Source:* ${n.source}${n.link ? '\n\n' + n.link : ''}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      }
      return;
    }

    // Toggle expand group (Admin recipients)
    const toggleGroup = e.target.closest('[data-action="toggle-expand-group"]');
    if (toggleGroup) {
      const gid = toggleGroup.dataset.gid;
      expandedGroupId = (expandedGroupId === gid) ? null : gid;
      renderAdminRecipients();
      return;
    }

    // Delete single contact
    const deleteContact = e.target.closest('[data-action="delete-single-contact"]');
    if (deleteContact) {
      const gid = deleteContact.dataset.gid;
      const idx = Number(deleteContact.dataset.idx);
      const group = recipientGroups.find(g => g.id === gid);
      if (group && confirm('Remove this contact?')) {
        group.contacts.splice(idx, 1);
        group.count = group.contacts.length;
        saveToLocalStorage('re_recipients', recipientGroups);
        renderAdminRecipients();
        showToast('Contact removed', 'warn');
      }
      return;
    }

    // Save manual contact
    const saveContact = e.target.closest('[data-action="save-manual-contact"]');
    if (saveContact) {
      const gid = saveContact.dataset.gid;
      const name = document.getElementById(`addName_${gid}`)?.value.trim();
      const email = document.getElementById(`addEmail_${gid}`)?.value.trim();
      const wa = document.getElementById(`addWa_${gid}`)?.value.trim();
      
      const channel = document.getElementById(`addChannel_${gid}`)?.value || 'whatsapp';
      const statesRaw = document.getElementById(`addStates_${gid}`)?.value.trim() || '';
      const citiesRaw = document.getElementById(`addCities_${gid}`)?.value.trim() || '';
      const categoriesRaw = document.getElementById(`addCategories_${gid}`)?.value.trim() || '';
      
      if (!name) { showToast('Contact name is required.', 'error'); return; }
      const group = recipientGroups.find(g => g.id === gid);
      if (group) {
        if (!group.contacts) group.contacts = [];
        
        const newContact = {
          id: 'c_' + Date.now(),
          name,
          email,
          whatsapp: wa,
          preferred_channel: channel,
          preferred_states: statesRaw ? statesRaw.split(';').map(s => s.trim()).filter(Boolean) : [],
          preferred_cities: citiesRaw ? citiesRaw.split(';').map(c => c.trim()).filter(Boolean) : [],
          preferred_categories: categoriesRaw ? categoriesRaw.split(';').map(c => c.trim()).filter(Boolean) : []
        };
        
        group.contacts.push(newContact);
        group.count = group.contacts.length;
        saveToLocalStorage('re_recipients', recipientGroups);
        renderAdminRecipients();
        showToast(`Contact "${name}" added to ${group.name}`, 'success');
        if (isBackendMode) {
          fetch('/api/recipients', { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify({ 
              action: 'import_contacts', 
              groupId: gid, 
              contacts: [newContact] // Send only new contact to prevent duplication
            }) 
          }).catch(() => { });
        }
      }
      return;
    }

    // Delete group
    const deleteGroupBtn = e.target.closest('[data-action="delete-group"]');
    if (deleteGroupBtn) {
      const gid = deleteGroupBtn.dataset.gid;
      if (confirm('Delete this entire recipient group? This cannot be undone.')) {
        recipientGroups = recipientGroups.filter(g => g.id !== gid);
        saveToLocalStorage('re_recipients', recipientGroups);
        renderAdminRecipients();
        showToast('Group deleted', 'warn');
      }
      return;
    }

    // Toggle Source Active
    const toggleSource = e.target.closest('[data-action="toggle-source-active"]');
    if (toggleSource) {
      const id = toggleSource.dataset.id;
      const config = sourceConfigs.find(s => s.id === id);
      if (config) {
        config.active = !config.active;
        saveToLocalStorage('re_source_configs', sourceConfigs);
        renderAdminSources();
        if (isBackendMode) {
          fetch('/api/system-status', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action: 'save_source', source: config })
          }).catch(() => {});
        }
      }
      return;
    }

    // Delete Source
    const deleteSource = e.target.closest('[data-action="delete-source"]');
    if (deleteSource && confirm('Are you sure you want to delete this source?')) {
      const id = deleteSource.dataset.id;
      sourceConfigs = sourceConfigs.filter(s => s.id !== id);
      saveToLocalStorage('re_source_configs', sourceConfigs);
      renderAdminSources();
      if (isBackendMode) {
        fetch('/api/system-status', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ action: 'delete_source', id })
        }).catch(() => {});
      }
      return;
    }

    // Add Source Button Toggle
    const btnAddSrc = e.target.closest('#btnAddSource');
    if (btnAddSrc) {
      const form = document.getElementById('newSourceForm');
      if (form) {
        form.classList.toggle('hidden');
        document.getElementById('nsName').value = '';
        document.getElementById('nsUrl').value = '';
        document.getElementById('nsSelector').value = '';
      }
      return;
    }

    // Cancel Source Add
    const btnCancelSrc = e.target.closest('#btnCancelSource');
    if (btnCancelSrc) {
      document.getElementById('newSourceForm')?.classList.add('hidden');
      return;
    }

    // Save New Source
    const btnSaveSrc = e.target.closest('#btnSaveSource');
    if (btnSaveSrc) {
      const name = document.getElementById('nsName').value.trim();
      const type = document.getElementById('nsType').value;
      const url = document.getElementById('nsUrl').value.trim();
      const selector = document.getElementById('nsSelector').value.trim();
      
      if (!name || !url) {
        showToast('Source Name and URL are required.', 'error');
        return;
      }
      
      const newSrc = { name, type, url, selector, active: true };
      if (isBackendMode) {
        fetch('/api/system-status', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ action: 'save_source', source: newSrc })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            sourceConfigs = data.configs;
            saveToLocalStorage('re_source_configs', sourceConfigs);
            renderAdminSources();
            document.getElementById('newSourceForm')?.classList.add('hidden');
            showToast('News source added successfully!', 'success');
          }
        }).catch(() => {
          showToast('Failed to save source to backend.', 'error');
        });
      } else {
        newSrc.id = 'sc_' + Date.now();
        sourceConfigs.push(newSrc);
        saveToLocalStorage('re_source_configs', sourceConfigs);
        renderAdminSources();
        document.getElementById('newSourceForm')?.classList.add('hidden');
        showToast('News source added locally!', 'success');
      }
      return;
    }

    // Save System Settings
    const btnSaveSettings = e.target.closest('#btnSaveSystemSettings');
    if (btnSaveSettings) {
      const autosend = document.getElementById('chkAutoSend').checked;
      const maharashtra = document.getElementById('chkMaharashtraFirst').checked;
      
      const newSets = { autosend_enabled: autosend, maharashtra_first: maharashtra };
      if (isBackendMode) {
        fetch('/api/system-status', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ action: 'update_settings', ...newSets })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            systemSettings = data.settings;
            saveToLocalStorage('re_system_settings', systemSettings);
            showToast('Automation settings saved to cloud!', 'success');
          }
        }).catch(() => {
          showToast('Failed to save settings to backend.', 'error');
        });
      } else {
        systemSettings = newSets;
        saveToLocalStorage('re_system_settings', systemSettings);
        showToast('Automation settings saved locally!', 'success');
      }
      return;
    }

    // Download Personal PDF
    const downloadPdfBtn = e.target.closest('[data-action="download-personal-pdf"]');
    if (downloadPdfBtn) {
      const idx = Number(downloadPdfBtn.dataset.idx);
      const log = dispatchLogs[idx];
      if (log) {
        compilePersonalPDF(log.recipient_name, log.news_item_ids || [], log.date);
      }
      return;
    }

    // Tray
    if (e.target.closest('#trayClear')) { selected.clear(); renderFeed(); if (activeView === 'saved') renderSaved(); updateTray(); return; }
    if (e.target.closest('#trayCreate')) { openModal(); return; }

    // Modal
    if (e.target.closest('#modalClose') || e.target === document.getElementById('modalOverlay')) { closeModal(); return; }
    const stepTab = e.target.closest('.mstep');
    if (stepTab) { renderModalStep(Number(stepTab.dataset.step)); return; }
  });

  // Search input
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const listEl = document.getElementById('feedList');
    if (!q) { renderFeed(); return; }
    const filtered = getFilteredNews().filter(n =>
      n.headline.toLowerCase().includes(q) ||
      n.builder.toLowerCase().includes(q) ||
      (n.project || '').toLowerCase().includes(q) ||
      n.city.toLowerCase().includes(q) ||
      (n.rera || '').toLowerCase().includes(q)
    );
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="stamp"><span>NO<br>MATCH</span></div><p>No updates match "${e.target.value}".</p></div>`;
      document.getElementById('resultCount').textContent = `0 results for "${e.target.value}"`;
    } else {
      listEl.innerHTML = filtered.map(cardTemplate).join('');
      document.getElementById('resultCount').textContent = `${filtered.length} results for "${e.target.value}"`;
    }
    if (activeView !== 'feed') switchView('feed');
  });

  // Filter chips
  const setupChips = (id, setter, cb) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      el.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      const val = chip.dataset.city || chip.dataset.cat || chip.dataset.rera || chip.dataset.priority;
      setter(val);
      cb();
    });
  };
  setupChips('filter-city', (v) => filterCity = v, renderFeed);
  setupChips('filter-category', (v) => filterCategory = v, renderFeed);
  setupChips('filter-rera', (v) => filterRera = v, renderFeed);
  setupChips('filter-priority', (v) => filterPriority = v, renderFeed);

  // Filter sidebar toggle — target the feed shell which has data-shell attribute
  document.getElementById('filterToggleBtn')?.addEventListener('click', () => {
    const shell = document.getElementById('view-feed');
    if (shell) shell.classList.toggle('filters-open');
  });

  // Admin: Run scraper — with loading state
  document.getElementById('btnRunScraper')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRunScraper');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg> Running...`;
    }
    await triggerManualScrape({ inline: false });
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg> Run AI Scraper Now`;
    }
  });

  // Feed Header: Run Scraper button (shortcut from main feed page)
  document.getElementById('btnRunScraperFeed')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRunScraperFeed');
    const label = document.getElementById('runScraperBtnLabel');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      if (label) label.textContent = 'Fetching...';
    }
    await triggerManualScrape({ inline: false });
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      if (label) label.textContent = 'Run Scraper';
    }
  });

  // Admin: Clear logs
  document.getElementById('btnClearLogs')?.addEventListener('click', () => {
    document.getElementById('scraperConsole').innerHTML = `<p class="console-line info">[System] Log cleared. Ready.</p>`;
  });

  // Admin: New group — show inline form instead of browser prompt()
  document.getElementById('btnNewGroup')?.addEventListener('click', () => {
    const form = document.getElementById('newGroupForm');
    if (form) {
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) {
        document.getElementById('ngfName')?.focus();
      }
    }
  });

  document.getElementById('btnNewGroupSave')?.addEventListener('click', () => {
    const name = document.getElementById('ngfName')?.value.trim();
    const desc = document.getElementById('ngfDesc')?.value.trim() || '';
    if (!name) { showToast('Group name is required.', 'error'); return; }
    const newGroup = { id: 'g_' + Date.now(), name, desc, count: 0, contacts: [] };
    recipientGroups.push(newGroup);
    saveToLocalStorage('re_recipients', recipientGroups);
    renderAdminRecipients();
    showToast(`Group "${name}" created`, 'success');
    // Hide and reset form
    const form = document.getElementById('newGroupForm');
    if (form) form.classList.add('hidden');
    if (document.getElementById('ngfName')) document.getElementById('ngfName').value = '';
    if (document.getElementById('ngfDesc')) document.getElementById('ngfDesc').value = '';
    if (isBackendMode) {
      fetch('/api/recipients', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ action: 'create_group', name, desc }) }).catch(() => { });
    }
  });

  document.getElementById('btnNewGroupCancel')?.addEventListener('click', () => {
    const form = document.getElementById('newGroupForm');
    if (form) form.classList.add('hidden');
    if (document.getElementById('ngfName')) document.getElementById('ngfName').value = '';
    if (document.getElementById('ngfDesc')) document.getElementById('ngfDesc').value = '';
  });

  // Admin: Download CSV template
  document.getElementById('btnDownloadTemplate')?.addEventListener('click', () => {
    const csv = `name,email,whatsapp,preferred_channel,preferred_states,preferred_cities,preferred_categories\nRahul Sharma,rahul@example.com,+919876543210,whatsapp,Maharashtra,Mumbai;Pune,Project Launch;RERA\nAnil Kumar,anil@investor.com,+919988776655,both,Maharashtra;Rajasthan,Mumbai;Jaipur,Funding;Policy`;
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'contacts_template.csv';
    link.click();
    showToast('CSV template downloaded', 'success');
  });

  // Toggle dynamic selector field for new source
  document.getElementById('nsType')?.addEventListener('change', (e) => {
    const type = e.target.value;
    const group = document.getElementById('nsSelectorGroup');
    if (group) {
      group.classList.toggle('hidden', type === 'rss' || type === 'google_news');
    }
  });

  // Admin: Report scope chips
  const reportScope = document.getElementById('reportScopeChips');
  if (reportScope) {
    reportScope.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      reportScope.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      const scope = chip.dataset.scope;
      const filterCont = document.getElementById('reportFilterContainer');
      const filterLabel = document.getElementById('reportFilterLabel');
      const filterInput = document.getElementById('reportFilterInput');
      if (scope === 'city') {
        filterCont.classList.remove('hidden');
        filterLabel.textContent = 'Specify target city';
        filterInput.placeholder = 'e.g. Mumbai or Thane';
        filterInput.value = '';
      } else if (scope === 'builder') {
        filterCont.classList.remove('hidden');
        filterLabel.textContent = 'Specify builder / developer name';
        filterInput.placeholder = 'e.g. Lodha Group or Godrej';
        filterInput.value = '';
      } else {
        filterCont.classList.add('hidden');
      }
    });
  }

  // Admin: Save Groq & Grok API Keys and Preferred Provider
  document.getElementById('btnSaveApiKeys')?.addEventListener('click', () => {
    const groqVal = document.getElementById('inputGroqKey')?.value.trim() || '';
    const grokVal = document.getElementById('inputGrokKey')?.value.trim() || '';
    const provider = document.getElementById('selectAiProvider')?.value || 'groq';
    
    const resendVal = document.getElementById('inputResendKey')?.value.trim() || '';
    const waTokenVal = document.getElementById('inputWaToken')?.value.trim() || '';
    const waPhoneIdVal = document.getElementById('inputWaPhoneId')?.value.trim() || '';

    if (provider === 'groq' && !groqVal) {
      showToast('Groq API Key cannot be empty when it is the preferred provider', 'warn');
      return;
    }
    if (provider === 'grok' && !grokVal) {
      showToast('Grok API Key cannot be empty when it is the preferred provider', 'warn');
      return;
    }

    localStorage.setItem('api_groq_1', groqVal);
    localStorage.setItem('api_grok_1', grokVal);
    localStorage.setItem('api_provider', provider);
    localStorage.setItem('api_resend_key', resendVal);
    localStorage.setItem('api_wa_token', waTokenVal);
    localStorage.setItem('api_wa_phone_id', waPhoneIdVal);
    showToast('Settings saved successfully', 'success');
    renderAdmin();
  });

  // Admin: Download PDF report
  document.getElementById('btnDownloadReport')?.addEventListener('click', compilePDFReport);

  // PDF Preview Modal Actions
  document.getElementById('pdfPreviewClose')?.addEventListener('click', closePdfPreviewModal);
  document.getElementById('btnPdfPreviewCloseFooter')?.addEventListener('click', closePdfPreviewModal);
  document.getElementById('btnPdfPreviewDownload')?.addEventListener('click', () => {
    if (window.currentPreviewDoc && window.currentPreviewFilename) {
      window.currentPreviewDoc.save(window.currentPreviewFilename);
      showToast('PDF downloaded successfully!', 'success');
      closePdfPreviewModal();
    } else {
      showToast('No PDF preview found.', 'error');
    }
  });

  // Close preview modal on backdrop click
  document.getElementById('pdfPreviewModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('pdfPreviewModal')) {
      closePdfPreviewModal();
    }
  });
}

// ===== 19. SCRAPER PIPELINE =====
async function triggerManualScrape({ inline = false } = {}) {
  const getConsole = () => inline
    ? document.getElementById('welcomeConsole')
    : document.getElementById('scraperConsole');

  const welcomeConsoleEl = document.getElementById('welcomeConsole');
  if (inline && welcomeConsoleEl) {
    welcomeConsoleEl.classList.add('active');
  } else if (!inline) {
    const consoleDetails = document.getElementById('consoleDetails');
    if (consoleDetails) {
      consoleDetails.open = true;
    }
  }

  const btnWelcome = document.getElementById('btnWelcomeScrape');
  const btnAdmin = document.getElementById('btnRunScraper');

  if (inline && btnWelcome) { btnWelcome.disabled = true; }
  if (!inline && btnAdmin) { btnAdmin.disabled = true; }

  const log = (msg, type = 'info') => {
    const consoleEl = getConsole();
    if (!consoleEl) return;
    const p = document.createElement('p');
    p.className = `console-line ${type}`;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    consoleEl.appendChild(p);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };

  log('Initializing real estate intelligence scraper...', 'info');
  log('Sources: 9 Google News queries (National + City) · 3 Hindi feeds · 8 RE portals · ET Realty · Moneycontrol · Business Standard · Financial Express · Housing.com · Construction Week · MagicBricks · BusinessLine.', 'info');

  try {
    if (!isBackendMode) {
      log('Running in browser sandbox mode. Attempting client-side RSS scraping...', 'warn');
      const provider = localStorage.getItem('api_provider') || 'groq';
      const groqKey = localStorage.getItem('api_groq_1') || '';
      const grokKey = localStorage.getItem('api_grok_1') || '';
      
      let apiKey = provider === 'grok' ? grokKey : groqKey;
      if (!apiKey) {
        apiKey = groqKey || grokKey;
      }
      
      if (!apiKey) {
        throw new Error('No API Key set. Please configure Groq or Grok API key in the Settings card inside Admin Panel.');
      }
      
      const activeProvider = (apiKey === grokKey) ? 'grok' : 'groq';

      // ============ RSS FEEDS — PRD TARGETS ALL SOURCES ============
      // Goal: 500+ raw articles. Each Google News query returns up to 100 items.
      // All fetched via allorigins.win CORS proxy. Failed feeds are silently skipped.
      const feeds = [

        // ── GOOGLE NEWS RSS: ENGLISH — NATIONAL ──────────────────────────────────
        {
          name: 'Google News - EN: Real Estate General',
          url: 'https://news.google.com/rss/search?q=site:realty.economictimes.indiatimes.com+OR+site:moneycontrol.com/news/business/real-estate+OR+site:housing.com/news+OR+%22real+estate+India%22+OR+%22RERA+India%22+OR+%22property+market+India%22&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: Builder & Developer News',
          url: 'https://news.google.com/rss/search?q=%28Lodha+OR+DLF+OR+%22Godrej+Properties%22+OR+Sobha+OR+%22Prestige+Group%22+OR+Brigade+OR+%22Oberoi+Realty%22+OR+%22L%26T+Realty%22+OR+Hiranandani%29+%22real+estate%22&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: RERA & Regulatory',
          url: 'https://news.google.com/rss/search?q=RERA+%28builder+OR+developer+OR+homebuyer+OR+penalty+OR+registration+OR+complaint+OR+order%29+India&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: RE Funding & Investment',
          url: 'https://news.google.com/rss/search?q=%22real+estate%22+%28funding+OR+investment+OR+IPO+OR+REIT+OR+%22private+equity%22%29+India&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: Government Policy & Housing',
          url: 'https://news.google.com/rss/search?q=%22affordable+housing%22+OR+%22Smart+City%22+OR+PMAY+OR+%22housing+policy%22+OR+%22stamp+duty%22+OR+%22ready+reckoner%22+India&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: Infrastructure & Metro',
          url: 'https://news.google.com/rss/search?q=%22metro+rail%22+OR+%22highway+project%22+OR+%22airport+city%22+OR+%22bullet+train%22+%22real+estate%22+India&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: Land Acquisition & Redevelopment',
          url: 'https://news.google.com/rss/search?q=%22land+acquisition%22+OR+%22redevelopment+project%22+OR+%22slum+redevelopment%22+OR+%22cluster+redevelopment%22+India&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: Litigation & NCLT',
          url: 'https://news.google.com/rss/search?q=%22NCLT%22+OR+%22insolvency%22+OR+%22homebuyer+litigation%22+OR+%22builder+fraud%22+%22real+estate%22+India&hl=en-IN&gl=IN&ceid=IN:en'
        },

        // ── GOOGLE NEWS RSS: ENGLISH — CITY / REGION SPECIFIC ────────────────────
        {
          name: 'Google News - EN: Mumbai & MMR',
          url: 'https://news.google.com/rss/search?q=%22Mumbai+real+estate%22+OR+%22MMR+property%22+OR+%22MahaRERA%22+OR+%22Thane+real+estate%22+OR+%22Navi+Mumbai+property%22&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: NCR & Delhi',
          url: 'https://news.google.com/rss/search?q=%22Delhi+real+estate%22+OR+%22Gurugram+property%22+OR+%22Noida+real+estate%22+OR+%22Greater+Noida%22+OR+%22UP+RERA%22&hl=en-IN&gl=IN&ceid=IN:en'
        },
        {
          name: 'Google News - EN: Pune & Bengaluru',
          url: 'https://news.google.com/rss/search?q=%22Pune+real+estate%22+OR+%22Bengaluru+real+estate%22+OR+%22Pune+RERA%22+OR+%22Karnataka+RERA%22+OR+%22Hyderabad+property%22&hl=en-IN&gl=IN&ceid=IN:en'
        },

        // ── GOOGLE NEWS RSS: HINDI ────────────────────────────────────────────────
        {
          name: 'Google News - HI: Real Estate General',
          url: 'https://news.google.com/rss/search?q=%22%E0%A4%B0%E0%A4%B6%E0%A4%AF%E0%A4%B2+%E0%A4%8F%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A5%87%E0%A4%9F%22+OR+%22%E0%A4%AE%E0%A4%B9%E0%A4%BE%E0%A4%B0%E0%A5%87%E0%A4%B0%E0%A4%BE%22+OR+%22%E0%A4%B8%E0%A4%82%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A4%BF+%E0%A4%AC%E0%A4%BE%E0%A4%9C%E0%A4%BE%E0%A4%B0%22&hl=hi&gl=IN&ceid=IN:hi'
        },
        {
          name: 'Google News - HI: RERA & Homebuyer',
          url: 'https://news.google.com/rss/search?q=RERA+%22%E0%A4%AE%E0%A4%95%E0%A4%BE%E0%A4%A8%22+OR+%22%E0%A4%86%E0%A4%B5%E0%A4%BE%E0%A4%B8%22+OR+%22%E0%A4%AB%E0%A5%8D%E0%A4%B2%E0%A5%88%E0%A4%9F%22+OR+%22%E0%A4%AC%E0%A4%BF%E0%A4%B2%E0%A5%8D%E0%A4%A1%E0%A4%B0%22&hl=hi&gl=IN&ceid=IN:hi'
        },
        {
          name: 'Google News - HI: Property News',
          url: 'https://news.google.com/rss/search?q=%22%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A5%89%E0%A4%AA%E0%A4%B0%E0%A5%8D%E0%A4%9F%E0%A5%80%22+OR+%22%E0%A4%9C%E0%A4%AE%E0%A5%80%E0%A4%A8%22+OR+%22%E0%A4%AE%E0%A4%95%E0%A4%BE%E0%A4%A8%22+%22%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4%22&hl=hi&gl=IN&ceid=IN:hi'
        },

        // ── DIRECT RSS FEEDS — REAL ESTATE PUBLICATIONS ──────────────────────────
        {
          name: 'Economic Times Realty',
          url: 'https://realty.economictimes.indiatimes.com/rss/topstories'
        },
        {
          name: 'Moneycontrol Real Estate',
          url: 'https://www.moneycontrol.com/rss/realestate.xml'
        },
        {
          name: 'Housing.com News',
          url: 'https://housing.com/news/feed/'
        },
        {
          name: 'Construction Week India',
          url: 'https://www.constructionweekonline.in/feed'
        },
        {
          name: 'MagicBricks Research Blog',
          url: 'https://www.magicbricks.com/blog/feed'
        },
        {
          name: 'Business Standard Real Estate',
          url: 'https://www.business-standard.com/rss/real-estate-06.rss'
        },
        {
          name: 'Financial Express Real Estate',
          url: 'https://www.financialexpress.com/real-estate/feed/'
        },
        {
          name: 'The Hindu BusinessLine Property',
          url: 'https://www.thehindubusinessline.com/real-estate/feeder/default.rss'
        }
      ];
      // ─────────────────────────────────────────────────────────────────────────────

      log(`Fetching ${feeds.length} RSS feeds via public CORS proxy...`, 'info');
      let allArticles = [];

      // Round-robin index to balance load across proxy servers
      let proxyRotationIndex = 0;

      // Helper: fetch XML text using rotating public CORS proxies with a 15s timeout
      const fetchWithCorsProxy = async (targetUrl) => {
        const proxies = [
          url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
          url => `https://thingproxy.freeboard.io/fetch/${url}`,
          url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
          url => `https://corsproxy.org/?${encodeURIComponent(url)}`
        ];

        let lastError = null;
        const startIndex = proxyRotationIndex;

        for (let attempt = 0; attempt < proxies.length; attempt++) {
          const proxyIndex = (startIndex + attempt) % proxies.length;

          // Increment rotation index on the first attempt of this call
          if (attempt === 0) {
            proxyRotationIndex = (proxyRotationIndex + 1) % proxies.length;
          }

          try {
            const proxyUrl = proxies[proxyIndex](targetUrl);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per request
            const response = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
              const text = await response.text();
              const trimmed = text.trim();
              
              // Validate that the response is XML/RSS and not an HTML landing/pricing page
              if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html') || trimmed.includes('<script')) {
                throw new Error('Proxy returned HTML landing/verification page instead of raw feed XML');
              }
              if (!trimmed.startsWith('<') && !trimmed.startsWith('<?xml')) {
                throw new Error('Proxy returned invalid non-XML content format');
              }
              
              return text;
            }
            lastError = new Error(`HTTP Status ${response.status}`);
          } catch (e) {
            lastError = e;
          }
        }
        throw lastError || new Error('All CORS proxies failed');
      };

      const delay = ms => new Promise(res => setTimeout(res, ms));

      for (const feed of feeds) {
        try {
          await delay(400); // 400ms delay to prevent proxy rate limits
          log(`Fetching ${feed.name}...`, 'info');
          let url = feed.url;
          if (feed.name.includes('Google News') || feed.url.includes('google_news')) {
            try {
              const parsedUrl = new URL(url);
              let q = parsedUrl.searchParams.get('q') || '';
              if (q) {
                if (!q.startsWith('(') && (q.includes(' OR ') || q.includes(' ') || q.includes('+') || q.includes('%20'))) {
                  q = `(${q})`;
                }
                if (!q.includes('when:')) {
                  q = `${q} when:3d`;
                }
                parsedUrl.searchParams.set('q', q);
                url = parsedUrl.toString();
              }
            } catch (urlErr) {
              url = url.replace('&hl=', '+when:3d&hl=');
            }
          }
          const xmlText = await fetchWithCorsProxy(url);
          const items = parseXmlFeed(xmlText, feed.name);
          log(`Fetched ${items.length} items from ${feed.name}`, 'success');
          allArticles.push(...items);
        } catch (feedErr) {
          log(`Failed to fetch ${feed.name}: ${feedErr.message}`, 'warn');
        }
      }

      // Cutoff Filter: Only keep articles from the last 3 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 3);
      allArticles = allArticles.filter(art => {
        const d = new Date(art.pubDate);
        return !isNaN(d.getTime()) && d >= cutoffDate;
      });

      log(`Aggregated ${allArticles.length} recent raw articles (last 3 days).`, 'info');
      if (allArticles.length === 0) {
        throw new Error('No recent articles retrieved from any source. Check internet connection or retry.');
      }

      log('Running similarity deduplication against new batch & existing feed...', 'info');
      const uniqueArticles = [];
      const titleTokenSets = [];

      // Pre-build existing normalized links set for fast lookup
      const existingNormLinks = new Set(NEWS.map(n => n.originalLink || normalizeUrl(n.link)).filter(Boolean));
      // Pre-tokenize existing headlines AND originalTitles for thorough matching
      const existingHeadTokenSets = NEWS.map(n => clientGetTokens(n.headline || n.title || ''));
      const existingOrigTokenSets = NEWS.map(n => clientGetTokens(n.originalTitle || n.title || ''));

      for (const art of allArticles) {
        const artNormLink = normalizeUrl(art.link);
        // Fast link-based dedup first
        if (artNormLink && existingNormLinks.has(artNormLink)) continue;

        const tokens = clientGetTokens(art.title);
        let isDuplicate = false;

        // 1. Check against new unique articles in this run
        for (let i = 0; i < uniqueArticles.length; i++) {
          const sim = clientJaccardSimilarity(tokens, titleTokenSets[i]);
          if (sim > 0.35) {
            isDuplicate = true;
            if ((art.content || '').length > (uniqueArticles[i].content || '').length) {
              uniqueArticles[i] = art;
              titleTokenSets[i] = tokens;
            }
            break;
          }
        }
        if (isDuplicate) continue;

        // 2. Check against already processed articles in the database
        //    Compare raw title against both headline and originalTitle of existing articles
        for (let i = 0; i < NEWS.length; i++) {
          const simHead = clientJaccardSimilarity(tokens, existingHeadTokenSets[i]);
          const simOrig = clientJaccardSimilarity(tokens, existingOrigTokenSets[i]);
          if (Math.max(simHead, simOrig) > 0.35) {
            isDuplicate = true;
            break;
          }
        }

        if (!isDuplicate) {
          uniqueArticles.push(art);
          titleTokenSets.push(tokens);
        }
      }

      log(`Retained ${uniqueArticles.length} unique articles out of ${allArticles.length}.`, 'success');

      const scoredArticles = uniqueArticles.map((art, index) => {
        const score = clientScoreRelevance(art.title, art.content);
        return { ...art, localId: index, relevanceScore: score };
      });
      scoredArticles.sort((a, b) => b.relevanceScore - a.relevanceScore);

      const candidates = scoredArticles
        .filter(art => art.relevanceScore > 2)
        .slice(0, 50);

      log(`Selected top ${candidates.length} candidates for client-side Groq AI processing.`, 'info');
      if (candidates.length === 0) {
        throw new Error('No highly relevant real estate articles found in today\'s feeds.');
      }

      log('Sending articles to Groq AI for professional editorial summary...', 'info');
      const batchSize = 4;
      const processedArticles = [];

      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(candidates.length / batchSize)}...`, 'info');

        const systemPrompt = `You are a professional Real Estate Intelligence AI Analyzer.
Analyze the provided batch of Indian real estate news articles and return structured data.
You MUST output a JSON object containing a "results" key which maps to an array of objects.

For EACH article in the input list, return an object in the "results" array.
Verify if the article is truly related to Indian real estate. Set "relevant": false if it's not.

If "relevant" is true, extract and process these fields:
1. "originalId": (Integer) Match the input article's localId.
2. "relevant": true
3. "headline": Rewritten highly professional, editorial-grade news headline (max 15 words).
4. "builder": Builder/developer company name. Use "—" if not mentioned or not applicable.
5. "city": Primary city mentioned. Use "—" if statewide/national.
6. "state": State name. Use "—" if national.
7. "category": EXACTLY one of: "Project Launch", "Land Acquisition", "Redevelopment", "RERA", "Funding", "Government Policy", "Infrastructure", "Litigation".
8. "summary": A concise 100-150 word summary written in a clean, formal, journalistic tone. Avoid hype or buzzwords. Report numbers, percentages, timelines, and facts objectively. Translate any Hindi input to English.
9. "priorityScore": Integer (1 to 10) representing the news impact (8-10 high policy/mega funding, 5-7 standard launch, 1-4 local discussion).

You must return valid JSON matching this schema:
{
  "results": [
    {
      "originalId": 0,
      "relevant": true,
      "headline": "...",
      "builder": "...",
      "city": "...",
      "state": "...",
      "category": "...",
      "summary": "...",
      "priorityScore": 7
    }
  ]
}`;

        const userPrompt = `Here is the batch of articles to analyze:
${JSON.stringify(batch.map(b => ({ localId: b.localId, title: b.title, content: b.content, source: b.source, pubDate: b.pubDate })))}`;

        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ];

        try {
          let responseData;
          if (activeProvider === 'grok') {
            responseData = await callGrokClientSide(messages, apiKey);
          } else {
            responseData = await callGroqClientSide(messages, apiKey);
          }
          const contentText = responseData.choices[0].message.content;
          const batchResults = JSON.parse(contentText).results || [];

          const batchProcessed = [];

          for (const item of batchResults) {
            if (item.relevant) {
              const original = batch.find(b => b.localId === item.originalId);
              if (original) {
                const stockImages = CATEGORY_IMAGES;

                const newArt = {
                  id: Date.now() + Math.random(),
                  headline: item.headline,
                  summary: item.summary,
                  builder: item.builder,
                  project: original.title.includes(' - ') ? original.title.split(' - ')[0] : 'Project Update',
                  city: item.city,
                  state: item.state,
                  category: item.category,
                  date: new Date(original.pubDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                  source: original.source,
                  link: original.link,
                  originalTitle: original.title,
                  originalLink: normalizeUrl(original.link),
                  img: original.imageUrl || stockImages[item.category] || '/images/categories/project-launch.png',
                  priorityScore: item.priorityScore || 5,
                  rera: original.title.includes('RERA') ? 'Details in Body' : '—',
                  rerastatus: item.category === 'RERA' ? 'Regulatory Review' : 'Active',
                  status: ({
                    'Project Launch': 'New Launch',
                    'Land Acquisition': 'Acquisition Complete',
                    'Redevelopment': 'Redevelopment',
                    'RERA': 'Regulatory Update',
                    'Funding': 'Funding Closed',
                    'Government Policy': 'Policy Approved',
                    'Infrastructure': 'Infrastructure Update',
                    'Litigation': 'Litigation Update'
                  })[item.category] || 'New Launch'
                };

                batchProcessed.push(newArt);
                processedArticles.push(newArt);
              }
            }
          }

          if (batchProcessed.length > 0) {
            const existingNormLinks = new Set(NEWS.map(n => n.originalLink || normalizeUrl(n.link)).filter(Boolean));
            const freshOnes = batchProcessed.filter(n => {
              const normLink = n.originalLink || normalizeUrl(n.link);
              if (normLink && existingNormLinks.has(normLink)) return false;
              // Also do a quick Jaccard check on headline vs existing headlines
              const tokens = clientGetTokens(n.headline || '');
              for (const existing of NEWS) {
                const existHead = clientGetTokens(existing.headline || '');
                const existOrig = clientGetTokens(existing.originalTitle || '');
                if (Math.max(clientJaccardSimilarity(tokens, existHead), clientJaccardSimilarity(tokens, existOrig)) > 0.35) return false;
              }
              return true;
            });
            if (freshOnes.length > 0) {
              NEWS = [...freshOnes, ...NEWS].slice(0, 100);
              saveToLocalStorage('re_news', NEWS);
              renderFeed();
              log(`Real-Time Update: Added ${freshOnes.length} articles to feed view.`, 'success');
            }
          }

        } catch (batchErr) {
          log(`AI processing batch failed: ${batchErr.message}`, 'error');
        }

        // Add a 2400ms cooling delay between batches to respect Groq rate limits (6000 TPM)
        await new Promise(resolve => setTimeout(resolve, 2400));
      }

      if (processedArticles.length > 0) {
        log(`Scrape pipeline complete! Added a total of ${processedArticles.length} new articles.`, 'success');
        showToast(`${processedArticles.length} articles added to feed!`, 'success');
      } else {
        log('No new articles could be processed.', 'warn');
        showToast('No new articles found.', 'info');
      }

    } else {
      log('Connecting to serverless scraping pipeline...', 'info');
      const res = await fetch('/api/scrape-and-process', {
        method: 'POST',
        headers: getHeaders()
      });

      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

      const result = await res.json();

      if (result.success) {
        log(`Scraped ${result.totalRawScraped} raw articles from all sources.`, 'success');
        log(`Deduplication complete. Removed ${result.totalRawScraped - result.totalUniqueDeduplicated} duplicate articles.`, 'success');
        log(`AI categorization complete. ${result.articles.length} premium articles shortlisted.`, 'success');

        if (result.keysStatus) {
          const s = result.keysStatus;
          const k1El = document.getElementById('key1Status');
          const k2El = document.getElementById('key2Status');
          const foEl = document.getElementById('failoverCount');
          if (k1El) k1El.textContent = s.activeKeyIndex === 0 ? 'Active' : 'Standby Ready';
          if (k2El) k2El.textContent = s.activeKeyIndex === 1 ? 'Active' : 'Standby Ready';
          if (foEl) foEl.textContent = s.failovers.length > 0 ? `${s.failovers.length} Auto-Rotations` : 'Fully Operational';
          s.failovers.forEach(() => log('[Auto-Failover] Switched to Backup AI Engine.', 'groq'));
        }

        if (result.articles && result.articles.length > 0) {
          // Build existing normalized links set for fast lookup
          const existingNormLinks = new Set(NEWS.map(n => n.originalLink || normalizeUrl(n.link)).filter(Boolean));

          // Perform link-based + Jaccard similarity check against existing database articles
          const filteredArticles = result.articles.filter(art => {
            // 1. Fast link-based check
            const artNormLink = art.originalLink || normalizeUrl(art.link);
            if (artNormLink && existingNormLinks.has(artNormLink)) return false;

            // 2. Jaccard check on both headline and originalTitle
            const headTokens = clientGetTokens(art.headline || art.title || '');
            const origTokens = clientGetTokens(art.originalTitle || '');
            for (const existing of NEWS) {
              const existHead = clientGetTokens(existing.headline || existing.title || '');
              const existOrig = clientGetTokens(existing.originalTitle || '');
              const maxSim = Math.max(
                clientJaccardSimilarity(headTokens, existHead),
                clientJaccardSimilarity(headTokens, existOrig),
                origTokens.size > 0 ? clientJaccardSimilarity(origTokens, existHead) : 0,
                origTokens.size > 0 ? clientJaccardSimilarity(origTokens, existOrig) : 0
              );
              if (maxSim > 0.35) return false;
            }
            return true;
          });

          if (filteredArticles.length > 0) {
            // Already filtered by normalizedLink above, no need for another link check
            NEWS = [...filteredArticles, ...NEWS].slice(0, 100);
            saveToLocalStorage('re_news', NEWS);
            renderFeed();
            log(`Feed updated with ${filteredArticles.length} new articles.`, 'success');
            showToast(`${filteredArticles.length} new articles added to your feed!`, 'success');
          } else {
            log('No new articles found. Feed is up to date.', 'warn');
            showToast('Feed is already up to date.', 'info');
          }
        } else {
          log('No new articles found. Feed is up to date.', 'warn');
          showToast('Feed is already up to date.', 'info');
        }
      } else {
        log(`Pipeline failed: ${result.error}`, 'error');
        showToast('Scraping failed. Check the console for details.', 'error');
      }
    }
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    if (inline && btnWelcome) { btnWelcome.disabled = false; }
    if (!inline && btnAdmin) { btnAdmin.disabled = false; }
  }
}

// ===== 20. CSV UPLOAD & PARSE =====
function handleCSVFileSelect(file, specificGroupId) {
  if (!file || !file.name.endsWith('.csv')) {
    showToast('Please upload a valid .csv file.', 'error');
    return;
  }
  const group = recipientGroups.find(g => g.id === specificGroupId);
  if (!group) { showToast('Select a valid recipient group first.', 'error'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const parsed = parseCSVText(e.target.result);
    if (parsed.length === 0) {
      showToast('CSV parse failed. Check headers: name, email, whatsapp', 'error');
      return;
    }
    group.contacts.push(...parsed);
    group.count = group.contacts.length;
    saveToLocalStorage('re_recipients', recipientGroups);
    renderAdminRecipients();
    showToast(`Imported ${parsed.length} contacts into "${group.name}"`, 'success');
    if (isBackendMode) {
      fetch('/api/recipients', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ action: 'import_contacts', groupId: specificGroupId, contacts: parsed }) }).catch(() => { });
    }
  };
  reader.readAsText(file);
}

function parseCSVLine(text) {
  let p = '', c = '', r = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    c = text[i];
    if (c === '"') { q = !q; }
    else if (c === ',' && !q) { r.push(p); p = ''; }
    else { p += c; }
  }
  r.push(p);
  return r.map(x => x.trim().replace(/^['"]|['"]$/g, ''));
}

function parseCSVText(csv) {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/["']/g, ''));
  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const whatsappIdx = headers.indexOf('whatsapp');
  const channelIdx = headers.indexOf('preferred_channel');
  const statesIdx = headers.indexOf('preferred_states');
  const citiesIdx = headers.indexOf('preferred_cities');
  const categoriesIdx = headers.indexOf('preferred_categories');

  if (nameIdx === -1) return [];
  return lines.slice(1).map(line => {
    const row = parseCSVLine(line);
    const statesRaw = statesIdx >= 0 ? row[statesIdx] : '';
    const citiesRaw = citiesIdx >= 0 ? row[citiesIdx] : '';
    const categoriesRaw = categoriesIdx >= 0 ? row[categoriesIdx] : '';
    
    return {
      name: row[nameIdx] || 'Unnamed',
      email: emailIdx >= 0 ? row[emailIdx] : '',
      whatsapp: whatsappIdx >= 0 ? row[whatsappIdx] : '',
      preferred_channel: channelIdx >= 0 ? (row[channelIdx] || 'whatsapp').toLowerCase().trim() : 'whatsapp',
      preferred_states: statesRaw ? statesRaw.split(';').map(s => s.trim()).filter(Boolean) : [],
      preferred_cities: citiesRaw ? citiesRaw.split(';').map(c => c.trim()).filter(Boolean) : [],
      preferred_categories: categoriesRaw ? categoriesRaw.split(';').map(c => c.trim()).filter(Boolean) : []
    };
  }).filter(c => c.name && c.name !== 'Unnamed');
}

// ===== 21. PDF REPORT GENERATION =====
function compilePDFReport() {
  if (NEWS.length === 0) { showToast('No news data available. Run the scraper first.', 'warn'); return; }

  const activeChip = document.querySelector('#reportScopeChips .chip.on');
  if (!activeChip) return;
  const scope = activeChip.dataset.scope;
  const filterInputVal = document.getElementById('reportFilterInput')?.value.trim() || '';

  let reportTitle = '', reportSub = '', filteredList = [];
  const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  if (scope === 'daily') {
    reportTitle = `Daily Real Estate Bulletin`;
    reportSub = `India Distribution Desk — Compiled on ${todayStr}`;
    filteredList = NEWS.slice(0, 15);
  } else if (scope === 'weekly') {
    reportTitle = `Weekly Real Estate Intelligence Report`;
    reportSub = `MMR, Pune & NCR Corridor — Week ending ${todayStr}`;
    filteredList = NEWS.filter(n => n.priorityScore >= 5).slice(0, 30);
  } else if (scope === 'monthly') {
    reportTitle = `Monthly Real Estate Executive Summary`;
    reportSub = `National Policy & Builder Portfolios — ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
    filteredList = NEWS.filter(n => n.priorityScore >= 6);
  } else if (scope === 'city') {
    if (!filterInputVal) { showToast('Please enter a city name.', 'warn'); return; }
    reportTitle = `City Intelligence Report: ${filterInputVal}`;
    reportSub = `Real Estate Updates inside ${filterInputVal} — ${todayStr}`;
    filteredList = NEWS.filter(n => n.city.toLowerCase().includes(filterInputVal.toLowerCase()));
  } else if (scope === 'builder') {
    if (!filterInputVal) { showToast('Please enter a builder/developer name.', 'warn'); return; }
    reportTitle = `Developer Portfolio Briefing: ${filterInputVal}`;
    reportSub = `Launches, Funding & Litigation Portfolio — ${todayStr}`;
    filteredList = NEWS.filter(n => n.builder.toLowerCase().includes(filterInputVal.toLowerCase()));
  }

  if (filteredList.length === 0) {
    showToast('No articles match the selected scope/filter.', 'warn');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFont('Helvetica', 'bold');
  doc.setFillColor(27, 67, 50);
  doc.rect(0, 0, 595.27, 80, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(reportTitle.toUpperCase(), 36, 40);
  doc.setFontSize(9.5);
  doc.setFont('Helvetica', 'normal');
  doc.text(reportSub, 36, 58);

  doc.setTextColor(28, 35, 51);
  doc.setFontSize(12);
  doc.setFont('Helvetica', 'bold');
  doc.text('EXECUTIVE SHORTLIST SUMMARY', 36, 112);

  const tableRows = filteredList.map((n, i) => [(i + 1).toString(), n.headline, n.builder !== '—' ? n.builder : 'N/A', n.city, n.category, n.priorityScore.toString()]);

  doc.autoTable({
    startY: 125,
    head: [['#', 'Headline', 'Developer', 'City', 'Category', 'Score']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [43, 51, 67], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [43, 51, 67] },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 220 }, 2: { cellWidth: 90 }, 3: { cellWidth: 70 }, 4: { cellWidth: 80 }, 5: { cellWidth: 35, halign: 'center' } },
    margin: { left: 36, right: 36 }
  });

  let y = doc.previousAutoTable.finalY + 36;

  filteredList.forEach((n, i) => {
    if (y > 740) { doc.addPage(); y = 50; }
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(27, 67, 50);
    doc.text(`${i + 1}. ${n.headline}`, 36, y);
    y += 14;
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Source: ${n.source} · Date: ${n.date} · Category: ${n.category} · RERA: ${n.rera || '—'}`, 36, y);
    y += 13;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(43, 51, 67);
    const lines = doc.splitTextToSize(n.summary, 523);
    doc.text(lines, 36, y);
    y += (lines.length * 12) + 18;
  });

  try {
    const blobUrl = doc.output('bloburl');
    openPdfPreviewModal(`${reportTitle}`, blobUrl, doc, `${scope}_report_${todayStr.replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('[Preview Error]:', err);
    doc.save(`${scope}_report_${todayStr.replace(/\s+/g, '_')}.pdf`);
  }
}

// ===== 22. BULLETIN MODAL =====
function openModal() {
  if (selected.size === 0) return;
  modalStep = 1;
  document.getElementById('modalOverlay').classList.add('show');
  renderModalStep(1);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function renderModalStep(step) {
  modalStep = step;
  document.querySelectorAll('.mstep').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === step));
  const body = document.getElementById('modalBody');
  const items = NEWS.filter(n => selected.has(n.id));

  if (step === 1) {
    body.innerHTML = `
      <p style="font-size:12px;color:var(--ink-soft);margin:0 0 12px;font-weight:700;text-transform:uppercase;">${items.length} Articles Selected</p>
      <div class="selected-list">
        ${items.map(n => `
          <div class="selected-item">
            <img src="${n.img || ''}" onerror="this.style.display='none'">
            <div>
              <p>${n.headline}</p>
              <small>${n.builder !== '—' ? n.builder : 'No Builder'} · ${n.city}, ${n.state}</small>
            </div>
            <span class="rm" data-action="select" data-id="${n.id}">Remove</span>
          </div>`).join('')}
      </div>
      <div class="modal-foot">
        <button class="btn primary" id="toStep2">Continue to Format →</button>
      </div>`;
    document.getElementById('toStep2').onclick = () => renderModalStep(2);
  } else if (step === 2) {
    body.innerHTML = `
      <p style="font-size:12px;color:var(--ink-soft);margin:0 0 12px;font-weight:700;text-transform:uppercase;">Choose Output Formats</p>
      <div class="format-row">
        <div class="format-card ${chosenFormats.has('whatsapp') ? 'on' : ''}" data-f="whatsapp">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${chosenFormats.has('whatsapp') ? '#25D366' : 'var(--ink-soft)'}"><path d="M17.6 6.3A8 8 0 003.9 16.9L3 21l4.2-1.1A8 8 0 0017.6 6.3z"/></svg>
          <p>WhatsApp</p><small>Formatted bulletin messages</small>
        </div>
        <div class="format-card ${chosenFormats.has('email') ? 'on' : ''}" data-f="email">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${chosenFormats.has('email') ? 'var(--forest)' : 'var(--ink-soft)'}" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          <p>Email Newsletter</p><small>Branded HTML layout</small>
        </div>
        <div class="format-card ${chosenFormats.has('pdf') ? 'on' : ''}" data-f="pdf">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${chosenFormats.has('pdf') ? 'var(--forest)' : 'var(--ink-soft)'}" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
          <p>PDF Report</p><small>Print-ready compiled report</small>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="back1">← Back</button>
        <button class="btn primary" id="toStep3">Preview &amp; Send →</button>
      </div>`;
    body.querySelectorAll('.format-card').forEach(c => {
      c.onclick = () => { chosenFormats.has(c.dataset.f) ? chosenFormats.delete(c.dataset.f) : chosenFormats.add(c.dataset.f); c.classList.toggle('on'); };
    });
    document.getElementById('back1').onclick = () => renderModalStep(1);
    document.getElementById('toStep3').onclick = () => renderModalStep(3);
  } else if (step === 3) {
    const totalRecs = recipientGroups.reduce((sum, g) => sum + (g.contacts ? g.contacts.length : 0), 0);
    body.innerHTML = `
      <p style="font-size:12px;color:var(--ink-soft);margin:0 0 12px;font-weight:700;text-transform:uppercase;">Preview &amp; Send</p>
      
      <div class="preview-box" style="margin-bottom: 15px;">
        <div class="pp-head">
          <div class="stamp small"><span>RE</span></div>
          <b>Daily Real Estate Bulletin — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
        </div>
        ${items.map(n => `<div class="preview-item"><p>${n.headline}</p><small>${n.builder !== '—' ? n.builder : 'N/A'} · ${n.city}, ${n.state} · RERA: ${n.rera || '—'}</small></div>`).join('')}
      </div>

      <!-- Recipient Selection Checklist -->
      <div style="margin-bottom: 18px;">
        <label class="section-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <span>Select Target Recipients</span>
          <span id="selectedRecipientsCount" style="color:var(--forest); font-weight:bold;">${totalRecs} selected</span>
        </label>
        <div style="border: 1px solid var(--sand-dark); border-radius: 8px; max-height: 160px; overflow-y: auto; padding: 10px; background: var(--surface);">
          ${recipientGroups.map(g => {
            const groupContacts = g.contacts || [];
            if (groupContacts.length === 0) return '';
            return `
              <div style="margin-bottom: 10px;">
                <label style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; color:var(--ink); cursor:pointer; user-select:none;">
                  <input type="checkbox" class="group-select-checkbox" data-gid="${g.id}" checked style="width:14px; height:14px; accent-color:var(--forest);">
                  ${g.name} (${groupContacts.length})
                </label>
                <div style="margin-left: 20px; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
                  ${groupContacts.map(c => `
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-soft); cursor:pointer; user-select:none;">
                      <input type="checkbox" class="recipient-checkbox" data-gid="${g.id}" data-cid="${c.id}" data-email="${c.email || ''}" data-wa="${c.whatsapp || ''}" data-name="${c.name}" checked style="width:13px; height:13px; accent-color:var(--forest);">
                      ${c.name} <small style="color:var(--ink-soft); margin-left: 4px;">(${c.whatsapp || c.email || 'No Details'})</small>
                    </label>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
          ${recipientGroups.every(g => (g.contacts || []).length === 0) ? '<p style="font-size:12.5px; color:var(--ink-soft); text-align:center; margin:15px 0;">No contacts found in database.</p>' : ''}
        </div>
      </div>

      <div class="facts" style="border-top:1px dashed var(--hairline);padding-top:14px;margin-bottom:20px;grid-template-columns:repeat(3,1fr);">
        <div class="fact"><label>Formats</label><span>${Array.from(chosenFormats).map(f => f[0].toUpperCase() + f.slice(1)).join(', ') || 'None'}</span></div>
        <div class="fact"><label>Total Contacts</label><span>${totalRecs > 0 ? totalRecs.toLocaleString() : '0'} loaded</span></div>
        <div class="fact"><label>Articles</label><span>${items.length} selected</span></div>
      </div>
      
      <div class="modal-foot" style="display:flex; justify-content:space-between; width:100%; gap:8px; flex-wrap:wrap;">
        <button class="btn ghost" id="back2" style="height:34px;">← Back</button>
        <div style="display:flex; gap:8px; margin-left:auto; margin-right:10px;">
          <button class="btn ghost" id="btnPreviewBulletinPdf" style="border-color:var(--forest); color:var(--forest); height:34px; font-weight:600; font-size:12px;">👁 Preview PDF</button>
          <button class="btn ghost" id="btnDownloadBulletinPdfDirect" style="border-color:var(--forest); color:var(--forest); height:34px; font-weight:600; font-size:12px;">📥 Download PDF</button>
        </div>
        <button class="btn primary" id="sendNow" style="height:34px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l9 2-9-18-9 18z"/></svg>
          Send Bulletin Now
        </button>
      </div>`;
      
    document.getElementById('back2').onclick = () => renderModalStep(2);
    
    // Group & Recipient select logic
    const groupCheckboxes = body.querySelectorAll('.group-select-checkbox');
    const recipientCheckboxes = body.querySelectorAll('.recipient-checkbox');
    
    groupCheckboxes.forEach(gCb => {
      gCb.onchange = () => {
        const gid = gCb.dataset.gid;
        body.querySelectorAll(`.recipient-checkbox[data-gid="${gid}"]`).forEach(rCb => {
          rCb.checked = gCb.checked;
        });
        updateSelectedSummary();
      };
    });

    recipientCheckboxes.forEach(rCb => {
      rCb.onchange = () => {
        const gid = rCb.dataset.gid;
        const allInGroup = body.querySelectorAll(`.recipient-checkbox[data-gid="${gid}"]`);
        const checkedInGroup = body.querySelectorAll(`.recipient-checkbox[data-gid="${gid}"]:checked`);
        const groupCb = body.querySelector(`.group-select-checkbox[data-gid="${gid}"]`);
        if (groupCb) {
          groupCb.checked = allInGroup.length === checkedInGroup.length;
          groupCb.indeterminate = checkedInGroup.length > 0 && checkedInGroup.length < allInGroup.length;
        }
        updateSelectedSummary();
      };
    });

    function updateSelectedSummary() {
      const selectedCbs = body.querySelectorAll('.recipient-checkbox:checked');
      const lbl = document.getElementById('selectedRecipientsCount');
      if (lbl) {
        lbl.textContent = `${selectedCbs.length} selected`;
      }
    }
    
    document.getElementById('sendNow').onclick = () => {
      const selectedCbs = body.querySelectorAll('.recipient-checkbox:checked');
      const selectedContacts = Array.from(selectedCbs).map(cb => ({
        name: cb.dataset.name,
        email: cb.dataset.email,
        whatsapp: cb.dataset.wa
      }));
      handleSendBulletin(items, selectedContacts);
    };
    
    document.getElementById('btnPreviewBulletinPdf').onclick = () => {
      const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const doc = compileBulletinPDFDoc(items, todayStr);
      try {
        const blobUrl = doc.output('bloburl');
        openPdfPreviewModal('Daily Bulletin PDF Preview', blobUrl, doc, `bulletin_${Date.now()}.pdf`);
      } catch (err) {
        showToast('Error generating PDF preview.', 'error');
      }
    };

    document.getElementById('btnDownloadBulletinPdfDirect').onclick = () => {
      const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const doc = compileBulletinPDFDoc(items, todayStr);
      doc.save(`bulletin_${todayStr.replace(/\s+/g, '_')}.pdf`);
      showToast('PDF downloaded successfully!', 'success');
    };
  }
}

// ===== 22.5 BULLETIN PDF GENERATOR HELPER =====
function compileBulletinPDFDoc(items, dateStr) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const todayStr = dateStr || new Date().toLocaleDateString('en-IN');
  const reportTitle = `Daily Real Estate Bulletin`;
  const reportSub = `India Distribution Desk — Compiled on ${todayStr}`;

  doc.setFont('Helvetica', 'bold');
  doc.setFillColor(27, 67, 50);
  doc.rect(0, 0, 595.27, 80, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(reportTitle.toUpperCase(), 36, 40);
  doc.setFontSize(9.5);
  doc.setFont('Helvetica', 'normal');
  doc.text(reportSub, 36, 58);

  doc.setTextColor(28, 35, 51);
  doc.setFontSize(12);
  doc.setFont('Helvetica', 'bold');
  doc.text('EXECUTIVE SHORTLIST SUMMARY', 36, 112);

  const tableRows = items.map((n, i) => [
    (i + 1).toString(), 
    n.headline, 
    n.builder !== '—' ? n.builder : 'N/A', 
    n.city, 
    n.category, 
    n.priorityScore.toString()
  ]);

  doc.autoTable({
    startY: 125,
    head: [['#', 'Headline', 'Developer', 'City', 'Category', 'Score']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [43, 51, 67], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [43, 51, 67] },
    columnStyles: { 
      0: { cellWidth: 20 }, 
      1: { cellWidth: 220 }, 
      2: { cellWidth: 90 }, 
      3: { cellWidth: 70 }, 
      4: { cellWidth: 80 }, 
      5: { cellWidth: 35, halign: 'center' } 
    },
    margin: { left: 36, right: 36 }
  });

  let y = doc.previousAutoTable.finalY + 36;

  items.forEach((n, i) => {
    if (y > 740) { doc.addPage(); y = 50; }
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(27, 67, 50);
    doc.text(`${i + 1}. ${n.headline}`, 36, y);
    y += 14;
    
    const covStr = n.coverages && n.coverages.length > 0 
      ? n.coverages.map(c => `${c.source} (${c.date})`).join(', ') 
      : `${n.source} (${n.date})`;
      
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Reported in: ${covStr} · Category: ${n.category} · State: ${n.state || 'N/A'}`, 36, y);
    y += 13;
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(43, 51, 67);
    const lines = doc.splitTextToSize(n.summary, 523);
    doc.text(lines, 36, y);
    y += (lines.length * 12) + 18;
  });

  return doc;
}

async function handleSendBulletin(articles, selectedContacts, checkedGroups) {
  const body = document.getElementById('modalBody');
  const totalRecs = selectedContacts.length || 5000;

  body.innerHTML = `
    <div style="text-align:center;padding:50px 20px;">
      <div class="stamp" style="animation:spin 2s linear infinite;margin:0 auto 18px;"><span>RE</span></div>
      <h3 style="font-family:'Newsreader',serif;font-size:22px;">Preparing Bulletin Dispatches...</h3>
      <p style="color:var(--ink-soft);font-size:13.5px;margin-top:8px;">Setting up dispatches for ${totalRecs.toLocaleString()} selected contacts...</p>
    </div>`;

  const campaignSubject = `Daily Real Estate Bulletin — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  let result = { success: false };

  // 1. Submit campaign metadata to DB via API or simulate
  if (isBackendMode) {
    try {
      const response = await fetch('/api/broadcast', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'send_campaign',
          subject: campaignSubject,
          articles: articles.map(a => a.id),
          groups: checkedGroups || [],
          formats: Array.from(chosenFormats),
          totalRecipients: totalRecs
        })
      });
      if (response.ok) result = await response.json();
    } catch (err) { console.error('Broadcast error:', err.message); }
  }

  if (result.success) {
    campaigns.unshift(result.campaign);
  } else {
    const delivery = Math.round(totalRecs * 0.985);
    const opens = Math.round(delivery * 0.65);
    const clicks = Math.round(opens * 0.28);
    campaigns.unshift({
      id: 'camp_' + Date.now(),
      subject: campaignSubject,
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      sentAt: new Date().toISOString(),
      formats: Array.from(chosenFormats),
      articlesCount: articles.length,
      recipientsCount: totalRecs,
      mode: isBackendMode ? 'Production' : 'Simulation',
      status: 'Completed',
      stats: { sent: totalRecs, delivered: delivery, opened: opens, clicked: clicks }
    });
  }

  saveToLocalStorage('re_campaigns', campaigns);

  // 2. Build the Dispatch Assistant UI
  body.innerHTML = `
    <div style="padding: 10px 0;">
      <h3 style="font-family:'Newsreader',serif;font-size:21px;color:var(--forest);margin-bottom:8px;">Intelligence Dispatch Center</h3>
      <p style="color:var(--ink-soft);font-size:13px;margin-bottom:18px;line-height:1.4;">The campaign has been recorded. Review and execute dispatches below based on selected formats.</p>
      
      <div id="dispatchAssistantContent" style="display:flex; flex-direction:column; gap:16px;">
        <!-- Filled dynamically -->
      </div>
      
      <div class="modal-foot" style="margin-top:20px; border-top:1px dashed var(--hairline); padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:var(--ink-soft); font-weight:500;">Campaign recorded successfully</span>
        <button class="btn primary small" id="btnFinishDispatch" style="height:32px; min-width:100px;">Finish &amp; Close</button>
      </div>
    </div>`;

  const assistantCont = document.getElementById('dispatchAssistantContent');

  // Load API keys
  const resendKey = localStorage.getItem('api_resend_key') || '';
  const waToken = localStorage.getItem('api_wa_token') || '';
  const waPhoneId = localStorage.getItem('api_wa_phone_id') || '';

  // Filter contacts by formats
  const emailContacts = selectedContacts.filter(c => c.email);
  const whatsappContacts = selectedContacts.filter(c => c.whatsapp);

  // --- HTML Email Dispatch Builder ---
  const todayLongStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c2333; padding: 25px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
      <div style="border-bottom: 3px solid #1b4332; padding-bottom: 15px; margin-bottom: 20px;">
        <span style="font-size: 11px; font-weight: bold; color: #1b4332; text-transform: uppercase; letter-spacing: 0.1em;">Daily Intelligence Desk</span>
        <h1 style="color: #1b4332; font-size: 24px; font-weight: 800; margin: 5px 0 0 0; font-family: Georgia, serif;">Real Estate News Bulletin</h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">Compiled on ${todayLongStr}</p>
      </div>
      ${articles.map((a, idx) => `
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px dashed #e5e7eb;">
          <h3 style="margin: 0 0 8px 0; color: #1b4332; font-size: 17px; font-family: Georgia, serif; line-height: 1.4;">${idx + 1}. ${a.headline}</h3>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151; line-height: 1.5;">${a.summary}</p>
          <div style="font-size: 11.5px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background-color: #f9fafb; padding: 6px 10px; border-radius: 4px; display: inline-block;">
            Category: <span style="color: #111827;">${a.category}</span> &nbsp;|&nbsp; 
            City: <span style="color: #111827;">${a.city}</span> &nbsp;|&nbsp; 
            Developer: <span style="color: #111827;">${a.builder !== '—' ? a.builder : 'N/A'}</span>
          </div>
          ${a.link ? `<div style="margin-top: 10px;"><a href="${a.link}" target="_blank" style="color: #1b4332; font-size: 12.5px; font-weight: bold; text-decoration: none;">Read Original Source →</a></div>` : ''}
        </div>
      `).join('')}
      <div style="text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 11.5px; color: #9ca3af;">
        This email was compiled and sent from the Real Estate News Intelligence Desk.<br>
        © ${new Date().getFullYear()} Real Estate Distribution Desk.
      </div>
    </div>`;

  const emailPlainText = `DAILY REAL ESTATE BULLETIN\n` +
    `Compiled on ${todayLongStr}\n\n` +
    articles.map((a, idx) => 
      `${idx + 1}. ${a.headline.toUpperCase()}\n` +
      `Category: ${a.category} | Developer: ${a.builder !== '—' ? a.builder : 'N/A'} | City: ${a.city}\n` +
      `Summary: ${a.summary}\n` +
      (a.link ? `Link: ${a.link}\n` : '')
    ).join('\n---\n\n') +
    `\n\nGenerated by Real Estate Intelligence Desk`;

  // --- WhatsApp Text Dispatch Builder ---
  const whatsappText = `*DAILY REAL ESTATE BULLETIN* 📰\n` +
    `_Compiled on ${todayLongStr}_\n\n` +
    articles.map((a, idx) => 
      `*${idx + 1}. ${a.headline.toUpperCase()}*\n` +
      `📍 ${a.city}, ${a.state} | ${a.category}\n` +
      `📝 ${a.summary}\n` +
      (a.link ? `🔗 Link: ${a.link}\n` : '')
    ).join('\n---\n\n') +
    `\n_Generated by Real Estate Intelligence Desk_`;

  // RENDER PDF CARD
  if (chosenFormats.has('pdf')) {
    const pdfCard = document.createElement('div');
    pdfCard.style.cssText = 'padding:14px; border:1px solid var(--sand-dark); border-radius:8px; background:var(--sand);';
    pdfCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="margin:0 0 4px 0; color:var(--ink); font-size:13.5px; font-weight:700; display:flex; align-items:center; gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
            PDF Report Generation
          </h4>
          <p style="margin:0; font-size:12px; color:var(--ink-soft);">Compiled PDF containing ${articles.length} shortlisted articles is ready.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn ghost small" id="btnPreviewPdfFinal" style="height:28px; font-size:11.5px; font-weight:600;">👁 Preview</button>
          <button class="btn ghost small" id="btnDownloadPdfFinal" style="height:28px; font-size:11.5px; font-weight:600; border-color:var(--forest); color:var(--forest);">📥 Download</button>
        </div>
      </div>`;
    assistantCont.appendChild(pdfCard);

    document.getElementById('btnPreviewPdfFinal').onclick = () => {
      const doc = compileBulletinPDFDoc(articles, todayLongStr);
      try {
        const blobUrl = doc.output('bloburl');
        openPdfPreviewModal('Daily Bulletin PDF Preview', blobUrl, doc, `bulletin_${Date.now()}.pdf`);
      } catch (err) { showToast('Error showing preview', 'error'); }
    };

    document.getElementById('btnDownloadPdfFinal').onclick = () => {
      const doc = compileBulletinPDFDoc(articles, todayLongStr);
      doc.save(`bulletin_${todayLongStr.replace(/\s+/g, '_')}.pdf`);
      showToast('PDF downloaded successfully!', 'success');
    };
  }

  // RENDER EMAIL CARD
  if (chosenFormats.has('email')) {
    const emailCard = document.createElement('div');
    emailCard.style.cssText = 'padding:14px; border:1px solid var(--sand-dark); border-radius:8px; background:var(--sand);';
    
    if (resendKey) {
      emailCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h4 style="margin:0 0 4px 0; color:var(--ink); font-size:13.5px; font-weight:700; display:flex; align-items:center; gap:6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
              Email Dispatch (Resend API)
            </h4>
            <p style="margin:0; font-size:12px; color:var(--ink-soft);">Ready to dispatch premium HTML newsletter to ${emailContacts.length} recipient(s).</p>
          </div>
          <button class="btn primary small" id="btnSendResendDirect" style="height:28px; font-size:11.5px; font-weight:600;">📧 Dispatch Newsletter</button>
        </div>
        <div id="resendStatusArea" style="margin-top:8px; font-size:12px; font-weight:600; display:none;"></div>`;
      assistantCont.appendChild(emailCard);

      document.getElementById('btnSendResendDirect').onclick = async () => {
        const btn = document.getElementById('btnSendResendDirect');
        const status = document.getElementById('resendStatusArea');
        btn.disabled = true;
        status.style.display = 'block';
        status.style.color = 'var(--ink-soft)';
        status.textContent = `Sending to ${emailContacts.length} emails via Resend...`;

        const toList = emailContacts.map(c => c.email).filter(Boolean);
        if (toList.length === 0) {
          status.textContent = '❌ Error: No selected contacts have valid email addresses.';
          status.style.color = 'red';
          btn.disabled = false;
          return;
        }

        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Real Estate Updates <news@resend.dev>',
              to: toList.slice(0, 100),
              subject: campaignSubject,
              html: emailHtml
            })
          });
          if (res.ok) {
            status.textContent = `✓ Successfully sent email newsletter to ${toList.length} recipient(s).`;
            status.style.color = 'var(--success)';
            showToast('Emails sent successfully!', 'success');
          } else {
            const errText = await res.text();
            throw new Error(errText || `HTTP Status ${res.status}`);
          }
        } catch (e) {
          console.error(e);
          status.textContent = `❌ API Error: ${e.message}. Use manual Mailto fallback instead.`;
          status.style.color = 'red';
          
          // Show manual trigger fallback inside status
          const link = document.createElement('a');
          link.href = `mailto:?bcc=${encodeURIComponent(toList.join(','))}&subject=${encodeURIComponent(campaignSubject)}&body=${encodeURIComponent(emailPlainText)}`;
          link.className = 'btn ghost small';
          link.style.cssText = 'margin-top: 6px; display:inline-block;';
          link.textContent = 'Open Mailto fallback';
          status.appendChild(document.createElement('br'));
          status.appendChild(link);
          btn.disabled = false;
        }
      };
    } else {
      // Manual Mailto fallback
      const toList = emailContacts.map(c => c.email).filter(Boolean);
      emailCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h4 style="margin:0 0 4px 0; color:var(--ink); font-size:13.5px; font-weight:700; display:flex; align-items:center; gap:6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
              Email Newsletter Dispatch
            </h4>
            <p style="margin:0; font-size:12px; color:var(--ink-soft);">Send to ${toList.length} selected email contacts via Bcc using your default email client.</p>
          </div>
          <button class="btn primary small" id="btnMailtoSend" style="height:28px; font-size:11.5px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Open Mail Client
          </button>
        </div>`;
      assistantCont.appendChild(emailCard);

      document.getElementById('btnMailtoSend').onclick = () => {
        if (toList.length === 0) {
          showToast('No selected contacts have valid email addresses.', 'warn');
          return;
        }
        const mailtoUrl = `mailto:?bcc=${encodeURIComponent(toList.join(','))}&subject=${encodeURIComponent(campaignSubject)}&body=${encodeURIComponent(emailPlainText)}`;
        window.open(mailtoUrl, '_blank');
        showToast('Email client opened.', 'success');
      };
    }
  }

  // RENDER WHATSAPP CARD
  if (chosenFormats.has('whatsapp')) {
    const waCard = document.createElement('div');
    waCard.style.cssText = 'padding:14px; border:1px solid var(--sand-dark); border-radius:8px; background:var(--sand);';
    
    waCard.innerHTML = `
      <h4 style="margin:0 0 6px 0; color:var(--ink); font-size:13.5px; font-weight:700; display:flex; align-items:center; gap:6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#25D366"><path d="M17.6 6.3A8 8 0 003.9 16.9L3 21l4.2-1.1A8 8 0 0017.6 6.3z"/></svg>
        WhatsApp Messaging Assistant
      </h4>
      <p style="margin:0 0 12px 0; font-size:12px; color:var(--ink-soft);">Copy the bulletin text or click individual links to open pre-filled chats for the ${whatsappContacts.length} selected contact(s).</p>
      
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <button class="btn ghost small" id="btnCopyWaText" style="font-size:11.5px; height:26px; font-weight:600; border-color:var(--forest); color:var(--forest);">📋 Copy Bulletin Text</button>
      </div>
      
      <div id="waListWrap" style="max-height:130px; overflow-y:auto; border:1px solid var(--sand-dark); border-radius:6px; background:#fff; padding:4px; display:flex; flex-direction:column; gap:4px;">
        ${whatsappContacts.map(c => {
          const cleanPhone = c.whatsapp.replace(/\D/g, ''); // strip spaces, plus, dashes
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 8px; border-bottom:1px solid #f9f9f9; font-size:12px;">
              <div>
                <span style="font-weight:700; color:var(--ink);">${c.name}</span>
                <small style="color:var(--ink-soft); margin-left:4px;">(${c.whatsapp})</small>
              </div>
              <button class="btn small wa-individual-btn" data-phone="${cleanPhone}" style="background:#25D366; color:#fff; border:none; height:24px; padding:0 8px; font-size:11px; font-weight:bold; cursor:pointer; border-radius:4px; display:flex; align-items:center; gap:4px; transition: all 0.2s;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M17.6 6.3A8 8 0 003.9 16.9L3 21l4.2-1.1A8 8 0 0017.6 6.3z"/></svg>
                Send Chat
              </button>
            </div>`;
        }).join('')}
        ${whatsappContacts.length === 0 ? '<p style="font-size:12px; color:var(--ink-soft); text-align:center; padding:10px 0; margin:0;">No WhatsApp contacts selected.</p>' : ''}
      </div>`;
    assistantCont.appendChild(waCard);

    // Bind clipboard copy button
    document.getElementById('btnCopyWaText').onclick = () => {
      navigator.clipboard.writeText(whatsappText).then(() => {
        showToast('WhatsApp bulletin copied to clipboard!', 'success');
      }).catch(err => {
        showToast('Failed to copy text.', 'error');
      });
    };

    // Bind individual send buttons
    waCard.querySelectorAll('.wa-individual-btn').forEach(btn => {
      btn.onclick = () => {
        const phone = btn.dataset.phone;
        if (!phone) {
          showToast('No phone number available.', 'warn');
          return;
        }
        const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(whatsappText)}`;
        window.open(waUrl, '_blank');
        
        // Mark button as opened/sent
        btn.innerHTML = '✓ Sent';
        btn.style.background = '#888';
        btn.style.color = '#fff';
        btn.disabled = true;
      };
    });
  }

  showToast('Dispatch Center loaded!', 'success');

  // Finish dispatch and close modal
  document.getElementById('btnFinishDispatch').onclick = () => {
    closeModal();
    selected.clear();
    chosenRecipients.clear();
    renderFeed();
    updateTray();
    if (activeView === 'admin') renderAdmin();
  };
}

// ===== 23. DRAG & DROP (kept for compatibility) =====
function setupDragAndDrop() {
  // No-op
}

// ===== 24. CLIENT-SIDE SCRAPER HELPERS =====
// ===== 24. CLIENT-SIDE SCRAPER HELPERS =====
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().toLowerCase().trim();
  } catch (e) {
    return url.toLowerCase().trim();
  }
}

// extractActualSource moved to top of file

function parseXmlFeed(xmlText, feedName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items = doc.querySelectorAll('item');
  const parsedItems = [];

  items.forEach(item => {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';

    // Case-insensitive date extraction to support different XML normalizations
    let pubDateText = '';
    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      const tagName = child.tagName.toLowerCase();
      if (tagName === 'pubdate' || tagName === 'date' || tagName.endsWith(':date')) {
        pubDateText = child.textContent;
        break;
      }
    }

    if (!pubDateText) {
      pubDateText = item.querySelector('pubDate')?.textContent ||
        item.querySelector('pubdate')?.textContent ||
        item.querySelector('date')?.textContent || '';
    }

    // Skip articles with no pubDate instead of defaulting to today. Prevents fake freshness claims.
    if (!pubDateText) {
      return;
    }

    const parsedDate = new Date(pubDateText);
    if (isNaN(parsedDate.getTime())) {
      return; // Skip invalid dates
    }

    const description = item.querySelector('description')?.textContent || item.querySelector('encoded')?.textContent || '';

    let imageUrl = null;
    const enclosure = item.querySelector('enclosure');
    if (enclosure && enclosure.getAttribute('url')) {
      imageUrl = enclosure.getAttribute('url');
    }
    if (!imageUrl) {
      for (let i = 0; i < item.children.length; i++) {
        const child = item.children[i];
        const tagName = child.tagName.toLowerCase();
        if (tagName === 'media:content' || tagName === 'content' || tagName.endsWith(':content')) {
          if (child.getAttribute('url')) {
            imageUrl = child.getAttribute('url');
            break;
          }
        }
      }
    }
    if (!imageUrl) {
      const match = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1]) {
        imageUrl = match[1];
      }
    }

    const rawSource = feedName.includes('Google') ? 'Google News' : feedName;
    const actualSource = extractActualSource(title, link, rawSource);

    parsedItems.push({
      title,
      link,
      pubDate: pubDateText,
      content: description.replace(/<[^>]*>/g, '').substring(0, 500),
      source: actualSource,
      imageUrl
    });
  });

  return parsedItems;
}

function clientGetTokens(text) {
  if (!text) return new Set();
  const stopWords = new Set(['in', 'the', 'a', 'of', 'and', 'to', 'for', 'on', 'is', 'at', 'by', 'an', 'with', 'from', 'as', 'its', 'for', 'new']);
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
  );
}

function clientJaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function clientScoreRelevance(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();
  const keywords = {
    'rera': 12, 'maharera': 12, 'redevelopment': 10, 'land acquisition': 10,
    'funding': 9, 'nclt': 10, 'litigation': 8, 'project launch': 8,
    'court orders': 7, 'demolition': 8, 'ready reckoner': 9, 'stamp duty': 8,
    'flat buyers': 6, 'homebuyers': 6, 'housing project': 5, 'builder': 5,
    'developer': 5, 'commercial space': 6, 'luxury tower': 6, 'infrastructure': 5,
    'metro corridor': 6, 'property tax': 7, 'possession delay': 7,
    'karnataka rera': 10, 'up rera': 10
  };
  let score = 0;
  for (const [key, weight] of Object.entries(keywords)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      score += weight * matches.length;
    }
  }
  const builders = ['lodha', 'dlf', 'godrej properties', 'tata housing', 'prestige group', 'sobha', 'oberoi realty', 'brigade', 'omkar', 'hiranandani', 'kolte-patil', 'l&t realty', 'shapoorji'];
  builders.forEach(b => {
    if (text.includes(b)) score += 6;
  });
  return score;
}

async function callGrokClientSide(messages, apiKey, retryCount = 0) {
  const maxRetries = 5;
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-2',
        messages: messages,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (response.status === 429) {
      if (retryCount >= maxRetries) {
        throw new Error(`HTTP 429 Rate Limit Exceeded after ${maxRetries} retries.`);
      }
      const errorText = await response.text();
      let waitMs = 6000; // default wait
      try {
        const parsed = JSON.parse(errorText);
        const msg = parsed.error?.message || '';
        const secMatch = msg.match(/try again in (\d+\.?\d*)s/i);
        const msMatch = msg.match(/try again in (\d+)ms/i);
        if (secMatch) {
          waitMs = parseFloat(secMatch[1]) * 1000 + 750;
        } else if (msMatch) {
          waitMs = parseInt(msMatch[1], 10) + 300;
        }
      } catch (pe) {
        waitMs = Math.pow(2, retryCount) * 3000 + 3000;
      }

      console.warn(`[Grok Rate Limit] HTTP 429 encountered. Waiting ${Math.round(waitMs / 1000)}s before retry #${retryCount + 1}...`);
      showToast(`AI Rate Limit Hit. Pausing ${Math.round(waitMs / 1000)}s to reset limit...`, 'warn', waitMs - 500);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return callGrokClientSide(messages, apiKey, retryCount + 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    return await response.json();
  } catch (err) {
    if ((err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) && retryCount < maxRetries) {
      const waitMs = Math.pow(2, retryCount) * 4000 + 4000;
      console.warn(`[Grok Rate Limit Catch] Waiting ${Math.round(waitMs / 1000)}s before retry #${retryCount + 1}...`);
      showToast(`Retrying AI processing in ${Math.round(waitMs / 1000)}s...`, 'warn', waitMs - 500);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return callGrokClientSide(messages, apiKey, retryCount + 1);
    }
    throw err;
  }
}

async function callGroqClientSide(messages, apiKey, retryCount = 0) {
  const maxRetries = 5;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (response.status === 429) {
      if (retryCount >= maxRetries) {
        throw new Error(`HTTP 429 Rate Limit Exceeded after ${maxRetries} retries.`);
      }
      const errorText = await response.text();
      let waitMs = 6000; // default wait
      try {
        const parsed = JSON.parse(errorText);
        const msg = parsed.error?.message || '';
        const secMatch = msg.match(/try again in (\d+\.?\d*)s/i);
        const msMatch = msg.match(/try again in (\d+)ms/i);
        if (secMatch) {
          waitMs = parseFloat(secMatch[1]) * 1000 + 750; // extra safety margin
        } else if (msMatch) {
          waitMs = parseInt(msMatch[1], 10) + 300;
        }
      } catch (pe) {
        // Fallback to exponential wait
        waitMs = Math.pow(2, retryCount) * 3000 + 3000;
      }

      console.warn(`[Groq Rate Limit] HTTP 429 encountered. Waiting ${Math.round(waitMs / 1000)}s before retry #${retryCount + 1}...`);
      showToast(`AI Rate Limit Hit. Pausing ${Math.round(waitMs / 1000)}s to reset limit...`, 'warn', waitMs - 500);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return callGroqClientSide(messages, apiKey, retryCount + 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    return await response.json();
  } catch (err) {
    // Catch standard fetch network/timeout errors that might be due to rate limit/blocking
    if ((err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) && retryCount < maxRetries) {
      const waitMs = Math.pow(2, retryCount) * 4000 + 4000;
      console.warn(`[Groq Rate Limit Catch] Waiting ${Math.round(waitMs / 1000)}s before retry #${retryCount + 1}...`);
      showToast(`Retrying AI processing in ${Math.round(waitMs / 1000)}s...`, 'warn', waitMs - 500);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return callGroqClientSide(messages, apiKey, retryCount + 1);
    }
    throw err;
  }
}

// ===== 25. PERSONALIZED PDF COMPILER =====
function compilePersonalPDF(recipientName, matchedIds, dateStr) {
  const newsMap = {};
  NEWS.forEach(item => {
    newsMap[item.id.toString()] = item;
  });
  
  const matched = [];
  matchedIds.forEach(id => {
    const art = newsMap[id.toString()];
    if (art) matched.push(art);
  });

  if (matched.length === 0) {
    showToast('No archived articles found for this log entry.', 'warn');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const todayStr = dateStr || new Date().toLocaleDateString('en-IN');
  const reportTitle = `Real Estate Bulletin Bundle`;
  const reportSub = `Personalized Digital Cutting for ${recipientName} · ${todayStr}`;

  // 1. Premium Header Banner
  doc.setFillColor(27, 67, 50); // Deep Forest Green
  doc.rect(0, 0, 595.27, 85, 'F');
  
  // Gold accent line
  doc.setFillColor(196, 154, 76); // Gold #c49a4c
  doc.rect(0, 85, 595.27, 4, 'F');

  // Title & Subtitle
  doc.setFont('times', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(reportTitle.toUpperCase(), 36, 45);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(210, 225, 218); // Soft sage green
  doc.text(reportSub, 36, 65);

  // 2. Executive Summary Table
  doc.setTextColor(28, 35, 51);
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('EXECUTIVE SHORTLIST SUMMARY', 36, 120);

  const tableRows = matched.map((n, i) => [
    (i + 1).toString(), 
    n.headline, 
    n.builder !== '—' ? n.builder : 'N/A', 
    n.city, 
    n.category, 
    n.priorityScore.toString()
  ]);

  doc.autoTable({
    startY: 135,
    head: [['#', 'Headline', 'Developer', 'City', 'Category', 'Score']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [27, 67, 50], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: [43, 51, 67], font: 'helvetica' },
    columnStyles: { 
      0: { cellWidth: 20 }, 
      1: { cellWidth: 220 }, 
      2: { cellWidth: 90 }, 
      3: { cellWidth: 70 }, 
      4: { cellWidth: 80 }, 
      5: { cellWidth: 35, halign: 'center' } 
    },
    margin: { left: 36, right: 36 }
  });

  let y = doc.previousAutoTable.finalY + 40;

  // 3. Clippings Section
  matched.forEach((n, i) => {
    // Check height to prevent orphan headings
    const summaryLines = doc.splitTextToSize(n.summary, 505);
    const requiredHeight = 20 + 15 + (summaryLines.length * 13) + 30; // Headline + meta + summary lines + margins
    
    if (y + requiredHeight > 780) {
      doc.addPage();
      y = 50;
    }

    // Newspaper Divider Rule (Thick + Thin line)
    doc.setDrawColor(196, 154, 76); // Gold
    doc.setLineWidth(1.5);
    doc.line(36, y, 559, y);
    doc.setDrawColor(220, 220, 220); // Light gray
    doc.setLineWidth(0.5);
    doc.line(36, y + 4, 559, y + 4);
    y += 18;

    // Headline (Times Bold)
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(27, 67, 50); // Forest Green
    doc.text(`${i + 1}. ${n.headline}`, 36, y);
    y += 16;
    
    // Metadata (Helvetica Italic)
    const covStr = n.coverages && n.coverages.length > 0 
      ? n.coverages.map(c => `${c.source} (${c.date})`).join(', ') 
      : `${n.source} (${n.date})`;
      
    doc.setFont('helvetica', 'oblique');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(`Attributed to: ${covStr}  ·  Category: ${n.category}  ·  Location: ${n.city}, ${n.state || 'India'}`, 36, y);
    y += 12;
    
    // Summary block with a clean left border accent
    const lineHeight = 13.5;
    const summaryHeight = (summaryLines.length * lineHeight);
    
    // Draw subtle gray background fill for summary block
    doc.setFillColor(248, 247, 244); // Warm paper background color
    doc.rect(36, y, 523, summaryHeight + 8, 'F');
    
    // Left Accent Bar (Forest Green)
    doc.setFillColor(27, 67, 50);
    doc.rect(36, y, 4, summaryHeight + 8, 'F');
    
    // Print summary text inside the warm background panel
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(43, 51, 67);
    doc.text(summaryLines, 48, y + 10);
    
    y += summaryHeight + 25;
  });

  try {
    const blobUrl = doc.output('bloburl');
    openPdfPreviewModal(`Bulletin for ${recipientName}`, blobUrl, doc, `bulletin_${recipientName.toLowerCase().replace(/\s+/g, '_')}_${todayStr.replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('[Preview Error]:', err);
    doc.save(`bulletin_${recipientName.toLowerCase().replace(/\s+/g, '_')}_${todayStr.replace(/\s+/g, '_')}.pdf`);
  }
}

// ===== 26. PDF PREVIEW MODAL HELPERS =====
function openPdfPreviewModal(title, blobUrl, doc, filename) {
  const modal = document.getElementById('pdfPreviewModal');
  const titleEl = document.getElementById('pdfPreviewTitle');
  const iframe = document.getElementById('pdfPreviewIFrame');
  
  if (modal && iframe) {
    if (titleEl) titleEl.textContent = title;
    iframe.src = blobUrl;
    modal.classList.remove('hidden');
    modal.classList.add('show');
    
    window.currentPreviewDoc = doc;
    window.currentPreviewFilename = filename;
    showToast('PDF compiled! Preview loaded.', 'success');
  } else {
    doc.save(filename);
    showToast('PDF downloaded successfully!', 'success');
  }
}

function closePdfPreviewModal() {
  const modal = document.getElementById('pdfPreviewModal');
  const iframe = document.getElementById('pdfPreviewIFrame');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('show');
  }
  if (iframe) iframe.src = 'about:blank';
  window.currentPreviewDoc = null;
  window.currentPreviewFilename = null;
}
