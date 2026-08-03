/**
 * TCG Marketplace API Client – Riftbound (Category 15)
 * API: https://thetcgmarketplace.com:3501
 * CDN: https://thetcgmarketplace.com:3500
 */
import https from 'https';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_HOST = 'thetcgmarketplace.com';
const BASE_PORT = 3501;
const RIFTBOUND_CATEGORY = 15;

let authToken = process.env.TCG_AUTH_TOKEN || '';
let refreshToken = process.env.TCG_REFRESH_TOKEN || '';

function request(pathStr, method = 'GET', body = null, isRetry = false) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Origin': 'https://www.thetcgmarketplace.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (b) headers['Content-Length'] = Buffer.byteLength(b);
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

    const req = https.request(
      { hostname: BASE_HOST, port: BASE_PORT, path: pathStr, method, headers, rejectUnauthorized: false },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', async () => {
          try {
            const parsed = JSON.parse(data);
            if (!isRetry && (parsed.status === 403 || (parsed.message && parsed.message.includes('Session expired')))) {
              console.log('[tcgMarketplace] Session expired. Attempting token refresh...');
              const refreshed = await refreshAuthToken();
              if (refreshed) {
                console.log('[tcgMarketplace] Token refreshed. Retrying request...');
                try {
                  const retryRes = await request(pathStr, method, body, true);
                  resolve(retryRes);
                  return;
                } catch (retryErr) {
                  reject(retryErr);
                  return;
                }
              } else {
                console.error('[tcgMarketplace] Token refresh failed.');
              }
            }
            resolve(parsed);
          }
          catch (e) { reject(new Error('Invalid JSON: ' + data.slice(0, 100))); }
        });
      }
    );
    req.on('error', reject);
    if (b) req.write(b);
    req.end();
  });
}

/** Update auth token at runtime (e.g. after refresh) */
export function setAuthToken(token) {
  authToken = token;
}

export async function refreshAuthToken() {
  return new Promise((resolve) => {
    const opts = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path: '/refresh',
      method: 'GET',
      headers: {
        'Authorization': authToken,
        'refresh': refreshToken,
        'Origin': 'https://www.thetcgmarketplace.com',
        'User-Agent': 'Mozilla/5.0',
      },
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.accessToken) {
            authToken = parsed.accessToken;
            try {
              const envPath = path.join(__dirname, '..', '.env');
              let envContent = fs.readFileSync(envPath, 'utf8');
              envContent = envContent.replace(/TCG_AUTH_TOKEN=.*/, `TCG_AUTH_TOKEN=${authToken}`);
              fs.writeFileSync(envPath, envContent, 'utf8');
            } catch (envErr) {
              console.warn('Could not save new token to .env:', envErr.message);
            }
            resolve(true);
            return;
          }
        } catch (e) {}
        resolve(false);
      });
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

export async function searchTCGCards(name) {
  const [allRes, listingsRes] = await Promise.all([
    request('/product/advancedfilter', 'POST', {
      category_id: String(RIFTBOUND_CATEGORY),
      name,
      available_only: 0,
      page: 1,
      limit: 200,
    }),
    request('/buy/newFromBuyerFilter', 'POST', {
      category_id: String(RIFTBOUND_CATEGORY),
      name,
    }),
  ]);

  const all = (allRes.status === 200 && allRes.data?.data) ? allRes.data.data : [];
  const withListings = (listingsRes.status === 200 && listingsRes.data?.data) ? listingsRes.data.data : [];

  all.sort((a, b) => b.id - a.id);

  const listingIds = new Set(withListings.map(c => c.id));
  return {
    all,
    withListings,
    listingIds,
    merged: [
      ...all.filter(c => listingIds.has(c.id)),
      ...all.filter(c => !listingIds.has(c.id)),
    ],
  };
}

export async function getCardDetails(productId) {
  const res = await request('/product/single/' + productId);
  if (res.status !== 200) return null;
  return res.data?.data?.[0] || res.data?.data || null;
}

export async function getBuyOrders(productId) {
  const res = await request('/buy/listed_item_filter', 'POST', { product_id: productId });
  if (res.status !== 200) return [];
  return res.data?.data || [];
}

export async function getSellListings(productId) {
  const res = await request('/product/listed_item_filter', 'POST', { product_id: productId });
  if (res.status !== 200) return [];
  return res.data?.data || [];
}

export const getListings = getBuyOrders;

export async function getSalesHistory(productId) {
  const res = await request('/product/salesChart/' + productId);
  if (res.status !== 200) return [];
  return res.data?.data || [];
}

export async function getLatestCards() {
  const res = await request('/product/latest-cards/' + RIFTBOUND_CATEGORY);
  if (res.status !== 200) return [];
  return res.data?.data || [];
}

export async function getNewBuyListings() {
  const res = await request('/buy/main/newFromBuyer/' + RIFTBOUND_CATEGORY);
  if (res.status !== 200) return [];
  return res.data?.data || [];
}

export function getImageUrl(rawUrl) {
  return rawUrl ? rawUrl.replace(/&amp;/g, '&') : null;
}

export function fmtPrice(p) {
  return p != null && p !== '' ? `SGD $${Number(p).toFixed(2)}` : 'N/A';
}

export function fmtCondition(c) {
  return { NM: 'Near Mint', LP: 'Lightly Played', MP: 'Mod. Played', HP: 'Heavily Played', DMG: 'Damaged' }[c] || c || '?';
}
