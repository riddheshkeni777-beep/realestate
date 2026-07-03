const dbHelper = require('./db-helper');

const DEFAULT_SOURCES = [
  { id: 'sc_1', name: 'Economic Times Realty', type: 'rss', url: 'https://realty.economictimes.indiatimes.com/rss/topstories', selector: '', active: true },
  { id: 'sc_2', name: 'Moneycontrol Real Estate', type: 'rss', url: 'https://www.moneycontrol.com/rss/realestate.xml', selector: '', active: true },
  { id: 'sc_3', name: 'Housing.com News', type: 'rss', url: 'https://housing.com/news/feed/', selector: '', active: true },
  { id: 'sc_4', name: 'Construction Week India', type: 'rss', url: 'https://www.constructionweekonline.in/feed', selector: '', active: true },
  { id: 'sc_5', name: 'Google News: Mumbai Real Estate', type: 'google_news', url: 'https://news.google.com/rss/search?q=%22Mumbai+real+estate%22+OR+%22MMR+property%22+OR+%22MahaRERA%22+OR+%22Thane+real+estate%22+OR+%22Navi+Mumbai+property%22&hl=en-IN&gl=IN&ceid=IN:en', selector: '', active: true },
  { id: 'sc_6', name: 'Google News: Hindi Real Estate', type: 'google_news', url: 'https://news.google.com/rss/search?q=%22%E0%A4%B0%E0%A4%B6%E0%A4%AF%E0%A4%B2+%E0%A4%8F%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A5%87%E0%A4%9F%22+OR+%22%E0%A4%AE%E0%A4%B9%E0%A4%BE%E0%A4%B0%E0%A5%87%E0%A4%B0%E0%A4%BE%22+OR+%22%E0%A4%B8%E0%A4%82%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A4%BF+%E0%A4%AC%E0%A4%BE%E0%A4%9C%E0%A4%BE%E0%A4%B0%22&hl=hi&gl=IN&ceid=IN:hi', selector: '', active: true },
  { id: 'sc_7', name: 'Lodha Group Press Releases', type: 'builder', url: 'https://www.lodhagroup.in/news-media', selector: '.news-title', active: true },
  { id: 'sc_8', name: 'MahaRERA Notifications', type: 'rera', url: 'https://maharera.maharashtra.gov.in/notifications', selector: 'table tr td a', active: true },
  { id: 'sc_9', name: 'MoHUA Housing Updates', type: 'govt', url: 'https://mohua.gov.in/news-and-updates.php', selector: '.news-update-list a', active: true }
];

async function readSources() {
  const db = await dbHelper.getSourceConfigs();
  if (!db || !db.configs || db.configs.length === 0) {
    return { configs: DEFAULT_SOURCES };
  }
  return db;
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

  try {
    const sourcesDb = await readSources();
    const settings = await dbHelper.getSystemSettings();
    const runsDb = await dbHelper.getScrapeRuns();
    const dispatchesDb = await dbHelper.getDispatchLogs();
    const newsDb = await dbHelper.getNewsItems();

    // GET /api/system-status
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          configs: sourcesDb.configs,
          settings,
          runs: runsDb.runs || [],
          dispatches: dispatchesDb.logs || [],
          articles: newsDb.articles || []
        })
      };
    }

    // POST /api/system-status
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      // 1. SAVE SOURCE CONFIG (Create or Update)
      if (action === 'save_source') {
        const { source } = body;
        if (!source.name || !source.url) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Name and URL are required' }) };
        }

        if (source.id) {
          // Update existing
          const idx = sourcesDb.configs.findIndex(s => s.id === source.id);
          if (idx !== -1) {
            sourcesDb.configs[idx] = { ...sourcesDb.configs[idx], ...source };
          } else {
            sourcesDb.configs.push(source);
          }
        } else {
          // Create new
          source.id = 'sc_' + Date.now();
          source.active = source.active !== undefined ? source.active : true;
          sourcesDb.configs.push(source);
        }

        await dbHelper.setSourceConfigs(sourcesDb);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, configs: sourcesDb.configs }) };
      }

      // 2. DELETE SOURCE CONFIG
      if (action === 'delete_source') {
        const { id } = body;
        sourcesDb.configs = sourcesDb.configs.filter(s => s.id !== id);
        await dbHelper.setSourceConfigs(sourcesDb);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, configs: sourcesDb.configs }) };
      }

      // 3. UPDATE SYSTEM SETTINGS
      if (action === 'update_settings') {
        const { autosend_enabled, maharashtra_first } = body;
        const newSettings = {
          autosend_enabled: autosend_enabled !== undefined ? autosend_enabled : settings.autosend_enabled,
          maharashtra_first: maharashtra_first !== undefined ? maharashtra_first : settings.maharashtra_first
        };
        await dbHelper.setSystemSettings(newSettings);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, settings: newSettings }) };
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('[System Status Function Error]:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message || err })
    };
  }
};
