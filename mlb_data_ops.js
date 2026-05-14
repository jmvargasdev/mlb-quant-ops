const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { getOperationalDate } = require('./mlb_ops/scripts/lib/operational-date');

const DATE = process.env.MLB_DATE || getOperationalDate();
const YEAR = DATE.slice(0, 4);
const ROOT = process.cwd();
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-');
const OPS_ROOT = path.join(ROOT, 'mlb_ops');
const RAW_DIR = path.join(OPS_ROOT, 'raw');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const SCREENSHOTS_DIR = path.join(OPS_ROOT, 'screenshots');
const LOGS_DIR = path.join(OPS_ROOT, 'logs');
const HISTORICAL_DIR = path.join(OPS_ROOT, 'historical');
const SCRIPTS_DIR = path.join(OPS_ROOT, 'scripts');
const RAW_RUN_DIR = path.join(RAW_DIR, DATE, RUN_TS);
const SCREENSHOT_RUN_DIR = path.join(SCREENSHOTS_DIR, DATE);
const EXTRACTION_LOG_PATH = path.join(LOGS_DIR, 'extraction_log.txt');
const SOURCE_HEALTH_HISTORY_PATH = path.join(LOGS_DIR, 'source_health_history.jsonl');

const SOURCE_VOLUME_THRESHOLDS = {
  'MLB Stats API':    { min_rows: 1 },
  'Baseball Savant': { min_rows: 5 },
  'Rotowire':        { min_rows: 5 },
  'Covers':          { min_rows: 1 },
  'Open-Meteo':      { min_rows: 1 },
};

const TEAM_ABBR_FIXES = {
  ARI: 'AZ',
  ATH: 'ATH',
  AZ: 'AZ',
  CHW: 'CWS',
  CWS: 'CWS',
  KC: 'KC',
  KCR: 'KC',
  SD: 'SD',
  SDP: 'SD',
  SF: 'SF',
  SFG: 'SF',
  TB: 'TB',
  TBR: 'TB',
  WAS: 'WSH',
  WSH: 'WSH',
  WSN: 'WSH',
};

const state = {
  teams: null,
  teamById: new Map(),
  teamByAbbr: new Map(),
  playerSearchCache: new Map(),
  playerStatsCache: new Map(),
  teamStatsCache: new Map(),
  teamRecentGamesCache: new Map(),
  bullpenCache: new Map(),
  venueCache: new Map(),
  sourceHealth: new Map(),
  logLines: [],
};

