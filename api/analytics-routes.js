'use strict';

const express = require('express');
const geoip = require('geoip-lite');
const { getDb } = require('../backend/analytics-middleware');
const { getRuntimeConfig } = require('../config');

const router = express.Router();

function db() {
  const config = getRuntimeConfig();
  return getDb(config.storage.sqlitePath);
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

function parseUserAgent(ua = '') {
  if (!ua) return 'Unknown';
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'Mobile';
  if (/bot|crawler|spider/i.test(ua)) return 'Bot';
  return 'Desktop';
}

// Client-side beacon: POST /api/analytics/visit
// Called from the browser when the user navigates workspaces
router.post('/visit', (req, res) => {
  const { path: visitPath = '/', workspace = null } = req.body || {};
  const ip = getIp(req);
  const geo = geoip.lookup(ip) || {};
  const ua = parseUserAgent(req.headers['user-agent']);

  const database = db();
  database.prepare(
    'INSERT INTO page_visits (ts, ip, path, country, city, ua, referer) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    Date.now(),
    ip,
    workspace ? `/${workspace}` : visitPath,
    geo.country || null,
    geo.city || null,
    ua,
    req.headers['referer'] || null
  );

  res.status(204).end();
});

// Returns last N days of visit data aggregated for the frontend panel
router.get('/summary', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const database = db();

  const totalVisits = database.prepare(
    'SELECT COUNT(*) AS total FROM page_visits WHERE ts >= ?'
  ).get(since).total;

  const uniqueVisitors = database.prepare(
    'SELECT COUNT(DISTINCT ip) AS total FROM page_visits WHERE ts >= ?'
  ).get(since).total;

  const topPages = database.prepare(`
    SELECT path, COUNT(*) AS visits
    FROM page_visits
    WHERE ts >= ?
    GROUP BY path
    ORDER BY visits DESC
    LIMIT 10
  `).all(since);

  const topCountries = database.prepare(`
    SELECT country, COUNT(*) AS visits
    FROM page_visits
    WHERE ts >= ? AND country IS NOT NULL
    GROUP BY country
    ORDER BY visits DESC
    LIMIT 10
  `).all(since);

  const deviceBreakdown = database.prepare(`
    SELECT ua AS device, COUNT(*) AS visits
    FROM page_visits
    WHERE ts >= ?
    GROUP BY ua
    ORDER BY visits DESC
  `).all(since);

  // Visits per hour-of-day (0-23) aggregated across the period
  const visitsByHour = database.prepare(`
    SELECT CAST(strftime('%H', datetime(ts/1000, 'unixepoch')) AS INTEGER) AS hour,
           COUNT(*) AS visits
    FROM page_visits
    WHERE ts >= ?
    GROUP BY hour
    ORDER BY hour
  `).all(since);

  // Fill missing hours with 0
  const hourMap = Object.fromEntries(visitsByHour.map((r) => [r.hour, r.visits]));
  const visitsByHourFull = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    visits: hourMap[h] ?? 0,
  }));

  // Daily visits for sparkline
  const visitsByDay = database.prepare(`
    SELECT DATE(datetime(ts/1000, 'unixepoch')) AS day,
           COUNT(*) AS visits
    FROM page_visits
    WHERE ts >= ?
    GROUP BY day
    ORDER BY day
  `).all(since);

  res.json({
    period_days: days,
    total_visits: totalVisits,
    unique_visitors: uniqueVisitors,
    top_pages: topPages,
    top_countries: topCountries,
    device_breakdown: deviceBreakdown,
    visits_by_hour: visitsByHourFull,
    visits_by_day: visitsByDay,
  });
});

module.exports = router;
