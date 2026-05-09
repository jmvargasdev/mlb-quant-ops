const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OPS_ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(OPS_ROOT, 'processed');
const REPORTS_DIR = path.join(OPS_ROOT, 'reports');
const SNAPSHOTS_DIR = path.join(OPS_ROOT, 'snapshots');

const DATE = process.env.MLB_DATE || new Date().toISOString().slice(0, 10);
const SNAPSHOT_LABEL = process.env.SNAPSHOT_LABEL || `${String(new Date().getHours()).padStart(2, '0')}-${String(new Date().getMinutes()).padStart(2, '0')}`;

const LATEST_PATH = path.join(PROCESSED_DIR, 'latest_matchups.json');
const SCORED_PATH = path.join(PROCESSED_DIR, 'scored_matchups.json');
const INTRADAY_STATE_PATH = path.join(PROCESSED_DIR, 'intraday_market_state.json');
const MOVEMENTS_CSV_PATH = path.join(PROCESSED_DIR, 'market_movements.csv');
const REPORT_PATH = path.join(REPORTS_DIR, 'intraday_market_report.md');

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text);
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTeamAbbr(abbr) {
  return TEAM_ABBR_FIXES[abbr] || abbr;
}

function decimalToAmerican(decimalOdd) {
  if (!decimalOdd || decimalOdd <= 1) return null;
  if (decimalOdd >= 2) return Math.round((decimalOdd - 1) * 100);
  return -Math.round(100 / (decimalOdd - 1));
}

function americanToImplied(american) {
  if (american === null || american === undefined) return null;
  if (american > 0) return round(100 / (american + 100), 4);
  return round((-american) / ((-american) + 100), 4);
}

function parseRotowireOdds(items) {
  const result = { moneyline: null, total: null, raw: items || [] };
  for (const item of items || []) {
    if (item.startsWith('LINE')) {
      const match = item.match(/([A-Z]{2,4}\s*[+-]\d+)/);
      result.moneyline = match ? match[1].replace(/\s+/g, ' ').trim() : item.replace(/^LINE\s*/i, '').trim();
    }
    if (item.startsWith('O/U')) {
      const totalMatch = item.match(/(\d+(?:\.\d+)?)\s*Runs/i);
      result.total = totalMatch ? Number(totalMatch[1]) : null;
    }
  }
  return result;
}

function parseRotowireMoneyline(line, awayAbbr, homeAbbr) {
  if (!line) return null;
  const match = line.match(/([A-Z]{2,4})\s*([+-]\d+)/);
  if (!match) return null;
  const favAbbr = normalizeTeamAbbr(match[1]);
  const favPrice = Number(match[2]);
  if (favAbbr === normalizeTeamAbbr(homeAbbr)) {
    const homeAmerican = favPrice;
    const awayAmerican = favPrice < 0
      ? Math.round((10000 / Math.abs(favPrice)))
      : -Math.round((10000 / Math.abs(favPrice)));
    return { home_american: homeAmerican, away_american: awayAmerican };
  }
  if (favAbbr === normalizeTeamAbbr(awayAbbr)) {
    const awayAmerican = favPrice;
    const homeAmerican = favPrice < 0
      ? Math.round((10000 / Math.abs(favPrice)))
      : -Math.round((10000 / Math.abs(favPrice)));
    return { away_american: awayAmerican, home_american: homeAmerican };
  }
  return null;
}

function parseFavoriteFromMoneyline(line) {
  if (!line) return null;
  const match = line.match(/([A-Z]{2,4})\s*([+-]\d+)/);
  if (!match) return null;
  return { abbr: normalizeTeamAbbr(match[1]), american: Number(match[2]) };
}

function formatPct(value, digits = 1) {
  if (value === null || value === undefined) return 'n/a';
  return `${round(value * 100, digits)}%`;
}