const VENUE_COORDS = {
  'Angel Stadium': { latitude: 33.8003, longitude: -117.8827 },
  'Busch Stadium': { latitude: 38.6226, longitude: -90.1928 },
  'Chase Field': { latitude: 33.4453, longitude: -112.0667 },
  'Citi Field': { latitude: 40.7571, longitude: -73.8458 },
  'Citizens Bank Park': { latitude: 39.9057, longitude: -75.1665 },
  'Comerica Park': { latitude: 42.339, longitude: -83.0485 },
  'Coors Field': { latitude: 39.7559, longitude: -104.9942 },
  'Daikin Park': { latitude: 29.7573, longitude: -95.3555 },
  'Dodger Stadium': { latitude: 34.0739, longitude: -118.24 },
  'Fenway Park': { latitude: 42.3467, longitude: -71.0972 },
  'George M. Steinbrenner Field': { latitude: 27.9801, longitude: -82.5077 },
  'Globe Life Field': { latitude: 32.7473, longitude: -97.0847 },
  'Great American Ball Park': { latitude: 39.0979, longitude: -84.5082 },
  'Guaranteed Rate Field': { latitude: 41.83, longitude: -87.6338 },
  'Kauffman Stadium': { latitude: 39.0517, longitude: -94.4803 },
  'loanDepot park': { latitude: 25.7781, longitude: -80.2197 },
  'Nationals Park': { latitude: 38.873, longitude: -77.0074 },
  'Oracle Park': { latitude: 37.7786, longitude: -122.3893 },
  'Oriole Park at Camden Yards': { latitude: 39.2838, longitude: -76.6217 },
  'Petco Park': { latitude: 32.7073, longitude: -117.1573 },
  'PNC Park': { latitude: 40.4469, longitude: -80.0057 },
  'Progressive Field': { latitude: 41.4962, longitude: -81.6852 },
  'Rate Field': { latitude: 41.83, longitude: -87.6338 },
  'Rogers Centre': { latitude: 43.6414, longitude: -79.3894 },
  'Sutter Health Park': { latitude: 38.5806, longitude: -121.5138 },
  'Target Field': { latitude: 44.9817, longitude: -93.2776 },
  'T-Mobile Park': { latitude: 47.5914, longitude: -122.3325 },
  'Truist Park': { latitude: 33.8908, longitude: -84.4677 },
  'Wrigley Field': { latitude: 41.9484, longitude: -87.6553 },
  'Yankee Stadium': { latitude: 40.8296, longitude: -73.9262 },
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendLog(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  state.logLines.push(stamped);
  console.log(stamped);
}

function recordSourceEvent(source, status, detail, extra = {}) {
  if (!state.sourceHealth.has(source)) {
    state.sourceHealth.set(source, { source, status: 'unknown', successes: 0, failures: 0, empty: 0, rows_last_run: null, events: [] });
  }
  const row = state.sourceHealth.get(source);
  const rows = extra.rows ?? null;
  const threshold = SOURCE_VOLUME_THRESHOLDS[source];
  const isEmpty = status === 'ok' && threshold && rows !== null && rows < threshold.min_rows;

  row.rows_last_run = rows;
  if (status === 'failed') {
    row.status = 'failed';
    row.failures += 1;
  } else if (isEmpty) {
    row.status = 'ok_empty';
    row.empty += 1;
  } else {
    row.status = 'ok';
    row.successes += 1;
  }
  row.events.push({ at: new Date().toISOString(), status: row.status, detail, rows, ...extra });
  appendLog(`${source} | ${row.status.toUpperCase()} | ${detail}`);
}

function persistSourceHealthHistory() {
  ensureDir(LOGS_DIR);
  const entry = {
    date: DATE,
    run_at: new Date().toISOString(),
    sources: [...state.sourceHealth.values()].map((row) => ({
      source: row.source,
      status: row.status,
      rows: row.rows_last_run,
      populated: row.status === 'ok',
    })),
  };
  fs.appendFileSync(SOURCE_HEALTH_HISTORY_PATH, `${JSON.stringify(entry)}\n`);
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function makeNonOverwritingPath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  let i = 2;
  while (true) {
    const candidate = `${base}_run-${String(i).padStart(2, '0')}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
    i += 1;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36',
          accept: '*/*',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(600 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function fetchJson(url, retries = 2) {
  const text = await fetchText(url, retries);
  return JSON.parse(text);
}

function normalizeName(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeTeamAbbr(abbr) {
  return TEAM_ABBR_FIXES[abbr] || abbr;
}

function parseStatNumber(value) {
  if (value === undefined || value === null || value === '' || value === '.---' || value === '-.--' || value === '--' || value === '–') {
    return null;
  }
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function inningsToDecimal(value) {
  if (!value) return null;
  const [whole, partial = '0'] = String(value).split('.');
  const base = Number(whole);
  const rem = Number(partial);
  if (!Number.isFinite(base) || !Number.isFinite(rem)) return null;
  if (rem === 1) return base + 1 / 3;
  if (rem === 2) return base + 2 / 3;
  return base;
}

function round(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function average(values, digits = 3) {
  const nums = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!nums.length) return null;
  return round(nums.reduce((sum, v) => sum + v, 0) / nums.length, digits);
}

function sum(values, digits = 3) {
  const nums = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!nums.length) return null;
  return round(nums.reduce((acc, v) => acc + v, 0), digits);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

function moneylineToImpliedProbability(moneyline) {
  if (moneyline === null || moneyline === undefined) return null;
  if (moneyline > 0) return round(100 / (moneyline + 100), 4);
  if (moneyline < 0) return round((-moneyline) / ((-moneyline) + 100), 4);
  return null;
}

function decimalToAmerican(decimalOdd) {
  if (!decimalOdd || decimalOdd <= 1) return null;
  if (decimalOdd >= 2) return Math.round((decimalOdd - 1) * 100);
  return -Math.round(100 / (decimalOdd - 1));
}

function americanToDecimal(american) {
  const n = Number(american);
  if (!n || Number.isNaN(n)) return null;
  return n > 0 ? round((n / 100) + 1, 4) : round((100 / Math.abs(n)) + 1, 4);
}

function parseMoneyline(value) {
  if (!value) return null;
  const match = String(value).match(/([+-]\d+)/);
  return match ? Number(match[1]) : null;
}

function parseTotalRuns(value) {
  if (!value) return null;
  const match = String(value).match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function formatPercent(probability) {
  if (probability === null || probability === undefined) return 'n/a';
  return `${round(probability * 100, 1)}%`;
}

function formatNullable(value, fallback = 'n/a') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function isoFromStats(stat) {
  const slg = parseStatNumber(stat?.slg);
  const avg = parseStatNumber(stat?.avg);
  if (slg === null || avg === null) return null;
  return round(slg - avg, 3);
}

async function loadTeams() {
  if (state.teams) return state.teams;
  const data = await fetchJson('https://statsapi.mlb.com/api/v1/teams?sportId=1');
  state.teams = data.teams || [];
  for (const team of state.teams) {
    state.teamById.set(team.id, team);
    if (team.abbreviation) state.teamByAbbr.set(normalizeTeamAbbr(team.abbreviation), team);
    if (team.teamCode) state.teamByAbbr.set(normalizeTeamAbbr(team.teamCode.toUpperCase()), team);
    if (team.fileCode) state.teamByAbbr.set(normalizeTeamAbbr(team.fileCode.toUpperCase()), team);
  }
  return state.teams;
}

function getTeamFromAbbr(abbr) {
  return state.teamByAbbr.get(normalizeTeamAbbr(abbr)) || null;
}

async function searchPlayerByName(name, teamId = null) {
  const cacheKey = `${name}::${teamId || 'any'}`;
  if (state.playerSearchCache.has(cacheKey)) {
    return state.playerSearchCache.get(cacheKey);
  }

  const data = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}`);
  const normalized = normalizeName(name);
  const allCandidates = data.people || [];
  const exactMatches = allCandidates.filter((person) => normalizeName(person.fullName) === normalized);
  const teamAwareMatches = teamId
    ? exactMatches.filter((person) => !person.currentTeam || person.currentTeam.id === teamId || person.currentTeam.link?.endsWith(`/${teamId}`))
    : exactMatches;

  let best =
    teamAwareMatches[0] ||
    exactMatches[0] ||
    (teamId
      ? allCandidates.find((person) => person.currentTeam?.id === teamId || person.currentTeam?.link?.endsWith(`/${teamId}`))
      : null) ||
    allCandidates[0] ||
    null;

  if (!best && name.includes('. ')) {
    best = (data.people || [])[0] || null;
  }

  state.playerSearchCache.set(cacheKey, best);
  return best;
}

async function getPlayerStats(playerId, group, stats = 'season', extraQuery = '') {
  const cacheKey = `${playerId}::${group}::${stats}::${extraQuery}`;
  if (state.playerStatsCache.has(cacheKey)) {
    return state.playerStatsCache.get(cacheKey);
  }

  const query = [`stats=${stats}`, `group=${group}`, `season=${YEAR}`];
  if (extraQuery) query.push(extraQuery);
  const url = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?${query.join('&')}`;
  const data = await fetchJson(url);
  state.playerStatsCache.set(cacheKey, data);
  return data;
}

async function getTeamStats(teamId) {
  if (state.teamStatsCache.has(teamId)) {
    return state.teamStatsCache.get(teamId);
  }

  const [
    hittingSeason,
    pitchingSeason,
    hittingSplits,
    pitchingSplits,
    bullpenSplit,
    roster,
  ] = await Promise.all([
    fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=hitting&season=${YEAR}`),
    fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=pitching&season=${YEAR}`),
    fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${YEAR}&sitCodes=h,a`),
    fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=pitching&season=${YEAR}&sitCodes=h,a`),
    fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=pitching&season=${YEAR}&sitCodes=rp`),
    fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&hydrate=person(stats(type=[season],group=[pitching],season=${YEAR}))`),
  ]);

  const payload = {
    hittingSeason: hittingSeason.stats?.[0]?.splits?.[0]?.stat || {},
    pitchingSeason: pitchingSeason.stats?.[0]?.splits?.[0]?.stat || {},
    hittingSplits: hittingSplits.stats?.[0]?.splits || [],
    pitchingSplits: pitchingSplits.stats?.[0]?.splits || [],
    bullpen: bullpenSplit.stats?.[0]?.splits?.[0]?.stat || {},
    roster: roster.roster || [],
  };

  state.teamStatsCache.set(teamId, payload);
  return payload;
}

async function getRecentGames(teamId) {
  if (state.teamRecentGamesCache.has(teamId)) {
    return state.teamRecentGamesCache.get(teamId);
  }

  const startDate = `${YEAR}-03-01`;
  const endDate = DATE;
  const data = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?teamId=${teamId}&sportId=1&startDate=${startDate}&endDate=${endDate}`);
  const games = (data.dates || [])
    .flatMap((date) => date.games || [])
    .filter((game) => game.status?.codedGameState === 'F')
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

  state.teamRecentGamesCache.set(teamId, games);
  return games;
}

async function getVenue(venueId) {
  if (state.venueCache.has(venueId)) {
    return state.venueCache.get(venueId);
  }
  const data = await fetchJson(`https://statsapi.mlb.com/api/v1/venues/${venueId}`);
  const venue = data.venues?.[0] || null;
  state.venueCache.set(venueId, venue);
  return venue;
}

