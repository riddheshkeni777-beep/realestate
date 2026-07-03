const RSSParser = require('rss-parser');
const cheerio = require('cheerio');
const dbHelper = require('./db-helper');

let activeKeyIndex = 0;
const failoverLogs = [];

// Helper: Extract original image from RSS item
function extractImage(item) {
  if (!item) return null;
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  if (item.image && typeof item.image === 'string') return item.image;
  if (item.image && item.image.url) return item.image.url;
  if (item.thumbnail && typeof item.thumbnail === 'string') return item.thumbnail;
  if (item.thumbnail && item.thumbnail.url) return item.thumbnail.url;
  
  const html = (item.content || '') + (item.description || '') + (item.contentSnippet || '');
  if (html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

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

// Helper: Secure Groq call with automatic failover & rate-limit retries
async function callGroqWithFailover(messages, keys, retryCount = 0, rateLimitRetries = 0) {
  if (!keys || keys.length === 0) {
    throw new Error("No Groq API keys configured. Please enter them in the Admin Panel or set env variables.");
  }
  if (retryCount >= keys.length) {
    throw new Error(`Groq API calls failed on all ${keys.length} available keys.`);
  }

  const currentIdx = activeKeyIndex % keys.length;
  const apiKey = keys[currentIdx];
  const redactedKey = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
  console.log(`[Groq API] Attempting call with Key #${currentIdx + 1} (${redactedKey})`);

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
      const errorText = await response.text();
      let waitMs = 6000; // default wait
      try {
        const parsed = JSON.parse(errorText);
        const msg = parsed.error?.message || '';
        const secMatch = msg.match(/try again in (\d+\.?\d*)s/i);
        const msMatch = msg.match(/try again in (\d+)ms/i);
        if (secMatch) {
          waitMs = parseFloat(secMatch[1]) * 1000 + 750; // safety padding
        } else if (msMatch) {
          waitMs = parseInt(msMatch[1], 10) + 300;
        }
      } catch (pe) {}

      if (keys.length > 1 && retryCount < keys.length - 1) {
        console.warn(`[Groq API Rate Limit] Key #${currentIdx + 1} hit 429. Rotating key immediately...`);
        failoverLogs.push({
          timestamp: new Date().toISOString(),
          failedKeyIndex: currentIdx,
          error: `HTTP 429 Rate Limit. Wait required: ${Math.round(waitMs / 1000)}s`,
          nextKeyIndex: (currentIdx + 1) % keys.length
        });
        activeKeyIndex = (currentIdx + 1) % keys.length;
        return callGroqWithFailover(messages, keys, retryCount + 1, 0);
      }

      if (waitMs < 4000) {
        console.warn(`[Groq API Rate Limit] Key #${currentIdx + 1} hit 429. Waiting ${Math.round(waitMs / 1000)}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return callGroqWithFailover(messages, keys, retryCount, rateLimitRetries + 1);
      } else {
        throw new Error(`Groq rate limit try again time (${Math.round(waitMs / 1000)}s) exceeds safe limits.`);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return { data, keyUsed: redactedKey, keyIndex: currentIdx };
  } catch (err) {
    const errorMsg = err.message || err;
    if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
      if (keys.length > 1 && retryCount < keys.length - 1) {
        console.warn(`[Groq API Rate Limit Catch] Rotating key...`);
        failoverLogs.push({
          timestamp: new Date().toISOString(),
          failedKeyIndex: currentIdx,
          error: `Caught rate limit: ${errorMsg}`,
          nextKeyIndex: (currentIdx + 1) % keys.length
        });
        activeKeyIndex = (currentIdx + 1) % keys.length;
        return callGroqWithFailover(messages, keys, retryCount + 1, 0);
      }
    }

    console.error(`[Groq API Error] Key #${currentIdx + 1} failed: ${errorMsg}`);
    failoverLogs.push({
      timestamp: new Date().toISOString(),
      failedKeyIndex: currentIdx,
      error: errorMsg,
      nextKeyIndex: (currentIdx + 1) % keys.length
    });

    activeKeyIndex = (currentIdx + 1) % keys.length;
    return callGroqWithFailover(messages, keys, retryCount + 1, 0);
  }
}

// Tokenize title for similarity analysis
function getTokens(text) {
  if (!text) return new Set();
  const stopWords = new Set(['in', 'the', 'a', 'of', 'and', 'to', 'for', 'on', 'is', 'at', 'by', 'an', 'with', 'from', 'as', 'its', 'for', 'new']);
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
  );
}

// Calculate Jaccard Similarity between two sets
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// Heuristic keyword pre-scoring
function scoreRelevance(title, description) {
  const text = `${title} ${description || ''}`.toLowerCase();
  const keywords = {
    'rera': 5, 'maharera': 5, 'karnataka rera': 5, 'up rera': 5, 'rera penalty': 6, 'rera order': 6, 'show-cause': 5,
    'project launch': 7, 'new launch': 7, 'launched': 5, 'housing project': 5, 'luxury tower': 6, 'residential project': 5,
    'land acquisition': 7, 'redevelopment': 7, 'slum redevelopment': 7, 'cluster redevelopment': 7, 'demolition': 6,
    'funding': 7, 'investment': 6, 'private equity': 7, 'reit': 7, 'ipo': 6, 'qip': 7, 'fdi': 6,
    'stamp duty': 7, 'ready reckoner': 7, 'circle rate': 7, 'property tax': 6, 'affordable housing': 6, 'pmay': 6, 'smart city': 5, 'housing policy': 6,
    'metro rail': 7, 'metro corridor': 7, 'highway project': 6, 'airport city': 7, 'infrastructure': 5, 'bullet train': 6,
    'nclt': 7, 'insolvency': 7, 'court orders': 6, 'litigation': 6, 'homebuyer litigation': 7, 'builder fraud': 7, 'flat buyer case': 6, 'possession delay': 6,
    'commercial space': 5, 'office space': 5, 'data centre': 5, 'warehousing': 5, 'builder': 3, 'developer': 3, 'flat buyers': 4, 'homebuyers': 4
  };

  let score = 0;
  for (const [key, weight] of Object.entries(keywords)) {
    const regex = new RegExp(`\\b${key.replace(/-/g, '[- ]')}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      score += weight * matches.length;
    }
  }
  
  const builders = ['lodha', 'dlf', 'godrej properties', 'tata housing', 'prestige group', 'sobha', 'oberoi realty', 'brigade', 'omkar', 'hiranandani', 'kolte-patil', 'l&t realty', 'shapoorji'];
  builders.forEach(b => {
    if (text.includes(b)) score += 5;
  });

  return score;
}

// Map article title to a topic bucket
function detectTopicBucket(title) {
  const text = title.toLowerCase();
  if (/\blaunch\b|launches|launched|new project|residential tower|housing project|new phase|new tower|unveils|inaugurate/i.test(text)) return 'Project Launch';
  if (/land acquisition|redevelopment|slum redevelopment|cluster redevelopment|\bsra\b|demolish/i.test(text)) return 'Redevelopment';
  if (/\bfunding\b|\binvestment\b|private equity|\breit\b|\bipo\b|\bqip\b|raises|crore fund|\bfdi\b|venture capital|series [a-c]/i.test(text)) return 'Funding';
  if (/stamp duty|circle rate|property tax|ready reckoner|\bpmay\b|affordable housing|housing policy|housing ministry|mohua/i.test(text)) return 'Government Policy';
  if (/\bmetro\b|highway project|airport city|\binfrastructure\b|bullet train|elevated road|expressway|flyover/i.test(text)) return 'Infrastructure';
  if (/\bnclt\b|insolvency|\blitigation\b|builder fraud|possession delay|flat buyer.*case|cheating|arrested/i.test(text)) return 'Litigation';
  if (/\brera\b|maharera|show.cause|show cause|notice.*developer|notice.*builder/i.test(text)) return 'RERA';
  return 'General';
}

// HTML Web scraper helper using Cheerio
async function scrapeHtmlSource(name, url, selector, type) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    
    const items = [];
    $(selector || 'a').each((i, el) => {
      if (items.length >= 15) return;
      const $el = $(el);
      let title = $el.text().trim();
      let link = $el.attr('href');
      
      if (title && title.length > 15 && link) {
        if (link.startsWith('/')) {
          link = baseUrl + link;
        } else if (!link.startsWith('http')) {
          link = url.replace(/\/$/, '') + '/' + link;
        }
        
        items.push({
          title: title.replace(/\s+/g, ' '),
          link: link,
          pubDate: new Date().toISOString(),
          content: `Updates scraped from official portal of ${name} under ${type}.`,
          source: name,
          imageUrl: null
        });
      }
    });
    return items;
  } catch (err) {
    throw new Error(`Failed to fetch HTML: ${err.message}`);
  }
}

async function runPipeline(groqKeys) {
  if (!groqKeys || groqKeys.length === 0) {
    throw new Error("No Groq API keys configured. Please enter them in the Admin Panel or set env variables.");
  }
  const parser = new RSSParser();

  // 1. Fetch Dynamic Source Configs
  let configs = [];
  try {
    const sourcesDb = await dbHelper.getSourceConfigs();
    configs = sourcesDb.configs || [];
    if (configs.length > 0 && !configs.some(c => c.id === 'sc_10')) {
      configs.push({
        id: 'sc_10',
        name: 'Google News: India National Real Estate',
        type: 'google_news',
        url: 'https://news.google.com/rss/search?q=%22real+estate%22+India+OR+%22property+market%22+India+OR+%22home+sales%22+India+OR+%22housing+launches%22+India&hl=en-IN&gl=IN&ceid=IN:en',
        selector: '',
        active: true
      });
      await dbHelper.setSourceConfigs({ configs });
    }
  } catch (e) {
    console.error('[Scraper] Failed to fetch source configs, using defaults.', e.message);
  }

  // Load defaults if empty
  if (configs.length === 0) {
    configs = [
      { id: 'sc_1', name: 'Economic Times Realty', type: 'rss', url: 'https://realty.economictimes.indiatimes.com/rss/topstories', selector: '', active: true },
      { id: 'sc_2', name: 'Moneycontrol Real Estate', type: 'rss', url: 'https://www.moneycontrol.com/rss/realestate.xml', selector: '', active: true },
      { id: 'sc_3', name: 'Housing.com News', type: 'rss', url: 'https://housing.com/news/feed/', selector: '', active: true },
      { id: 'sc_4', name: 'Construction Week India', type: 'rss', url: 'https://www.constructionweekonline.in/feed', selector: '', active: true },
      { id: 'sc_5', name: 'Google News: Mumbai Real Estate', type: 'google_news', url: 'https://news.google.com/rss/search?q=%22Mumbai+real+estate%22+OR+%22MMR+property%22+OR+%22MahaRERA%22+OR+%22Thane+real+estate%22+OR+%22Navi+Mumbai+property%22&hl=en-IN&gl=IN&ceid=IN:en', selector: '', active: true },
      { id: 'sc_6', name: 'Google News: Hindi Real Estate', type: 'google_news', url: 'https://news.google.com/rss/search?q=%22%E0%A4%B0%E0%A4%B6%E0%A4%AF%E0%A4%B2+%E0%A4%8F%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A5%87%E0%A4%9F%22+OR+%22%E0%A4%AE%E0%A4%B9%E0%A4%BE%E0%A4%B0%E0%A5%87%E0%A4%B0%E0%A4%BE%22+OR+%22%E0%A4%B8%E0%A4%82%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A4%BF+%E0%A4%AC%E0%A4%BE%E0%A4%9C%E0%A4%BE%E0%A4%B0%22&hl=hi&gl=IN&ceid=IN:hi', selector: '', active: true },
      { id: 'sc_7', name: 'Lodha Group Press Releases', type: 'builder', url: 'https://www.lodhagroup.in/news-media', selector: '.news-title', active: true },
      { id: 'sc_8', name: 'MahaRERA Notifications', type: 'rera', url: 'https://maharera.maharashtra.gov.in/notifications', selector: 'table tr td a', active: true },
      { id: 'sc_9', name: 'MoHUA Housing Updates', type: 'govt', url: 'https://mohua.gov.in/news-and-updates.php', selector: '.news-update-list a', active: true },
      { id: 'sc_10', name: 'Google News: India National Real Estate', type: 'google_news', url: 'https://news.google.com/rss/search?q=%22real+estate%22+India+OR+%22property+market%22+India+OR+%22home+sales%22+India+OR+%22housing+launches%22+India&hl=en-IN&gl=IN&ceid=IN:en', selector: '', active: true }
    ];
  }

  const activeConfigs = configs.filter(c => c.active);
  console.log(`[Scraper] Starting fetch for ${activeConfigs.length} active sources...`);
  
  const allArticles = [];
  const runDetails = [];

  for (const config of activeConfigs) {
    try {
      if (config.type === 'rss' || config.type === 'google_news') {
        let url = config.url;
        if (config.type === 'google_news') {
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
        const parsePromise = parser.parseURL(url);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout (6s)')), 6000)
        );
        const parsed = await Promise.race([parsePromise, timeoutPromise]);
        const items = parsed.items.map(item => {
          const rawSource = config.name.includes('Google') ? 'Google News' : config.name;
          const actualSource = extractActualSource(item.title, item.link, rawSource);
          return {
            title: item.title,
            link: item.link,
            pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
            content: item.content || item.contentSnippet || '',
            source: actualSource,
            imageUrl: extractImage(item)
          };
        });
        allArticles.push(...items);
        runDetails.push({ name: config.name, type: config.type, status: 'Success', itemsFetched: items.length });
      } else {
        // Cheerio scraper for builder/rera/govt pages
        const items = await scrapeHtmlSource(config.name, config.url, config.selector, config.type);
        allArticles.push(...items);
        runDetails.push({ name: config.name, type: config.type, status: 'Success', itemsFetched: items.length });
      }
    } catch (err) {
      console.error(`[Scraper Error] Source ${config.name} failed:`, err.message);
      runDetails.push({ name: config.name, type: config.type, status: 'Failed', error: err.message });
    }
  }

  // Filter out articles older than 7 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  let recentArticles = allArticles.filter(art => {
    const d = new Date(art.pubDate);
    return !isNaN(d.getTime()) && d >= cutoffDate;
  });

  console.log(`[Scraper] Gathered ${recentArticles.length} recent articles. Running deduplication...`);

  // First Pass: Exact title-hash deduplication & merge coverages
  const cleanArticles = [];
  const exactSeen = new Set();
  
  function generateHash(text) {
    if (!text) return '';
    return text.toLowerCase().replace(/[^\w]/g, '').trim();
  }

  for (const art of recentArticles) {
    const hash = generateHash(art.title);
    art.contentHash = hash;
    art.coverages = [{ source: art.source, date: new Date(art.pubDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }];

    if (hash && exactSeen.has(hash)) {
      const existing = cleanArticles.find(c => c.contentHash === hash);
      if (existing) {
        // Keep earliest pubDate to avoid fake claims
        if (new Date(art.pubDate) < new Date(existing.pubDate)) {
          existing.pubDate = art.pubDate;
        }
        if (!existing.coverages.some(cov => cov.source === art.source)) {
          existing.coverages.push(art.coverages[0]);
        }
        if ((art.content || '').length > (existing.content || '').length) {
          const oldPubDate = existing.pubDate;
          existing.content = art.content;
          existing.imageUrl = art.imageUrl || existing.imageUrl;
          existing.pubDate = oldPubDate; // Preserve earliest
        }
      }
      continue;
    }
    if (hash) exactSeen.add(hash);
    cleanArticles.push(art);
  }

  // Second Pass: Jaccard similarity token clustering
  const uniqueArticles = [];
  const titleTokenSets = [];
  const clusterIdPrefix = 'cluster_' + Date.now() + '_';

  for (let i = 0; i < cleanArticles.length; i++) {
    const art = cleanArticles[i];
    const tokens = getTokens(art.title);
    let matchedIdx = -1;

    for (let j = 0; j < uniqueArticles.length; j++) {
      const sim = jaccardSimilarity(tokens, titleTokenSets[j]);
      if (sim > 0.35) {
        matchedIdx = j;
        break;
      }
    }

    if (matchedIdx !== -1) {
      const representative = uniqueArticles[matchedIdx];
      
      // Keep earliest pubDate to avoid fake claims
      const earliestPubDate = new Date(representative.pubDate) < new Date(art.pubDate) 
        ? representative.pubDate 
        : art.pubDate;

      art.coverages.forEach(cov => {
        if (!representative.coverages.some(rCov => rCov.source === cov.source)) {
          representative.coverages.push(cov);
        }
      });
      representative.clusterId = representative.clusterId || `${clusterIdPrefix}${matchedIdx}`;
      if ((art.content || '').length > (representative.content || '').length) {
        const oldCoverages = representative.coverages;
        const oldClusterId = representative.clusterId;
        uniqueArticles[matchedIdx] = art;
        uniqueArticles[matchedIdx].coverages = oldCoverages;
        uniqueArticles[matchedIdx].clusterId = oldClusterId;
        uniqueArticles[matchedIdx].pubDate = earliestPubDate; // Preserve earliest
        titleTokenSets[matchedIdx] = tokens;
      } else {
        representative.pubDate = earliestPubDate; // Preserve earliest
      }
    } else {
      art.clusterId = `${clusterIdPrefix}${uniqueArticles.length}`;
      uniqueArticles.push(art);
      titleTokenSets.push(tokens);
    }
  }

  console.log(`[Deduplicator] Retained ${uniqueArticles.length} unique articles from ${recentArticles.length}. Relevance filtering...`);

  // Score relevance
  const scoredArticles = uniqueArticles.map((art, index) => {
    const score = scoreRelevance(art.title, art.content);
    return { ...art, localId: index, relevanceScore: score };
  });

  scoredArticles.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Diverse candidates selection
  const BUCKET_LIMIT = 8;
  const DISPUTE_BUCKET_LIMIT = 3;
  const bucketCounts = {};
  const candidates = [];

  for (const art of scoredArticles) {
    if (art.relevanceScore <= 2) continue;
    const bucket = detectTopicBucket(art.title);
    bucketCounts[bucket] = (bucketCounts[bucket] || 0);
    const cap = (bucket === 'RERA' || bucket === 'Litigation') ? DISPUTE_BUCKET_LIMIT : BUCKET_LIMIT;
    if (bucketCounts[bucket] < cap) {
      candidates.push({ ...art, detectedBucket: bucket });
      bucketCounts[bucket]++;
    }
    if (candidates.length >= 50) break;
  }

  if (candidates.length === 0) {
    return { success: true, count: 0, articles: [], totalRawScraped: allArticles.length, totalUniqueDeduplicated: uniqueArticles.length, runDetails };
  }

  // LLM shortlisting using Groq
  console.log(`[AI Processor] Processing ${candidates.length} candidates via Groq...`);
  const batchSize = 6;
  const processedArticles = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    
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
5. "city": Primary city mentioned (e.g. "Mumbai", "Thane", "Pune", "Bengaluru", "Delhi", "Gurugram", "Noida", "Hyderabad"). Use "—" if statewide/national.
6. "state": State name (e.g. "Maharashtra", "Karnataka", "Haryana", "Delhi NCR", "Telangana"). Use "—" if national.
7. "category": EXACTLY one of: "Project Launch", "Land Acquisition", "Redevelopment", "RERA", "Funding", "Government Policy", "Infrastructure", "Litigation".
8. "summary": A concise 100-150 word summary in a clean, formal, journalistic tone. Translate Hindi to English if necessary.
9. "priorityScore": Integer (1 to 10) representing impact.

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
      const { data } = await callGroqWithFailover(messages, groqKeys);
      const contentText = data.choices[0].message.content;
      const batchResults = JSON.parse(contentText).results || [];

      for (const item of batchResults) {
        if (item.relevant) {
          const original = batch.find(b => b.localId === item.originalId);
          if (original) {
            const stockImages = {
              'Project Launch': '/images/categories/project-launch.png',
              'Land Acquisition': '/images/categories/land-acquisition.png',
              'Redevelopment': '/images/categories/redevelopment.png',
              'RERA': '/images/categories/rera.png',
              'Funding': '/images/categories/funding.png',
              'Government Policy': '/images/categories/government-policy.png',
              'Infrastructure': '/images/categories/infrastructure.png',
              'Litigation': '/images/categories/litigation.png'
            };

            processedArticles.push({
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
              coverages: original.coverages || [{ source: original.source, date: new Date(original.pubDate).toLocaleDateString('en-IN') }],
              contentHash: original.contentHash,
              clusterId: original.clusterId,
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
            });
          }
        }
      }
    } catch (batchErr) {
      console.error('[AI Processor Error] Failed to process batch:', batchErr.message);
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  processedArticles.sort((a, b) => b.priorityScore - a.priorityScore);
  const topArticles = processedArticles.slice(0, 50);

  // 2. Filter by Maharashtra-first system settings
  let finalArticles = topArticles;
  try {
    const settings = await dbHelper.getSystemSettings();
    if (settings && settings.maharashtra_first) {
      console.log('[Scraper Settings] Maharashtra-first active. Filtering...');
      finalArticles = topArticles.filter(art => {
        const state = (art.state || '').toLowerCase();
        const city = (art.city || '').toLowerCase();
        const title = (art.headline || art.originalTitle || '').toLowerCase();
        return state === 'maharashtra' || 
               ['mumbai', 'thane', 'pune', 'navi mumbai', 'kalyan', 'dombivli', 'nagpur', 'nashik'].includes(city) ||
               title.includes('maharashtra') || title.includes('maharera');
      });
    }
  } catch (e) {
    console.error('[Scraper Settings] Filter error:', e.message);
  }

  // 3. Save to news_items database
  try {
    const newsDb = await dbHelper.getNewsItems();
    const existing = newsDb.articles || [];
    
    // Map existing articles by contentHash for rapid comparison
    const existingMap = {};
    existing.forEach(art => {
      if (art.contentHash) {
        existingMap[art.contentHash] = art;
      }
    });

    const merged = [];
    
    // Cross-check new articles against existing items to preserve earliest pubDate
    finalArticles.forEach(newArt => {
      const match = existingMap[newArt.contentHash];
      if (match) {
        const newDate = new Date(newArt.date || newArt.pubDate);
        const oldDate = new Date(match.date || match.pubDate);
        
        // Retain whichever date is earlier
        const earliestDateStr = (!isNaN(oldDate.getTime()) && !isNaN(newDate.getTime()))
          ? (oldDate < newDate ? (match.date || match.pubDate) : (newArt.date || newArt.pubDate))
          : (match.date || newArt.date || newArt.pubDate);
          
        const mergedCoverages = [...(match.coverages || [])];
        if (newArt.coverages) {
          newArt.coverages.forEach(cov => {
            if (!mergedCoverages.some(c => c.source === cov.source)) {
              mergedCoverages.push(cov);
            }
          });
        }
        
        // Update content to longest/most detailed, but keep earliest pubDate
        match.date = earliestDateStr;
        if (newArt.summary && newArt.summary.length > (match.summary || '').length) {
          match.summary = newArt.summary;
          match.headline = newArt.headline;
        }
        match.coverages = mergedCoverages;
      } else {
        merged.push(newArt);
      }
    });

    // Add back all original/updated articles
    merged.push(...existing);

    // Retain news items from last 7 days only (filters out old merged items automatically)
    const keepCutoff = new Date();
    keepCutoff.setDate(keepCutoff.getDate() - 7);
    const cleanedMerged = merged.filter(art => {
      const d = new Date(art.date || art.pubDate);
      return !isNaN(d.getTime()) && d >= keepCutoff;
    });

    await dbHelper.setNewsItems({ articles: cleanedMerged });
    console.log(`[Scraper] Saved ${finalArticles.length} new items. Cleaned archive count: ${cleanedMerged.length}`);
  } catch (e) {
    console.error('[Scraper] Failed to save news to database:', e.message);
  }

  // 4. Save Scraper Run history log
  try {
    const runsDb = await dbHelper.getScrapeRuns();
    const history = runsDb.runs || [];
    const status = runDetails.some(r => r.status === 'Failed') ? 'Warnings' : 'Success';
    const newRun = {
      id: 'run_' + Date.now(),
      run_at: new Date().toISOString(),
      items_collected: allArticles.length,
      items_after_dedup: uniqueArticles.length,
      items_shortlisted: finalArticles.length,
      status: status,
      details: runDetails
    };
    history.unshift(newRun);
    await dbHelper.setScrapeRuns({ runs: history.slice(0, 50) }); // keep last 50 runs
  } catch (e) {
    console.error('[Scraper] Failed to save scraper run history:', e.message);
  }

  return {
    success: true,
    count: finalArticles.length,
    articles: finalArticles,
    keysStatus: {
      totalKeys: groqKeys.length,
      activeKeyIndex,
      failovers: failoverLogs
    },
    totalRawScraped: allArticles.length,
    totalUniqueDeduplicated: uniqueArticles.length,
    runDetails
  };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const groqKeys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2
  ].filter(Boolean);

  try {
    const result = await runPipeline(groqKeys);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('[Scraper & AI Fatal Error]:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message || err })
    };
  }
};

module.exports.runPipeline = runPipeline;
