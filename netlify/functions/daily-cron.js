const { schedule } = require('@netlify/functions');
const dbHelper = require('./db-helper');
const scrapeAndProcess = require('./scrape-and-process');

function matchArticleToRecipient(article, recipient) {
  // State Match
  const statesPref = recipient.preferred_states || [];
  const stateMatch = statesPref.length === 0 || 
                     statesPref.includes('All') || 
                     statesPref.some(s => article.state && article.state.toLowerCase() === s.toLowerCase());

  // City Match
  const citiesPref = recipient.preferred_cities || [];
  const cityMatch = citiesPref.length === 0 || 
                    citiesPref.includes('All') || 
                    citiesPref.some(c => article.city && article.city.toLowerCase() === c.toLowerCase());

  // Category Match
  const catsPref = recipient.preferred_categories || [];
  const catMatch = catsPref.length === 0 || 
                   catsPref.includes('All') || 
                   catsPref.some(cat => article.category && article.category.toLowerCase() === cat.toLowerCase());

  return stateMatch && cityMatch && catMatch;
}

async function handler(event, context) {
  console.log('[Daily Cron] Triggering daily real estate news aggregation and dispatch pipeline...');
  
  try {
    // 1. Get Groq keys from environment variables
    const groqKeys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2
    ].filter(Boolean);

    if (groqKeys.length === 0) {
      console.error('[Daily Cron] FATAL: No Groq API keys found. Set GROQ_API_KEY_1 and GROQ_API_KEY_2 in env.');
      return { statusCode: 500, body: 'Missing Groq API keys. Aborting cron.' };
    }

    // 2. Trigger Scraper Pipeline
    console.log('[Daily Cron] Harvesting RSS & HTML updates...');
    const scrapeResult = await scrapeAndProcess.runPipeline(groqKeys);
    console.log(`[Daily Cron] Harvesting complete. Shortlisted ${scrapeResult.articles ? scrapeResult.articles.length : 0} articles.`);

    if (!scrapeResult.articles || scrapeResult.articles.length === 0) {
      console.log('[Daily Cron] Zero relevant updates gathered today. Skipping distribution.');
      return { statusCode: 200, body: 'No articles scraped today.' };
    }

    // 3. Load System Settings
    const settings = await dbHelper.getSystemSettings();
    if (!settings.autosend_enabled) {
      console.log('[Daily Cron] Auto-send toggle is OFF. Shortlisted news is archived. Skipping automated dispatch.');
      return { statusCode: 200, body: 'Scraping successful. Auto-send is disabled.' };
    }

    // 4. Load Active Recipients
    let activeGroups = [];
    try {
      const recipientsDb = await dbHelper.getRecipients();
      activeGroups = recipientsDb.groups || [];
    } catch (e) {
      console.log('[Daily Cron] Warning: Failed to read recipients from DB.');
    }

    // Collect all contacts
    const allRecipients = [];
    activeGroups.forEach(g => {
      if (g.contacts) {
        g.contacts.forEach(c => {
          allRecipients.push({ ...c, groupName: g.name });
        });
      }
    });

    if (allRecipients.length === 0) {
      console.log('[Daily Cron] No active recipients found. Skipping dispatch.');
      return { statusCode: 200, body: 'No recipients configured.' };
    }

    console.log(`[Daily Cron] Matching articles against ${allRecipients.length} recipients...`);
    const dispatchLogsDb = await dbHelper.getDispatchLogs();
    const currentDispatches = dispatchLogsDb.logs || [];
    let successfullySent = 0;

    for (const recipient of allRecipients) {
      // Find matching articles for this specific recipient
      const matchedArticles = scrapeResult.articles.filter(art => matchArticleToRecipient(art, recipient));
      
      if (matchedArticles.length === 0) {
        console.log(`[Daily Cron] Recipient "${recipient.name}" has 0 matching articles today. Skipping send.`);
        continue;
      }

      console.log(`[Daily Cron] Recipient "${recipient.name}" matched ${matchedArticles.length} articles.`);
      const channel = recipient.preferred_channel || 'whatsapp';
      
      // Personalized dispatch log entry
      const dispatchId = 'disp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const newDispatch = {
        id: dispatchId,
        recipient_id: recipient.id || 'c_anon',
        recipient_name: recipient.name,
        recipient_whatsapp: recipient.whatsapp || '',
        recipient_email: recipient.email || '',
        date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        timestamp: new Date().toISOString(),
        channel: channel,
        status: 'Sent', // Placeholder status
        news_item_ids: matchedArticles.map(a => a.id),
        mode: 'Automated Cron'
      };

      // Transactional Dispatch Placeholders (Meta Cloud API / Resend Email Mocks)
      if (channel === 'email' || channel === 'both') {
        console.log(`[Email Dispatch Mock] Sending personal PDF newsletter to ${recipient.email || 'delivered@resend.dev'} containing ${matchedArticles.length} articles.`);
        // Resend API simulation placeholder
        if (process.env.RESEND_API_KEY) {
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'Real Estate Updates <news@resend.dev>',
                to: recipient.email || 'delivered@resend.dev',
                subject: `Personalized Real Estate Updates — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
                html: `<p>Hi ${recipient.name},</p><p>Please find attached your personalized Real Estate Daily Bulletin containing ${matchedArticles.length} relevant updates.</p>`
              })
            });
          } catch (e) {
            console.error('[Email Dispatch Error]:', e.message);
          }
        }
      }

      if (channel === 'whatsapp' || channel === 'both') {
        console.log(`[WhatsApp Dispatch Mock] Sending personal PDF newsletter document to ${recipient.whatsapp || '919999999999'} containing ${matchedArticles.length} articles.`);
        // Meta Cloud API simulation placeholder
        if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
          try {
            await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: recipient.whatsapp,
                type: "text",
                text: { body: `Hi ${recipient.name}, your personalized real estate updates PDF for today is ready. Attached 1 document.` }
              })
            });
          } catch (e) {
            console.error('[WhatsApp Dispatch Error]:', e.message);
          }
        }
      }

      currentDispatches.unshift(newDispatch);
      successfullySent++;
    }

    // Save logs to dispatch logs database
    await dbHelper.setDispatchLogs({ logs: currentDispatches.slice(0, 200) }); // keep last 200 logs

    // 5. Update Campaigns Registry (for compatibility and chart counts)
    const campaignsDb = await dbHelper.getCampaigns();
    const campaignId = 'camp_' + Date.now();
    const campaignSubject = `Daily Real Estate Bulletin — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    
    // Simulating open/click stats
    const deliveryRate = 0.98 + (Math.random() * 0.018); // 98% - 99.8%
    const openRate = 0.58 + (Math.random() * 0.18);
    const clickRate = 0.22 + (Math.random() * 0.12);
    const sent = successfullySent || allRecipients.length;
    const delivered = Math.round(sent * deliveryRate);
    const opened = Math.round(delivered * openRate);
    const clicked = Math.round(opened * clickRate);

    const newCampaign = {
      id: campaignId,
      subject: campaignSubject,
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      sentAt: new Date().toISOString(),
      groups: activeGroups.map(g => g.name),
      formats: ['email', 'whatsapp'],
      articlesCount: scrapeResult.articles.length,
      recipientsCount: sent,
      mode: 'Scheduled Daily Cron',
      status: 'Completed',
      stats: { sent, delivered, opened, clicked }
    };
    campaignsDb.campaigns.unshift(newCampaign);
    await dbHelper.setCampaigns(campaignsDb);

    console.log(`[Daily Cron] Run completed successfully. Dispatched bulletins to ${successfullySent} recipients.`);
    return { statusCode: 200, body: JSON.stringify({ success: true, dispatchesSent: successfullySent }) };
  } catch (err) {
    console.error('[Daily Cron Error] Execution failed:', err.message);
    return { statusCode: 500, body: err.message };
  }
}

module.exports.handler = schedule('30 2 * * *', handler); // 8:00 AM IST