async function getBullpenSummary(teamId) {
  if (state.bullpenCache.has(teamId)) {
    return state.bullpenCache.get(teamId);
  }

  const [recentGames, teamStats] = await Promise.all([getRecentGames(teamId), getTeamStats(teamId)]);
  const last3 = recentGames.slice(-3).reverse();
  const usage = [];
  const pitcherUsage = new Map();

  for (const game of last3) {
    const boxscore = await fetchJson(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`);
    const side = game.teams.home.team.id === teamId ? 'home' : 'away';
    const teamBox = boxscore.teams?.[side];
    const pitcherIds = teamBox?.pitchers || [];
    const bullpenIds = pitcherIds.slice(1);
    for (const pitcherId of bullpenIds) {
      const player = teamBox.players?.[`ID${pitcherId}`];
      if (!player) continue;
      const pitches = parseStatNumber(player.stats?.pitching?.numberOfPitches);
      const appearance = {
        date: game.officialDate,
        gamePk: game.gamePk,
        name: player.person?.fullName || player.person?.fullName,
        pitcher_id: pitcherId,
        pitches,
        outs: parseStatNumber(player.stats?.pitching?.outs),
      };
      usage.push(appearance);
      if (!pitcherUsage.has(pitcherId)) {
        pitcherUsage.set(pitcherId, { name: appearance.name, appearances: 0, pitches: 0, days: [] });
      }
      const item = pitcherUsage.get(pitcherId);
      item.appearances += 1;
      item.pitches += pitches || 0;
      item.days.push(game.officialDate);
    }
  }

  const closerCandidate = teamStats.roster
    .filter((entry) => entry.position?.type === 'Pitcher')
    .map((entry) => ({
      id: entry.person?.id,
      name: entry.person?.fullName,
      saves: parseStatNumber(entry.person?.stats?.[0]?.splits?.[0]?.stat?.saves) || 0,
      era: parseStatNumber(entry.person?.stats?.[0]?.splits?.[0]?.stat?.era),
    }))
    .sort((a, b) => b.saves - a.saves)[0] || null;

  let closerAvailability = null;
  if (closerCandidate) {
    const usageData = pitcherUsage.get(closerCandidate.id);
    if (!usageData) {
      closerAvailability = { status: 'available', reason: 'No bullpen appearances in the last 3 completed games.' };
    } else {
      const appearances = usageData.appearances;
      const pitches = usageData.pitches;
      if (appearances >= 3 || pitches >= 50) {
        closerAvailability = { status: 'high_risk', reason: `${usageData.name} worked ${appearances} times for ${pitches} pitches across the last 3 completed games.` };
      } else if (appearances === 2 || pitches >= 30) {
        closerAvailability = { status: 'limited', reason: `${usageData.name} has recent leverage usage: ${appearances} appearances and ${pitches} pitches in the last 3 completed games.` };
      } else {
        closerAvailability = { status: 'available', reason: `${usageData.name} has manageable recent usage: ${appearances} appearance(s), ${pitches} pitches.` };
      }
    }
  }

  const fatigueScore = [...pitcherUsage.values()].reduce((acc, entry) => acc + entry.pitches, 0);
  const fatigueIndicator = fatigueScore >= 120 ? 'heavy' : fatigueScore >= 80 ? 'moderate' : 'light';

  const result = {
    bullpen_era: parseStatNumber(teamStats.bullpen.era),
    bullpen_whip: parseStatNumber(teamStats.bullpen.whip),
    usage_last_3_games: usage,
    fatigue_indicator: fatigueIndicator,
    closer: closerCandidate,
    closer_availability: closerAvailability,
  };

  state.bullpenCache.set(teamId, result);
  return result;
}

async function getWeatherForVenue(venue, gameDateUtc) {
  const fallbackCoords = VENUE_COORDS[venue?.name] || null;
  const latitude = venue?.location?.defaultCoordinates?.latitude || fallbackCoords?.latitude;
  const longitude = venue?.location?.defaultCoordinates?.longitude || fallbackCoords?.longitude;
  if (!latitude || !longitude) return null;

  const start = DATE;
  const end = DATE;
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${latitude}`,
    `&longitude=${longitude}`,
    '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m',
    '&timezone=auto',
    `&start_date=${start}`,
    `&end_date=${end}`,
  ].join('');

  try {
    const data = await fetchJson(url);
    const hourly = data.hourly || {};
    const times = hourly.time || [];
    if (!times.length) return null;

    const target = new Date(gameDateUtc);
    const timezone = data.timezone || 'UTC';

    let bestIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i += 1) {
      const candidate = new Date(`${times[i]}${times[i].includes('T') ? '' : 'T00:00:00'}`);
      const delta = Math.abs(candidate.getTime() - target.getTime());
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }

    return {
      source: 'open-meteo',
      timezone,
      latitude,
      longitude,
      temperature_f: hourly.temperature_2m?.[bestIndex] !== undefined ? round((hourly.temperature_2m[bestIndex] * 9) / 5 + 32, 1) : null,
      humidity_pct: parseStatNumber(hourly.relative_humidity_2m?.[bestIndex]),
      rain_probability_pct: parseStatNumber(hourly.precipitation_probability?.[bestIndex]),
      wind_speed_mph: hourly.wind_speed_10m?.[bestIndex] !== undefined ? round(hourly.wind_speed_10m[bestIndex] * 0.621371, 1) : null,
    };
  } catch (error) {
    recordSourceEvent('Open-Meteo', 'failed', error.message, { venue: venue?.name });
    return { source: 'open-meteo', error: error.message };
  }
}

async function scrapeParkFactors(browser) {
  const page = await browser.newPage();
  await page.goto(`https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?year=${YEAR}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(SCREENSHOT_RUN_DIR, 'savant_park_factors.png'), fullPage: true });
  const tableText = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].sort((a, b) => b.innerText.length - a.innerText.length);
    return tables[0]?.innerText || '';
  });
  await page.close();

  const lines = tableText.split(/\r?\n/).filter(Boolean);
  const headerLine = lines.find((line) => line.startsWith('Rk.\tTeam\tVenue\tYear\tPark Factor'));
  if (!headerLine) return new Map();
  const header = headerLine.split('\t');
  const rows = lines
    .slice(lines.indexOf(headerLine) + 1)
    .map((line) => line.split('\t'))
    .filter((cells) => cells.length >= header.length)
    .map((cells) => {
      const row = {};
      header.forEach((key, index) => {
        row[key] = cells[index];
      });
      return row;
    });

  return new Map(rows.map((row) => [normalizeName(row.Team), row]));
}

async function loadSavantTables() {
  const [
    expectedPitchersCsv,
    expectedBattersCsv,
    statcastPitchersCsv,
    statcastBattersCsv,
  ] = await Promise.all([
    fetchText(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${YEAR}&csv=true`),
    fetchText(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${YEAR}&csv=true`),
    fetchText(`https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${YEAR}&csv=true`),
    fetchText(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${YEAR}&csv=true`),
  ]);

  const expectedPitchers = new Map(parseCsv(expectedPitchersCsv).map((row) => [String(row.player_id), row]));
  const expectedBatters = new Map(parseCsv(expectedBattersCsv).map((row) => [String(row.player_id), row]));
  const statcastPitchers = new Map(parseCsv(statcastPitchersCsv).map((row) => [String(row.player_id), row]));
  const statcastBatters = new Map(parseCsv(statcastBattersCsv).map((row) => [String(row.player_id), row]));

  return { expectedPitchers, expectedBatters, statcastPitchers, statcastBatters };
}

async function scrapeRotowire(browser) {
  const page = await browser.newPage();
  await page.goto('https://www.rotowire.com/baseball/daily-lineups.php', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(SCREENSHOT_RUN_DIR, 'rotowire_lineups.png'), fullPage: true });

  const games = await page.evaluate(() => {
    const textOf = (el, selector) => el ? el.querySelector(selector)?.textContent?.trim() || null : null;
    const parsePlayers = (list) => list ? [...list.querySelectorAll('.lineup__player')].map((li, index) => ({
      order: index + 1,
      pos: li.querySelector('.lineup__pos')?.textContent?.trim() || null,
      name: li.querySelector('a')?.getAttribute('title') || li.querySelector('a')?.textContent?.trim() || null,
      bats: li.querySelector('.lineup__bats')?.textContent?.trim() || null,
    })) : [];

    return [...document.querySelectorAll('.lineup.is-mlb')].map((card) => {
      const awayList = card.querySelector('.lineup__list.is-visit');
      const homeList = card.querySelector('.lineup__list.is-home');
      const oddsItems = [...card.querySelectorAll('.lineup__odds-item')].map((item) => item.textContent.replace(/\s+/g, ' ').trim());
      return {
        time_et: textOf(card, '.lineup__time'),
        away_abbr: textOf(card, '.lineup__team.is-visit .lineup__abbr'),
        home_abbr: textOf(card, '.lineup__team.is-home .lineup__abbr'),
        away_name: textOf(card, '.lineup__mteam.is-visit'),
        home_name: textOf(card, '.lineup__mteam.is-home'),
        away_starter: {
          name: awayList?.querySelector('.lineup__player-highlight-name a')?.textContent?.trim() || null,
          throws: awayList?.querySelector('.lineup__throws')?.textContent?.trim() || null,
          summary: awayList?.querySelector('.lineup__player-highlight-stats')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        },
        home_starter: {
          name: homeList?.querySelector('.lineup__player-highlight-name a')?.textContent?.trim() || null,
          throws: homeList?.querySelector('.lineup__throws')?.textContent?.trim() || null,
          summary: homeList?.querySelector('.lineup__player-highlight-stats')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        },
        away_lineup_status: textOf(awayList, '.lineup__status'),
        home_lineup_status: textOf(homeList, '.lineup__status'),
        away_lineup: awayList ? parsePlayers(awayList) : [],
        home_lineup: homeList ? parsePlayers(homeList) : [],
        umpire: textOf(card, '.lineup__umpire'),
        weather: textOf(card, '.lineup__weather-text'),
        weather_icon: card.querySelector('.lineup__weather-icon')?.getAttribute('alt') || null,
        odds_items: oddsItems,
      };
    }).filter((game) => game.away_abbr && game.home_abbr);
  });

  await page.close();
  return games;
}

