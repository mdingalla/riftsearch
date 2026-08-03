import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';
import {
  searchTCGCards,
  getCardDetails,
  getBuyOrders,
  getSellListings,
  getSalesHistory,
  getImageUrl,
  fmtPrice,
  fmtCondition
} from './tcgMarketplace.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const API_URL = 'https://api.riftcodex.com/cards';

// Read local cards fallback
const cardsPath = path.join(__dirname, 'data', 'cards.json');
let fallbackCards = [];
try {
  const fileContent = fs.readFileSync(cardsPath, 'utf8');
  fallbackCards = JSON.parse(fileContent);
} catch (error) {
  console.error('❌ Failed to read local cards fallback:', error);
}

let cards = [];
let loadError = null;

function mapOnlineCard(c) {
  const domains = c.classification?.domain || [];
  const domain = domains.length > 0 ? domains.join(' / ') : 'Neutral';
  const type = c.classification?.type || 'Unknown';
  const rarity = c.classification?.rarity || 'Common';
  
  // Format ID like VEN-001 or UNL-229
  const setId = c.set?.set_id || 'UNK';
  const collectorNum = String(c.collector_number || 0).padStart(3, '0');
  const id = `${setId}-${collectorNum}`.toUpperCase();

  return {
    id: id,
    name: c.name,
    domain: domain,
    type: type,
    rarity: rarity,
    energyCost: c.attributes?.energy ?? 0,
    powerCost: c.attributes?.power ?? 0,
    might: c.attributes?.might ?? null,
    ability: c.text?.plain || '',
    image: c.media?.image_url || '/images/cards/placeholder.png'
  };
}