function formatNum(value, digits = 2) {
  if (value === null || value === undefined) return 'n/a';
  return String(round(value, digits));
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
    return stringValue;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
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
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function scrapeCoversOdds(browser) {
  const page = await browser.newPage();
  await page.goto('https://www.covers.com/sport/baseball/mlb/odds', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  const body = await page.locator('body').innerText();
  await page.close();

  const blocks = body.split(/TODAY,\s+/).slice(1);
  const games = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const abbrs = lines.filter((line) => /^[A-Z]{2,4}$/.test(line));
    const decimals = lines.filter((line) => /^\d+\.\d+$/.test(line)).map(Number);
    if (abbrs.length < 2 || decimals.length < 2) continue;
    games.push({
      time_et: lines[0],
      away_abbr: normalizeTeamAbbr(abbrs[0]),
      home_abbr: normalizeTeamAbbr(abbrs[1]),
      open_decimal_away: decimals[0],
      open_decimal_home: decimals[1],
      current_decimal_away: decimals[2] ?? null,
      current_decimal_home: decimals[3] ?? null,
      source: 'covers',
    });
  }
  return games;
}

async function scrapeRotowire(browser) {
  const page = await browser.newPage();
  await page.goto('https://www.rotowire.com/baseball/daily-lineups.php', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);

  const games = await page.evaluate(() => {
    const textOf = (el, selector) => el ? el.querySelector(selector)?.textContent?.trim() || null : null;
    return [...document.querySelectorAll('.lineup.is-mlb')].map((card) => {
      const awayList = card.querySelector('.lineup__list.is-visit');
      const homeList = card.querySelector('.lineup__list.is-home');
      const oddsItems = [...card.querySelectorAll('.lineup__odds-item')].map((item) => item.textContent.replace(/\s+/g, ' ').trim());
      return {
        time_et: textOf(card, '.lineup__time'),
        away_abbr: textOf(card, '.lineup__team.is-visit .lineup__abbr'),
        home_abbr: textOf(card, '.lineup__team.is-home .lineup__abbr'),
        away_lineup_status: textOf(awayList, '.lineup__status'),
        home_lineup_status: textOf(homeList, '.lineup__status'),
        weather: textOf(card, '.lineup__weather-text'),
        weather_icon: card.querySelector('.lineup__weather-icon')?.getAttribute('alt') || null,
        odds_items: oddsItems,
      };
    }).filter((game) => game.away_abbr && game.home_abbr);
  });

  await page.close();
  return games;
}

async function fetchWeatherUpdate(game) {
  const coords = game.weather?.combined && typeof game.weather.combined.latitude === 'number'
    ? { latitude: game.weather.combined.latitude, longitude: game.weather.combined.longitude }
    : null;
  if (!coords) return game.weather?.combined || null;
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${coords.latitude}`,
    `&longitude=${coords.longitude}`,
    '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m',
    '&timezone=auto',
    `&start_date=${DATE}`,
    `&end_date=${DATE}`,
  ].join('');
  try {
    const data = await fetchJson(url);
    const target = new Date(game.matchup.game_time_utc);
    const times = data.hourly?.time || [];
    let bestIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i += 1) {
      const candidate = new Date(times[i]);
      const delta = Math.abs(candidate.getTime() - target.getTime());
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    return {
      source: 'open-meteo',
      timezone: data.timezone,
      latitude: coords.latitude,
      longitude: coords.longitude,
      temperature_f: data.hourly?.temperature_2m?.[bestIndex] !== undefined ? round((data.hourly.temperature_2m[bestIndex] * 9) / 5 + 32, 1) : null,
      humidity_pct: data.hourly?.relative_humidity_2m?.[bestIndex] ?? null,
      rain_probability_pct: data.hourly?.precipitation_probability?.[bestIndex] ?? null,
      wind_speed_mph: data.hourly?.wind_speed_10m?.[bestIndex] !== undefined ? round(data.hourly.wind_speed_10m[bestIndex] * 0.621371, 1) : null,
    };
  } catch {
    return game.weather?.combined || null;
  }
}

function resolveByAbbr(list, awayAbbr, homeAbbr) {
  return list.find((item) => normalizeTeamAbbr(item.away_abbr) === awayAbbr && normalizeTeamAbbr(item.home_abbr) === homeAbbr) || null;
}

function snapshotFilePath(date, label) {
  const dateDir = path.join(SNAPSHOTS_DIR, date);
  ensureDir(dateDir);
  let filePath = path.join(dateDir, `${label}.json`);
  if (!fs.existsSync(filePath)) return filePath;
  let i = 2;
  while (true) {
    const candidate = path.join(dateDir, `${label}_${String(i).padStart(2, '0')}.json`);
    if (!fs.existsSync(candidate)) return candidate;
    i += 1;
  }
}

function loadPreviousSnapshot(date) {
  const dateDir = path.join(SNAPSHOTS_DIR, date);
  if (!fs.existsSync(dateDir)) return null;
  const files = fs.readdirSync(dateDir).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) return null;
  return readJson(path.join(dateDir, files[files.length - 1]));
}

function gameTimeDiffHours(prevIso, currentIso) {
  if (!prevIso || !currentIso) return null;
  const prev = new Date(prevIso);
  const current = new Date(currentIso);
  const diff = (current.getTime() - prev.getTime()) / 3600000;
  return diff > 0 ? diff : null;
}

function impliedFromCurrent(sideData) {
  return sideData?.current_implied_probability ?? null;
}

function americanShift(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return current - previous;
}

function sideDirection(teamImplied, oppImplied, prevTeamImplied, prevOppImplied) {
  if ([teamImplied, oppImplied, prevTeamImplied, prevOppImplied].some((value) => value === null || value === undefined)) return 'unknown';
  const currentDiff = teamImplied - oppImplied;
  const prevDiff = prevTeamImplied - prevOppImplied;
  if (Math.abs(currentDiff - prevDiff) < 0.003) return 'flat';
  return currentDiff > prevDiff ? 'toward_team' : 'toward_opponent';
}

function computeVolatility(history, current, open) {
  const values = [open, ...(history || []), current].filter((value) => value !== null && value !== undefined);
  if (!values.length) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const recentMove = values.length >= 2 ? Math.abs(values[values.length - 1] - values[values.length - 2]) : 0;
  return round(clamp(((range / 0.12) * 70) + ((recentMove / 0.05) * 30), 0, 100), 2);
}

function buildSideMicrostructure({ side, current, previous, previousSideMetrics, openImplied, opposingCurrent, opposingPrevious, fairProb, previousFairEdge }) {
  const currentImplied = impliedFromCurrent(current);
  const previousImplied = impliedFromCurrent(previous);
  const hours = gameTimeDiffHours(previous?.snapshot_timestamp, current.snapshot_timestamp);
  const delta = currentImplied !== null && previousImplied !== null
    ? currentImplied - previousImplied
    : currentImplied !== null && openImplied !== null
      ? currentImplied - openImplied
      : null;
  const velocity = delta !== null && hours ? round(delta / hours, 5) : null;
  const previousVelocity = previousSideMetrics?.line_velocity ?? null;
  const acceleration = velocity !== null && previousVelocity !== null && hours ? round((velocity - previousVelocity) / hours, 6) : null;
  const movementDirection = sideDirection(
    currentImplied,
    opposingCurrent,
    previousImplied ?? openImplied,
    opposingPrevious ?? null
  );
  const volatilityScore = computeVolatility(current.history_implied_probabilities, currentImplied, openImplied);
  const marketStability = round(100 - volatilityScore, 2);
  const edgeNow = fairProb !== null && currentImplied !== null ? fairProb - currentImplied : null;
  const edgeDelta = edgeNow !== null && previousFairEdge !== null ? edgeNow - previousFairEdge : null;
  const marketPressure = round(((delta ?? 0) * 1000) + ((velocity ?? 0) * 350), 3);

  return {
    side,
    line_velocity: velocity,
    line_acceleration: acceleration,
    volatility_score: volatilityScore,
    market_stability_score: marketStability,
    directional_consensus: movementDirection,
    late_money_indicator: false,
    market_pressure: marketPressure,
    edge_delta: edgeDelta,
    price_change_american: americanShift(current.current_american, previous?.current_american ?? null),
  };
}

function detectFlags({ game, side, sideMetrics, opposingMetrics, fairProb, currentImplied, previousImplied, openImplied, currentTotal, previousTotal, baselineWeather, currentWeather, lineupStatusChanged, scoredSide, scoredOpposing }) {
  const flags = [];
  const movement = currentImplied !== null && previousImplied !== null ? currentImplied - previousImplied : null;
  const openMove = currentImplied !== null && openImplied !== null ? currentImplied - openImplied : null;
  const baselineMove = movement ?? openMove;
  const priceEdge = fairProb !== null && currentImplied !== null ? fairProb - currentImplied : null;
  const previousEdge = scoredSide?.previous_edge_vs_market ?? null;

  if (
    (movement !== null && Math.abs(movement) >= 0.03 && Math.abs(sideMetrics.line_velocity ?? 0) >= 0.015) ||
    (movement === null && openMove !== null && Math.abs(openMove) >= 0.035)
  ) {
    flags.push('steam_move_detected');
  }
  if (sideMetrics.volatility_score >= 65) {
    flags.push('extreme_volatility');
  }
  if (lineupStatusChanged && baselineMove !== null && Math.abs(baselineMove) >= 0.015) {
    flags.push('lineup_reaction_detected');
  }
  const weatherShift = (
    baselineWeather &&
    currentWeather &&
    (
      Math.abs((currentWeather.wind_speed_mph ?? 0) - (baselineWeather.wind_speed_mph ?? 0)) >= 4 ||
      Math.abs((currentWeather.rain_probability_pct ?? 0) - (baselineWeather.rain_probability_pct ?? 0)) >= 20 ||
      Math.abs((currentWeather.temperature_f ?? 0) - (baselineWeather.temperature_f ?? 0)) >= 6
    )
  );
  if (weatherShift && currentTotal !== null && previousTotal !== null && Math.abs(currentTotal - previousTotal) >= 0.5) {
    flags.push('weather_shift_detected');
  }
  if (baselineMove !== null && scoredSide && scoredOpposing) {
    const weakerSide = scoredSide.fair_win_probability < scoredOpposing.fair_win_probability;
    if (baselineMove > 0.02 && weakerSide) {
      flags.push('reverse_line_movement');
    }
  }
  if (sideMetrics.price_change_american === 0 && Math.abs((sideMetrics.market_pressure ?? 0)) < 1 && (game.market_disagreement_score ?? 0) >= 0.15) {
    flags.push('stale_lines');
  }
  if ((game.market_disagreement_score ?? 0) >= 0.12) {
    flags.push('market_disagreement');
  }
  if (
    (movement !== null && Math.abs(movement) >= 0.02 && sideMetrics.line_velocity !== null && Math.abs(sideMetrics.line_velocity) >= 0.02) ||
    (movement === null && openMove !== null && Math.abs(openMove) >= 0.045)
  ) {
    flags.push('rapid_movement');
  }
  if (priceEdge !== null && priceEdge <= 0 && previousEdge !== null && previousEdge > 0) {
    flags.push('edge_decay');
  }
  if (priceEdge !== null && previousEdge !== null && priceEdge > previousEdge + 0.015) {
    flags.push('edge_strengthening');
  }
  if ((flags.includes('steam_move_detected') || flags.includes('rapid_movement')) && !lineupStatusChanged && !weatherShift && priceEdge !== null && priceEdge < 0) {
    flags.push('suspicious_movement');
  }
  return [...new Set(flags)];
}

function buildReport(state) {
  const strongestSteam = state.market_movements.filter((row) => row.flags.includes('steam_move_detected')).slice(0, 8);
  const reverseMoves = state.market_movements.filter((row) => row.flags.includes('reverse_line_movement')).slice(0, 8);
  const volatility = [...state.market_movements].sort((a, b) => b.volatility_score - a.volatility_score).slice(0, 8);
  const overreaction = state.market_movements.filter((row) => row.flags.includes('suspicious_movement') || row.flags.includes('market_disagreement')).slice(0, 8);
  const stableValue = state.market_movements.filter((row) => row.edge_vs_market_pct_points > 0 && row.market_stability_score >= 55).slice(0, 8);

  const lines = [
    '# MLB Intraday Market Report',
    '',
    `Date: ${state.meta.date}`,
    `Snapshot: ${state.meta.snapshot_label}`,
    '',
    '## Strongest Steam Moves',
    '',
  ];

  const section = (rows, formatter) => {
    if (!rows.length) {
      lines.push('No signals detected.');
      lines.push('');
      return;
    }
    rows.forEach((row) => {
      lines.push(`- ${formatter(row)}`);
    });
    lines.push('');
  };

  section(strongestSteam, (row) => `${row.team} in ${row.matchup}: velocity ${formatNum(row.line_velocity, 4)}, edge ${formatNum(row.edge_vs_market_pct_points, 2)} pts, flags ${row.flags.join(', ')}`);

  lines.push('## Reverse Line Movement');
  lines.push('');
  section(reverseMoves, (row) => `${row.team} in ${row.matchup}: move ${formatNum(row.delta_implied_pct_points, 2)} pts, fair ${formatPct(row.fair_win_probability)}, market ${formatPct(row.market_implied_probability)}`);

  lines.push('## Highest Volatility Games');
  lines.push('');
  section(volatility, (row) => `${row.matchup} | ${row.team}: volatility ${formatNum(row.volatility_score, 1)}, stability ${formatNum(row.market_stability_score, 1)}, total ${formatNum(row.total_current, 1)}`);

  lines.push('## Potential Market Overreaction');
  lines.push('');
  section(overreaction, (row) => `${row.team} in ${row.matchup}: pressure ${formatNum(row.market_pressure, 2)}, disagreement ${formatNum(row.market_disagreement_score, 3)}, flags ${row.flags.join(', ')}`);

  lines.push('## Stable Value Opportunities');
  lines.push('');
  section(stableValue, (row) => `${row.team} in ${row.matchup}: edge ${formatNum(row.edge_vs_market_pct_points, 2)} pts, stability ${formatNum(row.market_stability_score, 1)}, confidence ${formatNum(row.source_confidence, 2)}`);

  return lines.join('\n');
}

async function main() {
  const latest = readJson(LATEST_PATH);
  const scored = fs.existsSync(SCORED_PATH) ? readJson(SCORED_PATH) : null;
  const scoredMap = new Map((scored?.games || []).map((game) => [game.game_id, game.scoring]));
  const previousSnapshot = loadPreviousSnapshot(DATE);
  const previousMap = new Map((previousSnapshot?.games || []).map((game) => [game.game_id, game]));

  const browser = await chromium.launch({ headless: true });
  let coversRows = [];
  let rotowireRows = [];
  try {
    coversRows = await scrapeCoversOdds(browser);
    rotowireRows = await scrapeRotowire(browser);
  } finally {
    await browser.close();
  }

  const snapshotGames = [];
  const movementRows = [];
  const nowIso = new Date().toISOString();

  for (const game of latest.games) {
    const awayAbbr = normalizeTeamAbbr(game.matchup.away.abbreviation);
    const homeAbbr = normalizeTeamAbbr(game.matchup.home.abbreviation);
    const covers = resolveByAbbr(coversRows, awayAbbr, homeAbbr);
    const rotowire = resolveByAbbr(rotowireRows, awayAbbr, homeAbbr);
    const scoredGame = scoredMap.get(game.game_id) || null;
    const previous = previousMap.get(game.game_id) || null;
    const currentWeather = await fetchWeatherUpdate(game);

    const coversCurrentAwayAmerican = covers?.current_decimal_away ? decimalToAmerican(covers.current_decimal_away) : game.market?.moneyline?.current?.away_american ?? null;
    const coversCurrentHomeAmerican = covers?.current_decimal_home ? decimalToAmerican(covers.current_decimal_home) : game.market?.moneyline?.current?.home_american ?? null;
    const coversOpenAwayAmerican = covers?.open_decimal_away ? decimalToAmerican(covers.open_decimal_away) : game.market?.moneyline?.opening?.away_american ?? null;
    const coversOpenHomeAmerican = covers?.open_decimal_home ? decimalToAmerican(covers.open_decimal_home) : game.market?.moneyline?.opening?.home_american ?? null;

    const rwOdds = parseRotowireOdds(rotowire?.odds_items);
    const rwLine = parseRotowireMoneyline(game.market?.moneyline?.rotowire_line || null, awayAbbr, homeAbbr) || parseRotowireMoneyline(rwOdds.moneyline, awayAbbr, homeAbbr);
    const currentTotal = rwOdds.total ?? game.market?.total?.current ?? null;

    const disagreementScore = (() => {
      const rwFavorite = parseFavoriteFromMoneyline(game.market?.moneyline?.rotowire_line || rwOdds.moneyline || null);
      if (!rwFavorite) return 0;
      const coversFavorite = (() => {
        const homeImp = americanToImplied(coversCurrentHomeAmerican);
        const awayImp = americanToImplied(coversCurrentAwayAmerican);
        if (homeImp === null || awayImp === null) return null;
        return homeImp >= awayImp
          ? { abbr: homeAbbr, american: coversCurrentHomeAmerican }
          : { abbr: awayAbbr, american: coversCurrentAwayAmerican };
      })();
      if (!coversFavorite) return 0;
      if (rwFavorite.abbr !== coversFavorite.abbr) return 1;
      return round(clamp(Math.abs(Math.abs(rwFavorite.american) - Math.abs(coversFavorite.american)) / 80, 0, 1), 4);
    })();

    const historyImpliedAway = previous?.history?.away_implied_probabilities || [];
    const historyImpliedHome = previous?.history?.home_implied_probabilities || [];
    const previousScoringAway = previous?.side_metrics?.away || null;
    const previousScoringHome = previous?.side_metrics?.home || null;

    const awayCurrent = {
      snapshot_timestamp: nowIso,
      current_american: coversCurrentAwayAmerican,
      current_implied_probability: americanToImplied(coversCurrentAwayAmerican),
      open_american: coversOpenAwayAmerican,
      open_implied_probability: americanToImplied(coversOpenAwayAmerican),
      history_implied_probabilities: [...historyImpliedAway, previous?.market?.away?.current_implied_probability].filter((value) => value !== null && value !== undefined),
    };
    const homeCurrent = {
      snapshot_timestamp: nowIso,
      current_american: coversCurrentHomeAmerican,
      current_implied_probability: americanToImplied(coversCurrentHomeAmerican),
      open_american: coversOpenHomeAmerican,
      open_implied_probability: americanToImplied(coversOpenHomeAmerican),
      history_implied_probabilities: [...historyImpliedHome, previous?.market?.home?.current_implied_probability].filter((value) => value !== null && value !== undefined),
    };

    const awayPrev = previous?.market?.away ? {
      snapshot_timestamp: previous.meta.snapshot_timestamp,
      current_american: previous.market.away.current_american,
      current_implied_probability: previous.market.away.current_implied_probability,
    } : null;
    const homePrev = previous?.market?.home ? {
      snapshot_timestamp: previous.meta.snapshot_timestamp,
      current_american: previous.market.home.current_american,
      current_implied_probability: previous.market.home.current_implied_probability,
    } : null;

    const awayFair = scoredGame?.away?.fair_win_probability ?? null;
    const homeFair = scoredGame?.home?.fair_win_probability ?? null;

    const awayMetrics = buildSideMicrostructure({
      side: 'away',
      current: awayCurrent,
      previous: awayPrev,
      previousSideMetrics: previousScoringAway,
      openImplied: awayCurrent.open_implied_probability,
      opposingCurrent: homeCurrent.current_implied_probability,
      opposingPrevious: homePrev?.current_implied_probability ?? null,
      fairProb: awayFair,
      previousFairEdge: previousScoringAway?.edge_vs_market ?? null,
    });
    const homeMetrics = buildSideMicrostructure({
      side: 'home',
      current: homeCurrent,
      previous: homePrev,
      previousSideMetrics: previousScoringHome,
      openImplied: homeCurrent.open_implied_probability,
      opposingCurrent: awayCurrent.current_implied_probability,
      opposingPrevious: awayPrev?.current_implied_probability ?? null,
      fairProb: homeFair,
      previousFairEdge: previousScoringHome?.edge_vs_market ?? null,
    });

    const awayLineupChanged = !!previous && previous.lineup_status?.away !== (rotowire?.away_lineup_status || game.lineups.away.status || null);
    const homeLineupChanged = !!previous && previous.lineup_status?.home !== (rotowire?.home_lineup_status || game.lineups.home.status || null);

    const tempGame = { market_disagreement_score: disagreementScore };
    const awayFlags = detectFlags({
      game: tempGame,
      side: 'away',
      sideMetrics: awayMetrics,
      opposingMetrics: homeMetrics,
      fairProb: awayFair,
      currentImplied: awayCurrent.current_implied_probability,
      previousImplied: awayPrev?.current_implied_probability ?? null,
      openImplied: awayCurrent.open_implied_probability,
      currentTotal,
      previousTotal: previous?.market?.total?.current ?? game.market?.total?.current ?? null,
      baselineWeather: game.weather?.combined || null,
      currentWeather,
      lineupStatusChanged: awayLineupChanged,
      scoredSide: scoredGame?.away || null,
      scoredOpposing: scoredGame?.home || null,
    });
    const homeFlags = detectFlags({
      game: tempGame,
      side: 'home',
      sideMetrics: homeMetrics,
      opposingMetrics: awayMetrics,
      fairProb: homeFair,
      currentImplied: homeCurrent.current_implied_probability,
      previousImplied: homePrev?.current_implied_probability ?? null,
      openImplied: homeCurrent.open_implied_probability,
      currentTotal,
      previousTotal: previous?.market?.total?.current ?? game.market?.total?.current ?? null,
      baselineWeather: game.weather?.combined || null,
      currentWeather,
      lineupStatusChanged: homeLineupChanged,
      scoredSide: scoredGame?.home || null,
      scoredOpposing: scoredGame?.away || null,
    });

    const gameSnapshot = {
      game_id: game.game_id,
      matchup: game.matchup,
      meta: {
        snapshot_timestamp: nowIso,
        snapshot_label: SNAPSHOT_LABEL,
      },
      market: {
        source: 'covers+rotowire',
        away: awayCurrent,
        home: homeCurrent,
        total: {
          current: currentTotal,
          previous: previous?.market?.total?.current ?? game.market?.total?.current ?? null,
        },
        opening: {
          away_american: coversOpenAwayAmerican,
          home_american: coversOpenHomeAmerican,
        },
      },
      lineup_status: {
        away: rotowire?.away_lineup_status || game.lineups.away.status || null,
        home: rotowire?.home_lineup_status || game.lineups.home.status || null,
      },
      weather: {
        current: currentWeather,
        rotowire_summary: rotowire?.weather || game.weather?.rotowire?.summary || null,
        baseline: game.weather?.combined || null,
      },
      market_disagreement_score: disagreementScore,
      directional_consensus: disagreementScore <= 0.05 ? 'aligned' : disagreementScore <= 0.15 ? 'mild_disagreement' : 'high_disagreement',
      side_metrics: {
        away: {
          ...awayMetrics,
          edge_vs_market: awayFair !== null && awayCurrent.current_implied_probability !== null ? round(awayFair - awayCurrent.current_implied_probability, 4) : null,
          fair_win_probability: awayFair,
          flags: awayFlags,
        },
        home: {
          ...homeMetrics,
          edge_vs_market: homeFair !== null && homeCurrent.current_implied_probability !== null ? round(homeFair - homeCurrent.current_implied_probability, 4) : null,
          fair_win_probability: homeFair,
          flags: homeFlags,
        },
      },
      history: {
        away_implied_probabilities: awayCurrent.history_implied_probabilities,
        home_implied_probabilities: homeCurrent.history_implied_probabilities,
      },
      source_confidence: scored?.meta?.source_confidence ?? 0.75,
    };

    snapshotGames.push(gameSnapshot);

    for (const side of ['away', 'home']) {
      const metrics = gameSnapshot.side_metrics[side];
      const team = game.matchup[side];
      const marketCurrent = gameSnapshot.market[side];
      movementRows.push({
        snapshot_timestamp: nowIso,
        snapshot_label: SNAPSHOT_LABEL,
        date: DATE,
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side,
        team: team.team,
        team_abbreviation: team.abbreviation,
        current_american: marketCurrent.current_american,
        open_american: marketCurrent.open_american,
        current_implied_probability: marketCurrent.current_implied_probability,
        open_implied_probability: marketCurrent.open_implied_probability,
        delta_implied_pct_points: metrics.edge_delta !== null ? round((marketCurrent.current_implied_probability - (previous?.market?.[side]?.current_implied_probability ?? marketCurrent.open_implied_probability)) * 100, 2) : round(((marketCurrent.current_implied_probability ?? 0) - (marketCurrent.open_implied_probability ?? 0)) * 100, 2),
        line_velocity: metrics.line_velocity,
        line_acceleration: metrics.line_acceleration,
        volatility_score: metrics.volatility_score,
        market_stability_score: metrics.market_stability_score,
        directional_consensus: metrics.directional_consensus,
        market_pressure: metrics.market_pressure,
        total_current: currentTotal,
        fair_win_probability: metrics.fair_win_probability,
        market_implied_probability: marketCurrent.current_implied_probability,
        edge_vs_market_pct_points: metrics.edge_vs_market !== null ? round(metrics.edge_vs_market * 100, 2) : null,
        flags: metrics.flags,
        source_confidence: gameSnapshot.source_confidence,
        market_disagreement_score: disagreementScore,
      });
    }
  }

  const snapshotPayload = {
    meta: {
      date: DATE,
      snapshot_label: SNAPSHOT_LABEL,
      snapshot_timestamp: nowIso,
      source_confidence: scored?.meta?.source_confidence ?? 0.75,
      source_summary: {
        odds_source: 'Covers',
        lineup_weather_source: 'Rotowire',
        weather_structured_source: 'Open-Meteo',
      },
      previous_snapshot_timestamp: previousSnapshot?.meta?.snapshot_timestamp || null,
    },
    games: snapshotGames,
  };

  const snapshotPath = snapshotFilePath(DATE, SNAPSHOT_LABEL);
  writeJson(snapshotPath, snapshotPayload);

  const intradayState = {
    meta: snapshotPayload.meta,
    latest_snapshot_path: path.relative(process.cwd(), snapshotPath),
    previous_snapshot_path: previousSnapshot ? path.relative(process.cwd(), path.join(SNAPSHOTS_DIR, DATE, fs.readdirSync(path.join(SNAPSHOTS_DIR, DATE)).filter((file) => file.endsWith('.json')).sort().slice(-2)[0])) : null,
    strongest_steam_moves: movementRows.filter((row) => row.flags.includes('steam_move_detected')).sort((a, b) => Math.abs(b.line_velocity ?? 0) - Math.abs(a.line_velocity ?? 0)).slice(0, 10),
    reverse_line_movement: movementRows.filter((row) => row.flags.includes('reverse_line_movement')).slice(0, 10),
    highest_volatility_games: [...movementRows].sort((a, b) => b.volatility_score - a.volatility_score).slice(0, 10),
    stable_value_opportunities: movementRows.filter((row) => row.edge_vs_market_pct_points > 0 && row.market_stability_score >= 55).slice(0, 10),
    market_movements: movementRows,
    clv_foundation: {
      ready: true,
      required_future_snapshots: ['pregame', 'close'],
      fields_available: ['timestamp', 'open line', 'current line', 'fair probability', 'edge vs market', 'velocity', 'acceleration', 'volatility'],
    },
  };

  writeJson(INTRADAY_STATE_PATH, intradayState);
  writeText(MOVEMENTS_CSV_PATH, toCsv(movementRows));
  writeText(REPORT_PATH, buildReport(intradayState));

  console.log(JSON.stringify({
    snapshot: path.relative(process.cwd(), snapshotPath),
    outputs: [
      path.relative(process.cwd(), INTRADAY_STATE_PATH),
      path.relative(process.cwd(), MOVEMENTS_CSV_PATH),
      path.relative(process.cwd(), REPORT_PATH),
    ],
    strongestSteamMoves: intradayState.strongest_steam_moves.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