async function scrapeCoversOdds(browser) {
  const page = await browser.newPage();
  await page.goto('https://www.covers.com/sport/baseball/mlb/odds', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(SCREENSHOT_RUN_DIR, 'covers_odds.png'), fullPage: true });
  const body = await page.locator('body').innerText();
  await page.close();

  const blocks = body.split(/TODAY,\s+/).slice(1);
  const games = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const abbrs = lines.filter((line) => /^[A-Z]{2,4}$/.test(line));
    // Page renders American odds (+153 / -171). First pair = opening line, second pair = first current book.
    const american = lines.filter((line) => /^[+-]\d+$/.test(line)).map(Number);
    if (abbrs.length < 2 || american.length < 2) continue;
    games.push({
      time_et: lines[0],
      away_abbr: normalizeTeamAbbr(abbrs[0]),
      home_abbr: normalizeTeamAbbr(abbrs[1]),
      open_decimal_away: americanToDecimal(american[0]),
      open_decimal_home: americanToDecimal(american[1]),
      current_decimal_away: americanToDecimal(american[2] ?? american[0]),
      current_decimal_home: americanToDecimal(american[3] ?? american[1]),
    });
  }
  return games;
}

function parseRotowireOdds(items) {
  const result = { moneyline: null, total: null, raw: items };
  for (const item of items || []) {
    if (item.startsWith('LINE')) {
      const moneylineMatch = item.match(/([A-Z]{2,4}\s*[+-]\d+)/);
      result.moneyline = moneylineMatch ? moneylineMatch[1].replace(/\s+/g, ' ').trim() : item.replace(/^LINE\s*/i, '').trim();
    }
    if (item.startsWith('O/U')) {
      const totalMatch = item.match(/(\d+(?:\.\d+)?)\s*Runs/i);
      result.total = totalMatch ? `${totalMatch[1]} Runs` : item.replace(/^O\/U\s*/i, '').trim();
    }
  }
  return result;
}

function buildFormSummary(teamId, teamStats, recentGames) {
  const last10 = recentGames.slice(-10);
  const record = { wins: 0, losses: 0 };
  let runDifferential = 0;

  for (const game of last10) {
    const isHome = game.teams.home.team.id === teamId;
    const teamScore = isHome ? game.teams.home.score : game.teams.away.score;
    const oppScore = isHome ? game.teams.away.score : game.teams.home.score;
    if (teamScore > oppScore) record.wins += 1;
    else record.losses += 1;
    runDifferential += (teamScore - oppScore);
  }

  const homeSplit = teamStats.hittingSplits.find((split) => split.split?.code === 'h')?.stat || null;
  const awaySplit = teamStats.hittingSplits.find((split) => split.split?.code === 'a')?.stat || null;

  return {
    last_10_record: `${record.wins}-${record.losses}`,
    run_differential_last_10: runDifferential,
    offensive_production: {
      runs: parseStatNumber(teamStats.hittingSeason.runs),
      runs_per_game: teamStats.hittingSeason.gamesPlayed ? round((parseStatNumber(teamStats.hittingSeason.runs) || 0) / parseStatNumber(teamStats.hittingSeason.gamesPlayed), 2) : null,
      ops: parseStatNumber(teamStats.hittingSeason.ops),
      obp: parseStatNumber(teamStats.hittingSeason.obp),
      strikeout_rate: teamStats.hittingSeason.plateAppearances ? round((parseStatNumber(teamStats.hittingSeason.strikeOuts) || 0) / parseStatNumber(teamStats.hittingSeason.plateAppearances), 3) : null,
    },
    home_split: homeSplit ? {
      ops: parseStatNumber(homeSplit.ops),
      obp: parseStatNumber(homeSplit.obp),
      runs: parseStatNumber(homeSplit.runs),
    } : null,
    away_split: awaySplit ? {
      ops: parseStatNumber(awaySplit.ops),
      obp: parseStatNumber(awaySplit.obp),
      runs: parseStatNumber(awaySplit.runs),
    } : null,
  };
}