async function loadCards() {
  try {
    console.log('🌐 Fetching latest cards from Riftcodex API...');
    let allCards = [];
    let page = 1;
    let hasMore = true;
    const size = 100;
    
    while (hasMore) {
      const url = `${API_URL}?size=${size}&page=${page}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        allCards.push(...data.items);
        console.log(`Loaded page ${page} (${data.items.length} cards, total so far: ${allCards.length})`);
        if (allCards.length >= data.total || data.items.length < size) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    cards = allCards.map(mapOnlineCard);
    console.log(`✅ Loaded ${cards.length} cards dynamically from Riftcodex API!`);
  } catch (error) {
    console.error('⚠️ Failed to load online cards, using local fallback:', error.message);
    loadError = error.message;
    cards = fallbackCards;
  }
}

// Call loadCards at startup
await loadCards();

// API Endpoints for Mini App
app.get('/api/debug', (req, res) => {
  res.json({
    cardsCount: cards.length,
    loadError: loadError,
    nodeEnv: process.env.NODE_ENV,
    url: process.env.WEB_APP_URL
  });
});

app.get('/api/cards', (req, res) => {
  res.json(cards);
});

app.get('/api/cards/:id', (req, res) => {
  const card = cards.find(c => c.id.toLowerCase() === req.params.id.toLowerCase());
  if (card) {
    res.json(card);
  } else {
    res.status(404).json({ error: 'Card not found' });
  }
});

// Helper: Format card details as HTML for Telegram Bot messages
function formatCardDetails(c) {
  const domainEmojis = {
    Fury: '🔴 Fury',
    Calm: '🟢 Calm',
    Mind: '🔵 Mind',
    Body: '🟠 Body',
    Chaos: '🟣 Chaos',
    Order: '🟡 Order'
  };

  let html = `<b>🃏 ${c.name} (${c.id})</b>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `🧬 <b>Type:</b> ${c.type}\n`;
  html += `🌀 <b>Domain:</b> ${domainEmojis[c.domain] || c.domain}\n`;
  html += `💎 <b>Rarity:</b> ${c.rarity}\n`;
  html += `⚡ <b>Energy Cost:</b> ${c.energyCost}\n`;
  if (c.powerCost !== null && c.powerCost !== undefined) {
    html += `🔮 <b>Power Cost:</b> ${c.powerCost} ${c.domain} Rune(s)\n`;
  }
  if (c.might !== null && c.might !== undefined) {
    html += `✊ <b>Might (Combat):</b> ${c.might}\n`;
  }
  html += `━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `📖 <b>Ability:</b>\n<i>${c.ability}</i>\n`;
  
  return html;
}

// Helper: Sends a card response, using photo if available online, otherwise falls back to text
async function sendCardReply(ctx, card) {
  const webAppUrl = process.env.WEB_APP_URL;
  const isHttps = webAppUrl && webAppUrl.startsWith('https://');
  const isPrivate = ctx.chat?.type === 'private';

  const row = [Markup.button.callback('💰 Live Prices', `tcgprice:${card.name}`)];
  if (isHttps) {
    if (isPrivate) {
      row.push(Markup.button.webApp('🌐 Card Explorer', webAppUrl));
    } else {
      row.push(Markup.button.url('🌐 Card Explorer', webAppUrl));
    }
  }
  const keyboard = Markup.inlineKeyboard([row]);

  if (card.image && card.image.startsWith('http')) {
    try {
      const caption = `<b>🃏 ${card.name} (${card.id})</b>\n` +
        `🧬 Type: ${card.type}\n` +
        `🌀 Domain: ${card.domain}\n` +
        `⚡ Cost: ${card.energyCost}⚡\n\n` +
        `📖 Ability:\n<i>${card.ability}</i>`;
      
      await ctx.replyWithPhoto(card.image, {
        caption: caption.substring(0, 1024),
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message?.message_id,
        ...keyboard
      });
      return;
    } catch (err) {
      console.warn(`⚠️ Failed to send photo for card ${card.id}, falling back to text:`, err.message);
    }
  }
  // Fallback to text message
  try {
    await ctx.replyWithHTML(formatCardDetails(card), {
      reply_to_message_id: ctx.message?.message_id,
      ...keyboard
    });
  } catch (err) {
    console.error(`⚠️ Failed to send fallback HTML details for card ${card.id}:`, err.message);
  }
}

// Helper: Normalizes a string by converting to lowercase and stripping non-alphanumeric characters
function normalizeString(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper: Performs smart search of card list based on query (e.g. "kaisa" matches "Kai'Sa, Survivor")
function findCardByQuery(query, cardsList) {
  const normQuery = normalizeString(query);
  if (!normQuery) return null;

  // 1. Exact match on normalized name (e.g. "jinx loose cannon" matches "Jinx, Loose Cannon")
  let match = cardsList.find(c => normalizeString(c.name) === normQuery);
  if (match) return match;

  // 2. Starts-with match on normalized name (e.g. "jinx" matches "Jinx, Loose Cannon")
  match = cardsList.find(c => normalizeString(c.name).startsWith(normQuery));
  if (match) return match;

  // 3. Includes match on normalized name (e.g. "cannon" matches "Jinx, Loose Cannon")
  match = cardsList.find(c => normalizeString(c.name).includes(normQuery));
  if (match) return match;

  // 4. Match on normalized ID (e.g. "ogn070" or "ogn-070" matches "OGN-070")
  match = cardsList.find(c => normalizeString(c.id) === normQuery);
  if (match) return match;

  return null;
}

// Helper: Performs smart search returning ALL matching cards
function findCardsByQuery(query, cardsList) {
  const normQuery = normalizeString(query);
  if (!normQuery) return [];

  // 1. Exact match on normalized name (e.g. "zed" matches exactly "Zed")
  const exact = cardsList.filter(c => normalizeString(c.name) === normQuery);
  if (exact.length > 0) return exact;

  // 2. Starts-with match on normalized name
  const startsWith = cardsList.filter(c => normalizeString(c.name).startsWith(normQuery));
  if (startsWith.length > 0) return startsWith;

  // 3. Includes match on normalized name
  const includes = cardsList.filter(c => normalizeString(c.name).includes(normQuery));
  if (includes.length > 0) return includes;

  // 4. Match on normalized ID
  const idMatch = cardsList.filter(c => normalizeString(c.id) === normQuery);
  if (idMatch.length > 0) return idMatch;

  return [];
}

// Helper: Fetches and formats TCG Marketplace price info for a card name
async function sendTCGPriceReply(ctx, cardName, replyToId = null) {
  const thinking = await ctx.replyWithHTML(`🔍 Looking up prices for <b>${cardName}</b> on TCG Marketplace...`);
  try {
    const { merged, listingIds } = await searchTCGCards(cardName);
    if (!merged.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id, thinking.message_id, null,
        `❌ No Riftbound cards found for "<b>${cardName}</b>" on TCG Marketplace.`,
        { parse_mode: 'HTML' }
      );
    }

    const card = merged[0];
    const [details, sellListings, buyOrders, sales] = await Promise.all([
      getCardDetails(card.id),
      getSellListings(card.id).catch(() => []),
      getBuyOrders(card.id).catch(() => []),
      getSalesHistory(card.id).catch(() => [])
    ]);

    const name = (details?.name || card.name || '').trim();
    const setName = details?.crd_setname || card.setname || '';
    const rarity = details?.crd_rarity || '';
    const imgUrl = getImageUrl(details?.image || card.image || '');

    let msg = `💰 <b>TCG Marketplace – ${name}</b>\n`;
    msg += `<i>${setName}  |  ${rarity}</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    // Price summary
    if (details?.price_from || details?.day1 || details?.day7) {
      msg += `📊 <b>Price Averages:</b>\n`;
      if (details.price_from) msg += `  Lowest listed:   <b>${fmtPrice(details.price_from)}</b>\n`;
      if (details.day1)       msg += `  1-day avg sold:  <b>${fmtPrice(details.day1)}</b>\n`;
      if (details.day7)       msg += `  7-day avg sold:  <b>${fmtPrice(details.day7)}</b>\n`;
      msg += `\n`;
    }

    // Active sell listings
    if (!sellListings.length) {
      msg += `🛍 <b>Sell Listings:</b> None active\n`;
    } else {
      const prices = sellListings.map(l => parseFloat(l.price)).filter(Boolean).sort((a,b) => a-b);
      msg += `🛍 <b>Active Listings: ${sellListings.length}</b>  (${fmtPrice(prices[0])} – ${fmtPrice(prices[prices.length-1])})\n`;
      sellListings.slice(0, 4).forEach(l => {
        const foil = l.crd_foil && l.crd_foil !== 'Non Holo' && l.crd_foil !== '0' && l.crd_foil !== 0 ? ` [Foil]` : '';
        const lang = l.crd_language !== 'EN' ? ` (${l.crd_language})` : '';
        const alterSign = (l.crd_signed ? ' [Signed]' : '') + (l.crd_altered ? ' [Altered]' : '');
        msg += `  • <b>${fmtPrice(l.price)}</b>  ${fmtCondition(l.crd_condition)}${foil}${lang}${alterSign}  qty:${l.quantity}  [${l.country_code}]\n`;
      });
    }

    // Active WTB buy orders
    if (buyOrders.length) {
      const prices = buyOrders.map(l => parseFloat(l.price)).filter(Boolean).sort((a,b) => a-b);
      msg += `\n📥 <b>Active Buy Orders (WTB): ${buyOrders.length}</b>  (${fmtPrice(prices[0])} – ${fmtPrice(prices[prices.length-1])})\n`;
      buyOrders.slice(0, 4).forEach(l => {
        const foil = l.crd_foil && l.crd_foil !== 'Non Holo' && l.crd_foil !== '0' && l.crd_foil !== 0 ? ` [Foil]` : '';
        const lang = l.crd_language !== 'EN' ? ` (${l.crd_language})` : '';
        msg += `  • <b>${fmtPrice(l.price)}</b>  ${fmtCondition(l.crd_condition)}${foil}${lang}  qty:${l.quantity}  [${l.country_code}]\n`;
      });
    }

    // Recent sales
    if (sales.length) {
      msg += `\n📈 <b>Recent Sales:</b>\n`;
      sales.slice(0, 4).forEach(s => {
        const foil = s.crd_foil && s.crd_foil !== 'Non Holo' && s.crd_foil !== '0' && s.crd_foil !== 0 ? ` [Foil]` : '';
        msg += `  • ${s.date}  <b>${fmtPrice(s.avg_price)}</b>  ${fmtCondition(s.crd_condition)}  qty:${s.total_sold}${foil}\n`;
      });
    }

    msg += `\n<i>Card ID: ${card.id} | Data from thetcgmarketplace.com</i>`;

    await ctx.telegram.deleteMessage(ctx.chat.id, thinking.message_id).catch(() => {});

    if (imgUrl) {
      try {
        return await ctx.replyWithPhoto(imgUrl, {
          caption: msg.substring(0, 1024),
          parse_mode: 'HTML',
          reply_to_message_id: replyToId || ctx.message?.message_id
        });
      } catch (photoErr) {
        console.warn('⚠️ Price photo failed, falling back to text:', photoErr.message);
      }
    }
    return ctx.replyWithHTML(msg, { reply_to_message_id: replyToId || ctx.message?.message_id });

  } catch (err) {
    console.error('❌ TCG Price Lookup error:', err.message);
    return ctx.telegram.editMessageText(
      ctx.chat.id, thinking.message_id, null,
      `❌ Failed to fetch prices: ${err.message}`,
      { parse_mode: 'HTML' }
    ).catch(() => ctx.replyWithHTML(`❌ Failed to fetch prices: ${err.message}`));
  }
}

// Setup Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
  console.warn('\n⚠️  WARNING: TELEGRAM_BOT_TOKEN is not set or is using the placeholder.');
  console.warn('⚠️  The Telegram Bot will NOT start, but the Web Server is running.');
  console.warn('⚠️  To start the bot, add a valid token in the .env file.\n');
} else {
  try {
    bot = new Telegraf(token);

    // Global bot error handler (prevents crashes on Telegram API drops)
    bot.catch((err, ctx) => {
      console.error('⚠️ Telegram Bot error occurred:', err.message || err);
    });

    // Command: Start
    bot.start((ctx) => {
      const welcome = `👋 <b>Welcome to the Riftbound TCG Card Search Bot!</b>\n\n` +
        `Search for cards from the <b>Origins (OGN)</b> set directly in Telegram.\n\n` +
        `💡 <b>How to search in DMs:</b>\n` +
        `• Type any card name (e.g., <i>Jinx</i>, <i>Yasuo</i>)\n` +
        `• Use /search &lt;query&gt; for keyword matches\n\n` +
        `👥 <b>How to search in Group Chats:</b>\n` +
        `• Type <code>[[Card Name]]</code> anywhere in your message (e.g., <i>"I want to build a deck around [[Yasuo]] and [[Lee Sin]]"</i>) and the bot will reply with the details!\n\n` +
        `📱 Or click the button below to open the interactive <b>Riftbound database explorer</b> Mini App!`;

      // Mini App Button configuration
      const webAppUrl = process.env.WEB_APP_URL;
      const isHttps = webAppUrl && webAppUrl.startsWith('https://');
      const isPrivate = ctx.chat?.type === 'private';

      if (isHttps) {
        const button = isPrivate
          ? Markup.button.webApp('🌐 Open Card Explorer', webAppUrl)
          : Markup.button.url('🌐 Open Card Explorer', webAppUrl);
        return ctx.replyWithHTML(welcome, Markup.inlineKeyboard([[button]]));
      } else {
        const warningWelcome = welcome + `\n\n⚠️ <i>Note: The interactive Mini App button is hidden because WEB_APP_URL is not configured with a secure HTTPS link in the server's .env file.</i>`;
        return ctx.replyWithHTML(warningWelcome);
      }
    });

    // Command: Domains
    bot.command('domains', (ctx) => {
      const domainsInfo = `🧬 <b>Riftbound TCG Domains:</b>\n\n` +
        `🔴 <b>Fury:</b> High aggression, speed, combat stats.\n` +
        `🟢 <b>Calm:</b> Defensive, patient, control, disruption.\n` +
        `🔵 <b>Mind:</b> Planning, card drawing, Hidden setups.\n` +
        `🟠 <b>Body:</b> Brute force, heavy Might units, direct combat.\n` +
        `🟣 <b>Chaos:</b> Card filtering, hand discard synergies, tempo.\n` +
        `🟡 <b>Order:</b> Token creation, board building, sacrificing for value.\n\n` +
        `📱 Use the Card Explorer to filter by domain!`;

      return ctx.replyWithHTML(domainsInfo);
    });

    // Command: Search
    bot.command('search', async (ctx) => {
      const query = ctx.payload ? ctx.payload.trim().toLowerCase() : '';
      if (!query) {
        return ctx.replyWithHTML('⚠️ Please provide a search term, e.g. <code>/search Jinx</code> or <code>/search Common</code>');
      }

      const results = cards.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.ability.toLowerCase().includes(query) ||
        c.domain.toLowerCase().includes(query) ||
        c.type.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query)
      );

      if (results.length === 0) {
        return ctx.replyWithHTML(`🔍 No cards found for "<b>${ctx.payload}</b>". Try another search!`);
      }

      if (results.length === 1) {
        return sendCardReply(ctx, results[0]);
      }

      // If multiple, list first 10
      let response = `🔍 Found <b>${results.length}</b> matches for "<b>${ctx.payload}</b>":\n\n`;
      const buttons = results.slice(0, 8).map(c => [
        Markup.button.callback(c.name, `card:${c.id}`)
      ]);

      results.slice(0, 8).forEach(c => {
        response += `• <b>${c.name}</b> (${c.id}) - <i>${c.domain} ${c.type}</i>\n`;
      });

      if (results.length > 8) {
        response += `\n<i>...and ${results.length - 8} more matches. Use more specific letters or check the Mini App!</i>`;
      }

      return ctx.replyWithHTML(response, Markup.inlineKeyboard(buttons));
    });

    // Command: Price – live TCG Marketplace lookup
    bot.command('price', async (ctx) => {
      const query = ctx.payload ? ctx.payload.trim() : '';
      if (!query) {
        return ctx.replyWithHTML(
          '💰 <b>Usage:</b> <code>/price &lt;card name&gt;</code>\n\n' +
          'Examples:\n' +
          '• <code>/price Sona</code>\n' +
          '• <code>/price Public Execution</code>'
        );
      }
      await sendTCGPriceReply(ctx, query);
    });

    // Handle Live Price callback query
    bot.action(/^tcgprice:(.+)$/, async (ctx) => {
      const cardName = ctx.match[1];
      ctx.answerCbQuery().catch(() => {});
      await sendTCGPriceReply(ctx, cardName);
    });

    // Handle Callback Queries (when card buttons are clicked)
    bot.action(/^card:(.+)$/, async (ctx) => {
      const cardId = ctx.match[1];
      const card = cards.find(c => c.id === cardId);
      if (card) {
        ctx.answerCbQuery().catch(err => console.warn('⚠️ Callback query answer failed:', err.message));
        try {
          await sendCardReply(ctx, card);
        } catch (err) {
          console.error('⚠️ Failed to send card reply on callback:', err.message);
        }
        return;
      }
      return ctx.answerCbQuery('Card not found.').catch(err => console.warn('⚠️ Callback query answer failed:', err.message));
    });

    // Handle Inline Queries (typing @botname in chat)
    bot.on('inline_query', async (ctx) => {
      const query = ctx.inlineQuery.query.trim().toLowerCase();
      
      // Filter cards
      const matches = cards.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.domain.toLowerCase().includes(query) ||
        c.type.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query)
      ).slice(0, 15);

      const results = matches.map(c => ({
        type: 'article',
        id: c.id,
        title: c.name,
        description: `${c.domain} | ${c.type} | Energy: ${c.energyCost}`,
        input_message_content: {
          message_text: formatCardDetails(c),
          parse_mode: 'HTML'
        },
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 View in Database', url: process.env.WEB_APP_URL || `https://t.me/your_bot_username/card_explorer` }]
          ]
        }
      }));

      return ctx.answerInlineQuery(results).catch(err => console.warn('⚠️ Inline query answer failed:', err.message));
    });

    // Standard message handler (group brackets & private chat direct search)
    bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

      const queries = [];
      let match;

      // 1. Check for double braces syntax: {{Card Name}}
      const braceRegex = /\{\{(.*?)\}\}/g;
      while ((match = braceRegex.exec(text)) !== null) {
        if (match[1].trim()) {
          queries.push(match[1].trim().toLowerCase());
        }
      }

      // 2. Check for double brackets syntax: [[Card Name]], [[rb:Card Name]], or [[price:Card Name]]
      const bracketRegex = /\[\[(.*?)\]\]/g;
      while ((match = bracketRegex.exec(text)) !== null) {
        const inner = match[1].trim();
        if (!inner) continue;

        if (inner.toLowerCase().startsWith('price:') || inner.toLowerCase().startsWith('price ')) {
          const priceQuery = inner.replace(/^price:?\s*/i, '').trim();
          if (priceQuery) queries.push('__price__:' + priceQuery);
        } else if (inner.toLowerCase().startsWith('rb:') || inner.toLowerCase().startsWith('rb ')) {
          const cardQuery = inner.replace(/^rb:?\s*/i, '').trim();
          if (cardQuery) queries.push(cardQuery.toLowerCase());
        } else {
          queries.push(inner.toLowerCase());
        }
      }

      // 1. Handle Custom Braces / Prefixed bracket queries (works in groups and DMs)
      if (queries.length > 0) {
        for (const query of queries) {
          if (query.startsWith('__price__:')) {
            const priceQuery = query.slice('__price__:'.length);
            await sendTCGPriceReply(ctx, priceQuery, ctx.message?.message_id);
            continue;
          }

          const matchedCards = findCardsByQuery(query, cards);
          
          if (matchedCards.length === 0) {
            await ctx.replyWithHTML(`🔍 No cards found matching "<b>${query}</b>". Try e.g. <code>{{Jinx}}</code> or <code>[[rb:Jinx]]</code>`);
          } else if (matchedCards.length === 1) {
            await sendCardReply(ctx, matchedCards[0]);
          } else {
            // Multiple matches!
            const limit = 8;
            let response = `🔍 Found <b>${matchedCards.length}</b> matches for "<b>${query}</b>". Select one to see details:\n\n`;
            
            matchedCards.slice(0, limit).forEach(c => {
              response += `• <b>${c.name}</b> (${c.id}) - <i>${c.domain} ${c.type}</i>\n`;
            });
            
            if (matchedCards.length > limit) {
              response += `\n<i>...and ${matchedCards.length - limit} more. Try a more specific query!</i>`;
            }

            const buttons = matchedCards.slice(0, 6).map(c => [
              Markup.button.callback(c.name, `card:${c.id}`)
            ]);

            await ctx.replyWithHTML(response, {
              ...Markup.inlineKeyboard(buttons),
              reply_to_message_id: ctx.message?.message_id
            });
          }
        }
        return;
      }

      // 2. Ignore general group chat conversation (where no brackets are used)
      if (isGroup) {
        return;
      }

      // 3. Private Chat (DMs): Fall back to direct text search (no brackets required)
      const query = text.trim().toLowerCase();
      const results = cards.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.ability.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query)
      );

      if (results.length === 0) {
        const webAppUrl = process.env.WEB_APP_URL;
        const isHttps = webAppUrl && webAppUrl.startsWith('https://');
        
        return ctx.replyWithHTML(
          `🔍 No cards found matching "<b>${ctx.message.text}</b>".\n\n` +
          `Try searching for champions like <i>Jinx</i> or <i>Yasuo</i>.`,
          isHttps ? Markup.inlineKeyboard([[Markup.button.webApp('🌐 Open Card Explorer', webAppUrl)]]) : undefined
        );
      }

      if (results.length === 1) {
        return sendCardReply(ctx, results[0]);
      }

      // Multiple matches
      let response = `🔍 I found <b>${results.length}</b> matches. Select one to see details:\n\n`;
      const buttons = results.slice(0, 6).map(c => [
        Markup.button.callback(c.name, `card:${c.id}`)
      ]);

      return ctx.replyWithHTML(response, Markup.inlineKeyboard(buttons));
    });

    // Launch Telegraf bot
    bot.launch()
      .then(() => console.log('🤖 Telegram Bot started successfully in polling mode.'))
      .catch(err => console.error('❌ Failed to launch Telegram Bot:', err));

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error('❌ Error setting up Telegram Bot:', error);
  }
}

// Start Server
app.listen(port, () => {
  console.log(`🚀 Web server is running at http://localhost:${port}`);
  console.log(`📂 Serving Mini App frontend from the "public" directory.`);
});
