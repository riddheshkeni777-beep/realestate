const fs = require('fs');
const path = require('path');

let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
  createClient = null;
}

// 1. Initialize Supabase if credentials are provided in env
let supabase = null;
if (createClient && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    console.log('[DB Helper] Supabase initialized successfully.');
  } catch (err) {
    console.error('[DB Helper] Supabase connection failed:', err.message);
  }
}

// 2. Initialize Netlify Blobs if on Netlify
let getStore = null;
try {
  if (process.env.NETLIFY) {
    getStore = require('@netlify/blobs').getStore;
  }
} catch (e) {
  // Offline
}

const LOCAL_RECIPIENTS = path.join(__dirname, '../../recipients.json');
const LOCAL_CAMPAIGNS = path.join(__dirname, '../../campaigns.json');
const LOCAL_SOURCES = path.join(__dirname, '../../source_configs.json');
const LOCAL_DISPATCH_LOGS = path.join(__dirname, '../../dispatch_logs.json');
const LOCAL_SCRAPE_RUNS = path.join(__dirname, '../../scrape_runs.json');
const LOCAL_SYSTEM_SETTINGS = path.join(__dirname, '../../system_settings.json');
const LOCAL_NEWS = path.join(__dirname, '../../news_items.json');

async function getStoreValue(key, localFilePath, defaultValue) {
  // Tier 1: Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('key_value_store')
        .select('value')
        .eq('key', key)
        .single();
      if (!error && data) return data.value;
    } catch (err) {
      console.error(`[DB Helper] Supabase read error for ${key}:`, err.message);
    }
  }

  // Tier 2: Netlify Blobs
  if (getStore) {
    try {
      const store = getStore('real_estate_platform');
      const raw = await store.get(`${key}_db`);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.error(`[DB Helper] Netlify Blobs read error for ${key}:`, err.message);
    }
  }

  // Tier 3: Local JSON File
  if (fs.existsSync(localFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(localFilePath, 'utf8'));
    } catch (e) {
      console.error(`[DB Helper] Local file read error for ${key}:`, e.message);
    }
  }

  return defaultValue;
}

async function setStoreValue(key, localFilePath, data) {
  // Tier 1: Supabase
  if (supabase) {
    try {
      const { error } = await supabase
        .from('key_value_store')
        .upsert({ key: key, value: data });
      if (!error) return true;
    } catch (err) {
      console.error(`[DB Helper] Supabase write error for ${key}:`, err.message);
    }
  }

  // Tier 2: Netlify Blobs
  if (getStore) {
    try {
      const store = getStore('real_estate_platform');
      await store.set(`${key}_db`, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error(`[DB Helper] Netlify Blobs write error for ${key}:`, err.message);
    }
  }

  // Tier 3: Local JSON File
  try {
    fs.writeFileSync(localFilePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[DB Helper] Local file write error for ${key}:`, err.message);
    return false;
  }
}

async function getRecipients() {
  return getStoreValue('recipients', LOCAL_RECIPIENTS, { groups: [] });
}

async function setRecipients(data) {
  if (data.groups) {
    data.groups.forEach(g => {
      g.count = g.contacts ? g.contacts.length : 0;
    });
  }
  return setStoreValue('recipients', LOCAL_RECIPIENTS, data);
}

async function getCampaigns() {
  return getStoreValue('campaigns', LOCAL_CAMPAIGNS, { campaigns: [] });
}

async function setCampaigns(data) {
  return setStoreValue('campaigns', LOCAL_CAMPAIGNS, data);
}

async function getSourceConfigs() {
  const data = await getStoreValue('source_configs', LOCAL_SOURCES, { configs: [] });
  if (data && data.configs && data.configs.length > 0 && !data.configs.some(c => c.id === 'sc_10')) {
    data.configs.push({
      id: 'sc_10',
      name: 'Google News: India National Real Estate',
      type: 'google_news',
      url: 'https://news.google.com/rss/search?q=%22real+estate%22+India+OR+%22property+market%22+India+OR+%22home+sales%22+India+OR+%22housing+launches%22+India&hl=en-IN&gl=IN&ceid=IN:en',
      selector: '',
      active: true
    });
    await setStoreValue('source_configs', LOCAL_SOURCES, data);
  }
  return data;
}

async function setSourceConfigs(data) {
  return setStoreValue('source_configs', LOCAL_SOURCES, data);
}

async function getDispatchLogs() {
  return getStoreValue('dispatch_logs', LOCAL_DISPATCH_LOGS, { logs: [] });
}

async function setDispatchLogs(data) {
  return setStoreValue('dispatch_logs', LOCAL_DISPATCH_LOGS, data);
}

async function getScrapeRuns() {
  return getStoreValue('scrape_runs', LOCAL_SCRAPE_RUNS, { runs: [] });
}

async function setScrapeRuns(data) {
  return setStoreValue('scrape_runs', LOCAL_SCRAPE_RUNS, data);
}

async function getSystemSettings() {
  return getStoreValue('system_settings', LOCAL_SYSTEM_SETTINGS, {
    autosend_enabled: true,
    maharashtra_first: false
  });
}

async function setSystemSettings(data) {
  return setStoreValue('system_settings', LOCAL_SYSTEM_SETTINGS, data);
}

async function getNewsItems() {
  return getStoreValue('news_items', LOCAL_NEWS, { articles: [] });
}

async function setNewsItems(data) {
  return setStoreValue('news_items', LOCAL_NEWS, data);
}

module.exports = {
  getRecipients,
  setRecipients,
  getCampaigns,
  setCampaigns,
  getSourceConfigs,
  setSourceConfigs,
  getDispatchLogs,
  setDispatchLogs,
  getScrapeRuns,
  setScrapeRuns,
  getSystemSettings,
  setSystemSettings,
  getNewsItems,
  setNewsItems
};