async function buildPitcherProfile(pitcher, teamId, savant) {
  if (!pitcher?.id) return null;
  const [season, recent, splits, gameLog, personData] = await Promise.all([
    getPlayerStats(pitcher.id, 'pitching', 'season'),
    getPlayerStats(pitcher.id, 'pitching', 'lastXGames', 'limit=5'),
    getPlayerStats(pitcher.id, 'pitching', 'statSplits', 'sitCodes=h,a'),
    getPlayerStats(pitcher.id, 'pitching', 'gameLog'),
    fetchJson(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}`).catch(() => ({ people: [] })),
  ]);

  const seasonStat = season.stats?.[0]?.splits?.[0]?.stat || {};
  const recentStat = recent.stats?.[0]?.splits?.[0]?.stat || {};
  const splitRows = splits.stats?.[0]?.splits || [];
  const person = personData.people?.[0] || {};
  const homeSplit = splitRows.find((row) => row.split?.code === 'h')?.stat || null;
  const awaySplit = splitRows.find((row) => row.split?.code === 'a')?.stat || null;
  const starts = (gameLog.stats?.[0]?.splits || []).slice(-5).reverse().map((row) => ({
    date: row.date,
    opponent: row.opponent?.name || null,
    is_home: row.isHome,
    summary: row.stat?.summary || null,
    pitches: parseStatNumber(row.stat?.numberOfPitches),
    innings_pitched: inningsToDecimal(row.stat?.inningsPitched),
    earned_runs: parseStatNumber(row.stat?.earnedRuns),
    strikeouts: parseStatNumber(row.stat?.strikeOuts),
    walks: parseStatNumber(row.stat?.baseOnBalls),
  }));

  const savantExpected = savant.expectedPitchers.get(String(pitcher.id)) || {};
  const savantStatcast = savant.statcastPitchers.get(String(pitcher.id)) || {};

  return {
    pitcher_id: pitcher.id,
    name: pitcher.fullName,
    hand: pitcher.pitchHand?.code || person.pitchHand?.code || pitcher.hand || null,
    team_id: teamId,
    era: parseStatNumber(seasonStat.era),
    whip: parseStatNumber(seasonStat.whip),
    xFIP: null,
    xERA: parseStatNumber(savantExpected.xera),
    xwOBA: parseStatNumber(savantExpected.est_woba),
    hard_hit_pct: parseStatNumber(savantStatcast.ev95percent),
    barrel_pct: parseStatNumber(savantStatcast.brl_percent),
    babip: null,
    lob_pct: null,
    innings_pitched: inningsToDecimal(seasonStat.inningsPitched),
    strikeouts_per_9: parseStatNumber(seasonStat.strikeoutsPer9Inn),
    walks_per_9: parseStatNumber(seasonStat.walksPer9Inn),
    recent_5_aggregate: {
      era: parseStatNumber(recentStat.era),
      whip: parseStatNumber(recentStat.whip),
      pitches: parseStatNumber(recentStat.numberOfPitches),
      innings_pitched: inningsToDecimal(recentStat.inningsPitched),
    },
    recent_pitch_count_avg: average(starts.map((start) => start.pitches), 1),
    last_5_games: starts,
    splits: {
      home: homeSplit ? {
        era: parseStatNumber(homeSplit.era),
        whip: parseStatNumber(homeSplit.whip),
        innings_pitched: inningsToDecimal(homeSplit.inningsPitched),
      } : null,
      away: awaySplit ? {
        era: parseStatNumber(awaySplit.era),
        whip: parseStatNumber(awaySplit.whip),
        innings_pitched: inningsToDecimal(awaySplit.inningsPitched),
      } : null,
    },
    source_notes: {
      xFIP: 'Unavailable from FanGraphs because Cloudflare blocked automated access during this run.',
    },
  };
}

async function buildLineupPlayers(lineup, teamId, savant, opposingPitcherHand = null) {
  const players = [];
  for (const hitter of lineup || []) {
    const search = await searchPlayerByName(hitter.name, teamId);
    const [season, splitStats] = search?.id
      ? await Promise.all([
          getPlayerStats(search.id, 'hitting', 'season'),
          getPlayerStats(search.id, 'hitting', 'statSplits', 'sitCodes=vl,vr'),
        ])
      : [null, null];
    const stat = season?.stats?.[0]?.splits?.[0]?.stat || {};
    const splitRows = splitStats?.stats?.[0]?.splits || [];
    const vsLeft = splitRows.find((row) => row.split?.code === 'vl')?.stat || null;
    const vsRight = splitRows.find((row) => row.split?.code === 'vr')?.stat || null;
    const relevantSplit = opposingPitcherHand === 'L' ? vsLeft : opposingPitcherHand === 'R' ? vsRight : null;
    const expected = search?.id ? savant.expectedBatters.get(String(search.id)) || {} : {};
    const statcast = search?.id ? savant.statcastBatters.get(String(search.id)) || {} : {};

    players.push({
      player_id: search?.id || null,
      name: hitter.name,
      batting_order: hitter.order,
      position: hitter.pos,
      handedness: hitter.bats,
      avg: parseStatNumber(stat.avg),
      obp: parseStatNumber(stat.obp),
      slg: parseStatNumber(stat.slg),
      ops: parseStatNumber(stat.ops),
      iso: isoFromStats(stat),
      wRC_plus: null,
      babip: parseStatNumber(stat.babip),
      xwOBA: parseStatNumber(expected.est_woba),
      hard_hit_pct: parseStatNumber(statcast.ev95percent),
      barrel_pct: parseStatNumber(statcast.brl_percent),
      splits_vs_handedness: {
        facing_hand: opposingPitcherHand,
        relevant_ops: parseStatNumber(relevantSplit?.ops),
        relevant_avg: parseStatNumber(relevantSplit?.avg),
        relevant_obp: parseStatNumber(relevantSplit?.obp),
        vs_left_ops: parseStatNumber(vsLeft?.ops),
        vs_right_ops: parseStatNumber(vsRight?.ops),
      },
    });
  }
  return players;
}

function aggregateLineup(players) {
  return {
    avg_ops: average(players.map((player) => player.ops)),
    avg_obp: average(players.map((player) => player.obp)),
    avg_iso: average(players.map((player) => player.iso)),
    avg_xwoba: average(players.map((player) => player.xwOBA)),
    avg_hard_hit_pct: average(players.map((player) => player.hard_hit_pct)),
    avg_barrel_pct: average(players.map((player) => player.barrel_pct)),
    avg_babip: average(players.map((player) => player.babip)),
    avg_split_ops_vs_opposing_hand: average(players.map((player) => player.splits_vs_handedness?.relevant_ops)),
  };
}

function resolveRotowireGame(rotowireGames, awayAbbr, homeAbbr) {
  return rotowireGames.find((game) => normalizeTeamAbbr(game.away_abbr) === awayAbbr && normalizeTeamAbbr(game.home_abbr) === homeAbbr) || null;
}

function resolveCoversOdds(coversGames, awayAbbr, homeAbbr) {
  return coversGames.find((game) => normalizeTeamAbbr(game.away_abbr) === awayAbbr && normalizeTeamAbbr(game.home_abbr) === homeAbbr) || null;
}

function buildMarketData(rotowireGame, coversGame) {
  const rotowireOdds = parseRotowireOdds(rotowireGame?.odds_items);
  const currentAwayDecimal = coversGame?.current_decimal_away || null;
  const currentHomeDecimal = coversGame?.current_decimal_home || null;

  const currentAwayAmerican = currentAwayDecimal ? decimalToAmerican(currentAwayDecimal) : null;
  const currentHomeAmerican = currentHomeDecimal ? decimalToAmerican(currentHomeDecimal) : null;
  const openingAwayAmerican = coversGame?.open_decimal_away ? decimalToAmerican(coversGame.open_decimal_away) : null;
  const openingHomeAmerican = coversGame?.open_decimal_home ? decimalToAmerican(coversGame.open_decimal_home) : null;

  return {
    moneyline: {
      current: {
        away_decimal: currentAwayDecimal,
        home_decimal: currentHomeDecimal,
        away_american: currentAwayAmerican,
        home_american: currentHomeAmerican,
        away_implied_probability: currentAwayAmerican !== null ? moneylineToImpliedProbability(currentAwayAmerican) : null,
        home_implied_probability: currentHomeAmerican !== null ? moneylineToImpliedProbability(currentHomeAmerican) : null,
      },
      opening: {
        away_decimal: coversGame?.open_decimal_away || null,
        home_decimal: coversGame?.open_decimal_home || null,
        away_american: openingAwayAmerican,
        home_american: openingHomeAmerican,
      },
      rotowire_line: rotowireOdds.moneyline,
    },
    runline: null,
    total: {
      current: parseTotalRuns(rotowireOdds.total),
      display: rotowireOdds.total,
    },
    live_odds: null,
  };
}

function teamDisplay(teamId) {
  const team = state.teamById.get(teamId);
  return team ? team.name : `Team ${teamId}`;
}

function makeGameKey(awayAbbr, homeAbbr) {
  return `${awayAbbr}@${homeAbbr}`;
}

function buildReport(games, meta) {
  const sections = ['# MLB Matchup Intelligence Report', '', `Date: ${DATE}`, ''];
  for (const game of games) {
    const away = game.matchup.away.team;
    const home = game.matchup.home.team;
    const awayStarter = game.starting_pitchers.away;
    const homeStarter = game.starting_pitchers.home;
    const awayLineupAgg = game.lineups.away.aggregate;
    const homeLineupAgg = game.lineups.home.aggregate;

    let pitchingEdge = 'Even.';
    if ((awayStarter?.xERA ?? awayStarter?.era ?? 999) + 0.25 < (homeStarter?.xERA ?? homeStarter?.era ?? 999)) {
      pitchingEdge = `${away} has the cleaner starter profile. ${formatNullable(awayStarter?.name)} carries ${formatNullable(awayStarter?.era)} ERA / ${formatNullable(awayStarter?.whip)} WHIP against ${formatNullable(homeStarter?.era)} / ${formatNullable(homeStarter?.whip)} for ${formatNullable(homeStarter?.name)}.`;
    } else if ((homeStarter?.xERA ?? homeStarter?.era ?? 999) + 0.25 < (awayStarter?.xERA ?? awayStarter?.era ?? 999)) {
      pitchingEdge = `${home} has the cleaner starter profile. ${formatNullable(homeStarter?.name)} carries ${formatNullable(homeStarter?.era)} ERA / ${formatNullable(homeStarter?.whip)} WHIP against ${formatNullable(awayStarter?.era)} / ${formatNullable(awayStarter?.whip)} for ${formatNullable(awayStarter?.name)}.`;
    }

    let bullpenEdge = 'Even.';
    const awayBullpen = game.bullpen.away;
    const homeBullpen = game.bullpen.home;
    if ((awayBullpen?.bullpen_era ?? 999) + 0.25 < (homeBullpen?.bullpen_era ?? 999)) {
      bullpenEdge = `${away} owns the better bullpen ERA (${formatNullable(awayBullpen?.bullpen_era)}) with ${formatNullable(awayBullpen?.fatigue_indicator)} recent load.`;
    } else if ((homeBullpen?.bullpen_era ?? 999) + 0.25 < (awayBullpen?.bullpen_era ?? 999)) {
      bullpenEdge = `${home} owns the better bullpen ERA (${formatNullable(homeBullpen?.bullpen_era)}) with ${formatNullable(homeBullpen?.fatigue_indicator)} recent load.`;
    }

    let offensiveEdge = 'Even.';
    if ((awayLineupAgg.avg_ops ?? 0) > (homeLineupAgg.avg_ops ?? 0) + 0.03) {
      offensiveEdge = `${away} projects better by lineup OPS (${formatNullable(awayLineupAgg.avg_ops)} vs ${formatNullable(homeLineupAgg.avg_ops)}) and xwOBA (${formatNullable(awayLineupAgg.avg_xwoba)} vs ${formatNullable(homeLineupAgg.avg_xwoba)}).`;
    } else if ((homeLineupAgg.avg_ops ?? 0) > (awayLineupAgg.avg_ops ?? 0) + 0.03) {
      offensiveEdge = `${home} projects better by lineup OPS (${formatNullable(homeLineupAgg.avg_ops)} vs ${formatNullable(awayLineupAgg.avg_ops)}) and xwOBA (${formatNullable(homeLineupAgg.avg_xwoba)} vs ${formatNullable(awayLineupAgg.avg_xwoba)}).`;
    }

    const market = game.market.moneyline;
    const marketStructure = [
      `Open: ${away} ${formatNullable(market.opening.away_american)} / ${home} ${formatNullable(market.opening.home_american)}`,
      `Current: ${away} ${formatNullable(market.current.away_american)} (${formatPercent(market.current.away_implied_probability)}) / ${home} ${formatNullable(market.current.home_american)} (${formatPercent(market.current.home_implied_probability)})`,
      `Total: ${formatNullable(game.market.total.current)}`,
    ].join(' | ');

    const riskFactors = [];
    if (game.lineups.away.status && !/confirmed/i.test(game.lineups.away.status)) {
      riskFactors.push(`${away} lineup not confirmed.`);
    }
    if (game.lineups.home.status && !/confirmed/i.test(game.lineups.home.status)) {
      riskFactors.push(`${home} lineup not confirmed.`);
    }
    if (game.weather.combined?.rain_probability_pct !== null && game.weather.combined?.rain_probability_pct >= 35) {
      riskFactors.push(`Rain probability ${game.weather.combined.rain_probability_pct}%.`);
    }
    if (game.bullpen.away.closer_availability?.status === 'high_risk') {
      riskFactors.push(`${away} closer usage is stretched.`);
    }
    if (game.bullpen.home.closer_availability?.status === 'high_risk') {
      riskFactors.push(`${home} closer usage is stretched.`);
    }
    if (!game.starting_pitchers.away?.xFIP || !game.starting_pitchers.home?.xFIP) {
      riskFactors.push('xFIP missing because FanGraphs blocked automation during this run.');
    }

    const notes = [];
    if ((awayStarter?.recent_pitch_count_avg ?? 0) + 7 < (homeStarter?.recent_pitch_count_avg ?? 0)) {
      notes.push(`${home} starter has been stretched deeper recently.`);
    } else if ((homeStarter?.recent_pitch_count_avg ?? 0) + 7 < (awayStarter?.recent_pitch_count_avg ?? 0)) {
      notes.push(`${away} starter has been stretched deeper recently.`);
    }
    if ((awayBullpen?.fatigue_indicator === 'heavy') !== (homeBullpen?.fatigue_indicator === 'heavy')) {
      notes.push(`${awayBullpen?.fatigue_indicator === 'heavy' ? away : home} bullpen is carrying the heavier recent workload.`);
    }
    if ((game.market.total.current ?? 0) >= 9 && (game.weather.combined?.wind_speed_mph ?? 0) >= 10) {
      notes.push('Total environment is elevated by both the posted number and wind.');
    }

    sections.push(`## Game`);
    sections.push('');
    sections.push(`${away} vs ${home}`);
    sections.push('');
    sections.push('### Pitching Edge');
    sections.push('');
    sections.push(pitchingEdge);
    sections.push('');
    sections.push('### Bullpen Edge');
    sections.push('');
    sections.push(bullpenEdge);
    sections.push('');
    sections.push('### Offensive Edge');
    sections.push('');
    sections.push(offensiveEdge);
    sections.push('');
    sections.push('### Market Structure');
    sections.push('');
    sections.push(marketStructure);
    sections.push('');
    sections.push('### Risk Factors');
    sections.push('');
    sections.push(riskFactors.length ? riskFactors.join(' ') : 'No major operational red flags beyond normal variance.');
    sections.push('');
    sections.push('### Preliminary Betting Notes');
    sections.push('');
    sections.push(notes.length ? notes.join(' ') : 'No strong preliminary lean from the operational snapshot alone.');
    sections.push('');
  }

  sections.push('## Source Notes');
  sections.push('');
  sections.push(`Best structured sources: ${meta.bestSources.join(', ')}`);
  sections.push('');
  sections.push(`Blocked or degraded: ${meta.blockedSources.join(', ')}`);
  sections.push('');
  sections.push(`Known gaps: ${meta.missingData.join(', ')}`);
  sections.push('');
  sections.push(`Next iteration: ${meta.improvements.join(', ')}`);
  sections.push('');
  return sections.join('\n');
}

async function main() {
  [
    OPS_ROOT,
    RAW_DIR,
    PROCESSED_DIR,
    REPORTS_DIR,
    SCREENSHOTS_DIR,
    LOGS_DIR,
    HISTORICAL_DIR,
    SCRIPTS_DIR,
    RAW_RUN_DIR,
    SCREENSHOT_RUN_DIR,
  ].forEach(ensureDir);
  appendLog(`Starting MLB ops pipeline for ${DATE}`);
  await loadTeams();
  recordSourceEvent('MLB Stats API', 'ok', 'Loaded team reference map.', { endpoint: '/api/v1/teams?sportId=1' });

  const browser = await chromium.launch({ headless: true });

  try {
    const [scheduleData, savantBase] = await Promise.all([
      fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}&hydrate=probablePitcher,team,venue`),
      loadSavantTables(),
    ]);
    recordSourceEvent('MLB Stats API', 'ok', `Loaded ${scheduleData.dates?.[0]?.games?.length || 0} scheduled games.`, { endpoint: '/api/v1/schedule', rows: scheduleData.dates?.[0]?.games?.length || 0 });
    recordSourceEvent('Baseball Savant', 'ok', 'Loaded expected statistics and statcast CSV tables.', {
      endpoints: [
        '/leaderboard/expected_statistics?type=pitcher&csv=true',
        '/leaderboard/expected_statistics?type=batter&csv=true',
        '/leaderboard/statcast?type=pitcher&csv=true',
        '/leaderboard/statcast?type=batter&csv=true',
      ],
    });

    let rotowireList = [];
    let coversList = [];
    try {
      rotowireList = await scrapeRotowire(browser);
      recordSourceEvent('Rotowire', 'ok', `Scraped ${rotowireList.length} lineup cards.`, { url: 'https://www.rotowire.com/baseball/daily-lineups.php', rows: rotowireList.length });
    } catch (error) {
      recordSourceEvent('Rotowire', 'failed', error.message, { url: 'https://www.rotowire.com/baseball/daily-lineups.php' });
    }
    try {
      coversList = await scrapeCoversOdds(browser);
      recordSourceEvent('Covers', 'ok', `Scraped ${coversList.length} market rows.`, { url: 'https://www.covers.com/sport/baseball/mlb/odds', rows: coversList.length });
    } catch (error) {
      recordSourceEvent('Covers', 'failed', error.message, { url: 'https://www.covers.com/sport/baseball/mlb/odds' });
    }
    let parkFactors = new Map();
    try {
      parkFactors = await scrapeParkFactors(browser);
      recordSourceEvent('Baseball Savant', 'ok', `Scraped ${parkFactors.size} park factor rows with Playwright fallback.`, {
        url: `https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?year=${YEAR}`,
        rows: parkFactors.size,
      });
    } catch (error) {
      recordSourceEvent('Baseball Savant', 'failed', `Park factor scrape failed: ${error.message}`, {
        url: `https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?year=${YEAR}`,
      });
    }
    const savant = { ...savantBase, parkFactors };
    const scheduleGames = scheduleData.dates?.[0]?.games || [];
    const outputGames = [];
    const csvRows = [];

    writeJson(path.join(RAW_RUN_DIR, 'schedule.json'), scheduleData);
    writeJson(path.join(RAW_RUN_DIR, 'rotowire_lineups.json'), rotowireList);
    writeJson(path.join(RAW_RUN_DIR, 'covers_odds.json'), coversList);
    writeJson(path.join(RAW_RUN_DIR, 'source_catalog.json'), {
      date: DATE,
      discovered_endpoints: [
        {
          source: 'MLB Stats API',
          url: 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD&hydrate=probablePitcher,team,venue',
          params: ['sportId', 'date', 'hydrate'],
          format: 'JSON',
          advantage: 'Primary structured schedule, probable starters, teams, and venues.',
        },
        {
          source: 'MLB Stats API',
          url: 'https://statsapi.mlb.com/api/v1/people/{playerId}/stats?stats=season,lastXGames,gameLog,statSplits&group=hitting|pitching&season=YYYY',
          params: ['playerId', 'stats', 'group', 'season', 'sitCodes', 'limit'],
          format: 'JSON',
          advantage: 'Stable structured player stats, recent form, pitch counts, and splits.',
        },
        {
          source: 'MLB Stats API',
          url: 'https://statsapi.mlb.com/api/v1/teams/{teamId}/stats?stats=season,statSplits&group=hitting|pitching&season=YYYY',
          params: ['teamId', 'stats', 'group', 'season', 'sitCodes'],
          format: 'JSON',
          advantage: 'Team-level offense, pitching, bullpen ERA, and home/away splits.',
        },
        {
          source: 'Baseball Savant',
          url: 'https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher|batter&year=YYYY&csv=true',
          params: ['type', 'year', 'csv'],
          format: 'CSV',
          advantage: 'Direct export for xwOBA/xERA without visual scraping.',
        },
        {
          source: 'Baseball Savant',
          url: 'https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher|batter&year=YYYY&csv=true',
          params: ['type', 'year', 'csv'],
          format: 'CSV',
          advantage: 'Direct export for hard-hit% and barrel% without DOM parsing.',
        },
        {
          source: 'Rotowire',
          url: 'https://www.rotowire.com/baseball/daily-lineups.php',
          params: [],
          format: 'Rendered HTML',
          advantage: 'Best accessible lineup, batting order, starter hand, weather, and totals view.',
        },
        {
          source: 'Covers',
          url: 'https://www.covers.com/sport/baseball/mlb/odds',
          params: [],
          format: 'Rendered HTML',
          advantage: 'Accessible opening/current moneyline board when odds APIs are not available.',
        },
        {
          source: 'Open-Meteo',
          url: 'https://api.open-meteo.com/v1/forecast',
          params: ['latitude', 'longitude', 'hourly', 'timezone', 'start_date', 'end_date'],
          format: 'JSON',
          advantage: 'Free structured weather fallback once stadium coordinates are known.',
        },
      ],
    });

    for (const game of scheduleGames) {
      const awayTeam = state.teamById.get(game.teams.away.team.id);
      const homeTeam = state.teamById.get(game.teams.home.team.id);
      const awayAbbr = normalizeTeamAbbr(awayTeam?.abbreviation || awayTeam?.teamCode?.toUpperCase() || game.teams.away.team.name.slice(0, 3).toUpperCase());
      const homeAbbr = normalizeTeamAbbr(homeTeam?.abbreviation || homeTeam?.teamCode?.toUpperCase() || game.teams.home.team.name.slice(0, 3).toUpperCase());

      const rotowireGame = resolveRotowireGame(rotowireList, awayAbbr, homeAbbr);
      const coversGame = resolveCoversOdds(coversList, awayAbbr, homeAbbr);
      const [awayStats, homeStats, awayRecent, homeRecent, awayBullpen, homeBullpen, venue] = await Promise.all([
        getTeamStats(game.teams.away.team.id),
        getTeamStats(game.teams.home.team.id),
        getRecentGames(game.teams.away.team.id),
        getRecentGames(game.teams.home.team.id),
        getBullpenSummary(game.teams.away.team.id),
        getBullpenSummary(game.teams.home.team.id),
        getVenue(game.venue.id),
      ]);

      const [awayStarterProfile, homeStarterProfile, venueWeather] = await Promise.all([
        buildPitcherProfile(game.teams.away.probablePitcher, game.teams.away.team.id, savant),
        buildPitcherProfile(game.teams.home.probablePitcher, game.teams.home.team.id, savant),
        getWeatherForVenue(venue, game.gameDate),
      ]);
      if (venueWeather && !venueWeather.error) {
        recordSourceEvent('Open-Meteo', 'ok', `Weather resolved for ${venue?.name || game.venue?.name}.`);
      }

      const awayLineupPlayers = await buildLineupPlayers(
        rotowireGame?.away_lineup || [],
        game.teams.away.team.id,
        savant,
        homeStarterProfile?.hand || null
      );
      const homeLineupPlayers = await buildLineupPlayers(
        rotowireGame?.home_lineup || [],
        game.teams.home.team.id,
        savant,
        awayStarterProfile?.hand || null
      );

      const parkFactorRow =
        savant.parkFactors.get(normalizeName(homeTeam?.teamName || homeTeam?.teamName || homeTeam?.name?.replace(/.*\s/, ''))) ||
        savant.parkFactors.get(normalizeName(homeTeam?.teamName)) ||
        savant.parkFactors.get(normalizeName(homeTeam?.clubName)) ||
        savant.parkFactors.get(normalizeName(homeTeam?.shortName)) ||
        null;

      const gameData = {
        game_id: game.gamePk,
        date: DATE,
        matchup: {
          game_time_utc: game.gameDate,
          game_time_local: rotowireGame?.time_et || null,
          stadium: venue?.name || game.venue?.name || null,
          stadium_id: game.venue?.id || null,
          home: {
            team: game.teams.home.team.name,
            team_id: game.teams.home.team.id,
            abbreviation: homeAbbr,
          },
          away: {
            team: game.teams.away.team.name,
            team_id: game.teams.away.team.id,
            abbreviation: awayAbbr,
          },
        },
        starting_pitchers: {
          away: awayStarterProfile,
          home: homeStarterProfile,
        },
        bullpen: {
          away: awayBullpen,
          home: homeBullpen,
        },
        lineups: {
          away: {
            status: rotowireGame?.away_lineup_status || null,
            players: awayLineupPlayers,
            aggregate: aggregateLineup(awayLineupPlayers),
          },
          home: {
            status: rotowireGame?.home_lineup_status || null,
            players: homeLineupPlayers,
            aggregate: aggregateLineup(homeLineupPlayers),
          },
          injuries: null,
        },
        market: buildMarketData(rotowireGame, coversGame),
        team_form: {
          away: buildFormSummary(game.teams.away.team.id, awayStats, awayRecent),
          home: buildFormSummary(game.teams.home.team.id, homeStats, homeRecent),
        },
        advanced_sabermetrics: {
          away_lineup: aggregateLineup(awayLineupPlayers),
          home_lineup: aggregateLineup(homeLineupPlayers),
          park_factor: parkFactorRow ? {
            venue: parkFactorRow.Venue,
            year_window: parkFactorRow.Year,
            overall: parseStatNumber(parkFactorRow['Park Factor']),
            woba_con: parseStatNumber(parkFactorRow.wOBAcon),
            xwoba_con: parseStatNumber(parkFactorRow.xwOBAcon),
            hard_hit: parseStatNumber(parkFactorRow.HardHit),
            hr: parseStatNumber(parkFactorRow.HR),
          } : null,
        },
        weather: {
          rotowire: rotowireGame ? { summary: rotowireGame.weather, icon: rotowireGame.weather_icon } : null,
          combined: venueWeather,
        },
        validation: {
          rotowire_found: !!rotowireGame,
          covers_found: !!coversGame,
        },
      };

      outputGames.push(gameData);
      csvRows.push({
        date: DATE,
        game_id: game.gamePk,
        away_team: game.teams.away.team.name,
        home_team: game.teams.home.team.name,
        game_time_utc: game.gameDate,
        game_time_local: rotowireGame?.time_et || '',
        stadium: venue?.name || game.venue?.name || '',
        away_starter: awayStarterProfile?.name || '',
        away_era: awayStarterProfile?.era,
        away_whip: awayStarterProfile?.whip,
        away_xwoba: awayStarterProfile?.xwOBA,
        home_starter: homeStarterProfile?.name || '',
        home_era: homeStarterProfile?.era,
        home_whip: homeStarterProfile?.whip,
        home_xwoba: homeStarterProfile?.xwOBA,
        away_bullpen_era: awayBullpen?.bullpen_era,
        away_bullpen_fatigue: awayBullpen?.fatigue_indicator,
        home_bullpen_era: homeBullpen?.bullpen_era,
        home_bullpen_fatigue: homeBullpen?.fatigue_indicator,
        away_last10: gameData.team_form.away.last_10_record,
        home_last10: gameData.team_form.home.last_10_record,
        away_run_diff_last10: gameData.team_form.away.run_differential_last_10,
        home_run_diff_last10: gameData.team_form.home.run_differential_last_10,
        away_lineup_ops: gameData.lineups.away.aggregate.avg_ops,
        away_lineup_xwoba: gameData.lineups.away.aggregate.avg_xwoba,
        away_lineup_split_ops: gameData.lineups.away.aggregate.avg_split_ops_vs_opposing_hand,
        home_lineup_ops: gameData.lineups.home.aggregate.avg_ops,
        home_lineup_xwoba: gameData.lineups.home.aggregate.avg_xwoba,
        home_lineup_split_ops: gameData.lineups.home.aggregate.avg_split_ops_vs_opposing_hand,
        open_away_ml: gameData.market.moneyline.opening.away_american,
        open_home_ml: gameData.market.moneyline.opening.home_american,
        current_away_ml: gameData.market.moneyline.current.away_american,
        current_home_ml: gameData.market.moneyline.current.home_american,
        away_implied_probability: gameData.market.moneyline.current.away_implied_probability,
        home_implied_probability: gameData.market.moneyline.current.home_implied_probability,
        total: gameData.market.total.current,
        park_factor: gameData.advanced_sabermetrics.park_factor?.overall,
        temperature_f: gameData.weather.combined?.temperature_f,
        humidity_pct: gameData.weather.combined?.humidity_pct,
        rain_probability_pct: gameData.weather.combined?.rain_probability_pct,
        wind_speed_mph: gameData.weather.combined?.wind_speed_mph,
        away_lineup_json: gameData.lineups.away.players,
        home_lineup_json: gameData.lineups.home.players,
      });
    }

    const meta = {
      generated_at: new Date().toISOString(),
      date: DATE,
      run_timestamp: RUN_TS,
      schema_version: '2.0.0',
      source_summary: {
        best_sources: ['MLB Stats API', 'Baseball Savant CSV exports', 'Rotowire lineup cards', 'Covers odds board', 'Open-Meteo'],
        blocked_sources: ['FanGraphs (Cloudflare challenge)', 'Covers run line and totals sub-tabs were not switchable in headless automation', 'Rotowire injury extraction not isolated into a structured endpoint'],
        missing_data: ['xFIP', 'structured injury severity', 'live odds', 'runline', 'wRC+'],
      },
      source_health: [...state.sourceHealth.values()],
      output_paths: {
        raw_run_dir: RAW_RUN_DIR,
        report: path.join(REPORTS_DIR, 'daily_mlb_report.md'),
      },
      discovered_endpoints: [
        'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD&hydrate=probablePitcher,team,venue',
        'https://statsapi.mlb.com/api/v1/people/{playerId}/stats?stats=season,lastXGames,gameLog,statSplits&group=hitting|pitching&season=YYYY',
        'https://statsapi.mlb.com/api/v1/teams/{teamId}/stats?stats=season,statSplits&group=hitting|pitching&season=YYYY',
        'https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher|batter&year=YYYY&csv=true',
        'https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher|batter&year=YYYY&csv=true',
      ],
    };

    const jsonPayload = { meta, games: outputGames };
    const csvText = toCsv(csvRows);
    const reportText = buildReport(outputGames, {
      bestSources: meta.source_summary.best_sources,
      blockedSources: meta.source_summary.blocked_sources,
      missingData: meta.source_summary.missing_data,
      improvements: [
        'Add a residential-browser fallback for FanGraphs xFIP collection',
        'Add a dedicated injuries source with team-level normalization',
        'Capture runline and live odds from an odds API or a switchable sportsbook board',
        'Persist API response caching by date and endpoint hash',
        'Schedule pre-lineup and post-lineup refresh windows',
      ],
    });

    const historicalJsonPath = makeNonOverwritingPath(path.join(HISTORICAL_DIR, `${DATE}_matchups.json`));
    const historicalCsvPath = makeNonOverwritingPath(path.join(HISTORICAL_DIR, `${DATE}_matchups.csv`));
    writeJson(historicalJsonPath, jsonPayload);
    writeText(historicalCsvPath, csvText);
    writeJson(path.join(PROCESSED_DIR, 'latest_matchups.json'), jsonPayload);
    writeText(path.join(PROCESSED_DIR, 'latest_matchups.csv'), csvText);
    writeText(path.join(REPORTS_DIR, 'daily_mlb_report.md'), reportText);
    writeJson(path.join(RAW_RUN_DIR, 'final_dataset.json'), jsonPayload);
    writeText(path.join(LOGS_DIR, `${DATE}_extraction_log.txt`), state.logLines.join('\n') + '\n');
    fs.appendFileSync(EXTRACTION_LOG_PATH, state.logLines.join('\n') + '\n');
    persistSourceHealthHistory();

    writeJson(path.join(ROOT, 'mlb_matchups_today.json'), jsonPayload);
    writeText(path.join(ROOT, 'mlb_matchups_today.csv'), csvText);
    writeText(path.join(ROOT, 'daily_mlb_report.md'), reportText);

    console.log(JSON.stringify({
      date: DATE,
      games: outputGames.length,
      outputs: [
        path.relative(ROOT, historicalJsonPath),
        path.relative(ROOT, historicalCsvPath),
        path.relative(ROOT, path.join(REPORTS_DIR, 'daily_mlb_report.md')),
        path.relative(ROOT, SCREENSHOT_RUN_DIR),
        path.relative(ROOT, EXTRACTION_LOG_PATH),
      ],
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
