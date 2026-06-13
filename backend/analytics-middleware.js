'use strict';

const Database = require('better-sqlite3');
const geoip = require('geoip-lite');
const fs = require('fs');
const path = require('path');

let db = null;

function getDb(sqlitePath) {
  if (db) return db;
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  db = new Database(sqlitePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_visits (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      ip         TEXT,
      path       TEXT,
      country    TEXT,
      city       TEXT,
      ua         TEXT,
      referer    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_visits_ts ON page_visits (ts);
  `);
  return db;
}

function parseUserAgent(ua = '') {
  if (!ua) return 'Unknown';
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'Mobile';
  if (/bot|crawler|spider|facebookexternalhit|Twitterbot/i.test(ua)) return 'Bot';
  return 'Desktop';
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

function createAnalyticsMiddleware(sqlitePath) {
  const database = getDb(sqlitePath);
  const insert = database.prepare(
    'INSERT INTO page_visits (ts, ip, path, country, city, ua, referer) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  return function analyticsMiddleware(req, res, next) {
    // Only track page navigation, skip API/asset calls
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/screenshots/') ||
      req.path === '/health' ||
      /\.(js|css|png|jpg|ico|svg|woff|woff2|map)$/.test(req.path)
    ) {
      return next();
    }

    const ip = getIp(req);
    const geo = geoip.lookup(ip) || {};
    const ua = parseUserAgent(req.headers['user-agent']);

    insert.run(
      Date.now(),
      ip,
      req.path || '/',
      geo.country || null,
      geo.city || null,
      ua,
      req.headers['referer'] || null
    );

    next();
  };
}

module.exports = { createAnalyticsMiddleware, getDb };
