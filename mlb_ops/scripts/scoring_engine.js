const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROCESSED_DIR = path.join(ROOT, 'processed');
const REPORTS_DIR = path.join(ROOT, 'reports');
const INPUT_PATH = path.join(PROCESSED_DIR, 'latest_matchups.json');
const SCORED_JSON_PATH = path.join(PROCESSED_DIR, 'scored_matchups.json');
const TOP_EDGES_CSV_PATH = path.join(PROCESSED_DIR, 'top_edges.csv');
const EDGE_REPORT_PATH = path.join(REPORTS_DIR, 'daily_edges_report.md');

const PUBLIC_BIAS_TEAMS = new Set([
  'New York Yankees',
  'Los Angeles Dodgers',
  'Boston Red Sox',
  'Chicago Cubs',
  'New York Mets',
  'Philadelphia Phillies',
  'Houston Astros',
  'Atlanta Braves',
]);

const WEIGHTS = {
  starter_edge: 0.30,
  bullpen_edge: 0.17,
  lineup_quality: 0.16,
  split_edge: 0.08,
  offensive_form: 0.10,
  recent_form: 0.08,
  park_factor: 0.04,
  weather_impact: 0.03,
  defensive_surrogate: 0.02,
  travel_fatigue: 0.02,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function average(values, digits = 4) {
  const nums = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (!nums.length) return null;
  return round(nums.reduce((sum, value) => sum + value, 0) / nums.length, digits);
}

function weightedAverage(items, digits = 4) {
  const usable = items.filter((item) => item && item.value !== null && item.value !== undefined && Number.isFinite(item.value) && item.weight > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const total = usable.reduce((sum, item) => sum + (item.value * item.weight), 0);
  return round(total / totalWeight, digits);
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function probToAmerican(probability) {
  if (probability === null || probability === undefined) return null;
  if (probability >= 0.5) {
    return Math.round(-(probability / (1 - probability)) * 100);
  }
  return Math.round(((1 - probability) / probability) * 100);
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
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

function diffLowerBetter(teamValue, oppValue, scale) {
  if (teamValue === null || teamValue === undefined || oppValue === null || oppValue === undefined) return null;
  return clamp((oppValue - teamValue) / scale, -1, 1);
}

function diffHigherBetter(teamValue, oppValue, scale) {
  if (teamValue === null || teamValue === undefined || oppValue === null || oppValue === undefined) return null;
  return clamp((teamValue - oppValue) / scale, -1, 1);
}

function fatigueToNumber(value) {
  if (value === 'light') return 0;
  if (value === 'moderate') return 0.5;
  if (value === 'heavy') return 1;
  return null;
}

function closerStatusToNumber(value) {
  if (value === 'available') return 1;
  if (value === 'limited') return 0;
  if (value === 'high_risk') return -1;
  return null;
}

function parseRecord(record) {
  if (!record || !/^\d+-\d+$/.test(record)) return null;
  const [wins, losses] = record.split('-').map(Number);
  const total = wins + losses;
  return total ? wins / total : null;
}

function stdDev(values) {
  const nums = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (nums.length < 2) return 0;
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const variance = nums.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function sourceConfidence(meta) {
  const rows = meta?.source_health || [];
  if (!rows.length) return 0.75;
  const perSource = rows.map((row) => {
    const total = (row.successes || 0) + (row.failures || 0);
    if (!total) return 0.75;
    return row.successes / total;
  });
  return average(perSource, 4) || 0.75;
}

function countMissing(values) {
  return values.filter((value) => value === null || value === undefined || Number.isNaN(value)).length;
}

function marketMoveScore(team, opponent) {
  const teamCurrent = team.market_current_implied_probability;
  const teamOpen = team.market_open_implied_probability;
  const oppCurrent = opponent.market_current_implied_probability;
  const oppOpen = opponent.market_open_implied_probability;
  const teamMove = (teamCurrent !== null && teamOpen !== null) ? teamCurrent - teamOpen : null;
  const oppMove = (oppCurrent !== null && oppOpen !== null) ? oppCurrent - oppOpen : null;
  return weightedAverage([
    { value: diffHigherBetter(oppMove, teamMove, 0.05), weight: 0.65 },
    { value: diffHigherBetter(team.market_price_value, opponent.market_price_value, 0.05), weight: 0.35 },
  ]);
}

function componentDescriptions(team, opponent) {
  return {
    starter_edge: `${team.name} starter ${team.starter.name} vs ${opponent.starter.name}`,
    bullpen_edge: `${team.name} bullpen ERA ${formatNum(team.bullpen.era)} with ${team.bullpen.fatigue}`,
    lineup_quality: `${team.name} lineup OPS ${formatNum(team.lineup.avg_ops, 3)} and xwOBA ${formatNum(team.lineup.avg_xwoba, 3)}`,
    split_edge: `${team.name} split OPS vs ${opponent.starter.hand || 'unknown'}HP: ${formatNum(team.lineup.avg_split_ops, 3)}`,
    offensive_form: `${team.name} runs/game ${formatNum(team.form.runs_per_game)} and team OPS ${formatNum(team.form.ops, 3)}`,
    recent_form: `${team.name} last 10 ${team.form.last10_record} with run diff ${formatNum(team.form.run_diff, 1)}`,
    park_factor: `${team.name} park leverage at factor ${formatNum(team.park_factor, 1)}`,
    weather_impact: `${team.name} weather/total sensitivity`,
    defensive_surrogate: `${team.name} staff run prevention proxy`,
    travel_fatigue: `${team.name} short-rest road penalty proxy`,
  };
}

function buildTeamView(game, side) {
  const isHome = side === 'home';
  const sideData = game.matchup[side];
  const oppSide = isHome ? 'away' : 'home';
  const starter = game.starting_pitchers[side] || {};
  const bullpen = game.bullpen[side] || {};
  const lineup = game.lineups[side] || {};
  const form = game.team_form[side] || {};
  const market = game.market?.moneyline || {};
  const current = market.current || {};
  const opening = market.opening || {};

  return {
    side,
    is_home: isHome,
    name: sideData.team,
    abbreviation: sideData.abbreviation,
    starter: {
      name: starter.name,
      hand: starter.hand || null,
      era: starter.era ?? null,
      whip: starter.whip ?? null,
      xera: starter.xERA ?? null,
      xwoba: starter.xwOBA ?? null,
      k9: starter.strikeouts_per_9 ?? null,
      recent_era: starter.recent_5_aggregate?.era ?? null,
      recent_whip: starter.recent_5_aggregate?.whip ?? null,
      pitch_count: starter.recent_pitch_count_avg ?? null,
      home_away_era: isHome ? starter.splits?.home?.era ?? null : starter.splits?.away?.era ?? null,
      recent_er_stddev: stdDev((starter.last_5_games || []).map((row) => row.earned_runs)),
      recent_pitch_stddev: stdDev((starter.last_5_games || []).map((row) => row.pitches)),
    },
    bullpen: {
      era: bullpen.bullpen_era ?? null,
      whip: bullpen.bullpen_whip ?? null,
      fatigue: bullpen.fatigue_indicator || null,
      fatigue_num: fatigueToNumber(bullpen.fatigue_indicator),
      closer_status: bullpen.closer_availability?.status || null,
      closer_num: closerStatusToNumber(bullpen.closer_availability?.status),
      usage_count: (bullpen.usage_last_3_games || []).length,
      usage_pitches: (bullpen.usage_last_3_games || []).reduce((sum, row) => sum + (row.pitches || 0), 0),
    },
    lineup: {
      status: lineup.status || null,
      confirmed: /confirmed/i.test(lineup.status || ''),
      player_count: (lineup.players || []).length,
      avg_ops: lineup.aggregate?.avg_ops ?? null,
      avg_obp: lineup.aggregate?.avg_obp ?? null,
      avg_iso: lineup.aggregate?.avg_iso ?? null,
      avg_xwoba: lineup.aggregate?.avg_xwoba ?? null,
      avg_hard_hit: lineup.aggregate?.avg_hard_hit_pct ?? null,
      avg_barrel: lineup.aggregate?.avg_barrel_pct ?? null,
      avg_babip: lineup.aggregate?.avg_babip ?? null,
      avg_split_ops: lineup.aggregate?.avg_split_ops_vs_opposing_hand ?? null,
    },
    form: {
      last10_record: form.last_10_record || null,
      last10_win_pct: parseRecord(form.last_10_record),
      run_diff: form.run_differential_last_10 ?? null,
      runs_per_game: form.offensive_production?.runs_per_game ?? null,
      ops: form.offensive_production?.ops ?? null,
      obp: form.offensive_production?.obp ?? null,
      strikeout_rate: form.offensive_production?.strikeout_rate ?? null,
    },
    market_current_implied_probability: isHome ? current.home_implied_probability ?? null : current.away_implied_probability ?? null,
    market_open_implied_probability: (() => {
      const openAmerican = isHome ? opening.home_american ?? null : opening.away_american ?? null;
      if (openAmerican === null) return null;
      if (openAmerican > 0) return round(100 / (openAmerican + 100), 4);
      return round((-openAmerican) / ((-openAmerican) + 100), 4);
    })(),
    market_current_american: isHome ? current.home_american ?? null : current.away_american ?? null,
    market_open_american: isHome ? opening.home_american ?? null : opening.away_american ?? null,
    park_factor: game.advanced_sabermetrics?.park_factor?.overall ?? null,
    park_hard_hit: game.advanced_sabermetrics?.park_factor?.hard_hit ?? null,
    park_hr: game.advanced_sabermetrics?.park_factor?.hr ?? null,
    weather: {
      wind_mph: game.weather?.combined?.wind_speed_mph ?? null,
      temp_f: game.weather?.combined?.temperature_f ?? null,
      rain_probability_pct: game.weather?.combined?.rain_probability_pct ?? null,
      humidity_pct: game.weather?.combined?.humidity_pct ?? null,
    },
    defensive_surrogate: {
      starter_xwoba: starter.xwOBA ?? null,
      bullpen_era: bullpen.bullpen_era ?? null,
    },
    travel: {
      proxy_penalty: isHome ? 0 : 0.08,
    },
    market_price_value: null,
  };
}

function computeComponentSet(team, opponent, total) {
  const parkEnv = team.park_factor !== null ? clamp((team.park_factor - 100) / 12, -1, 1) : 0;
  const offenseDelta = diffHigherBetter(team.lineup.avg_xwoba, opponent.lineup.avg_xwoba, 0.025) ?? 0;
  const weatherWindBias = team.weather.wind_mph !== null && team.weather.wind_mph >= 10 && (total ?? 0) >= 8.5
    ? diffHigherBetter(team.lineup.avg_barrel, opponent.lineup.avg_barrel, 3) ?? 0
    : 0;
  const weatherSuppressionBias = ((team.weather.temp_f !== null && team.weather.temp_f <= 55) || (team.weather.rain_probability_pct !== null && team.weather.rain_probability_pct >= 30))
    ? diffLowerBetter(team.starter.xera ?? team.starter.era, opponent.starter.xera ?? opponent.starter.era, 1.2) ?? 0
    : 0;

  const components = {
    starter_edge: weightedAverage([
      { value: diffLowerBetter(team.starter.xera ?? team.starter.era, opponent.starter.xera ?? opponent.starter.era, 1.15), weight: 0.28 },
      { value: diffLowerBetter(team.starter.whip, opponent.starter.whip, 0.18), weight: 0.18 },
      { value: diffHigherBetter(team.starter.k9, opponent.starter.k9, 2.2), weight: 0.16 },
      { value: diffLowerBetter(team.starter.xwoba, opponent.starter.xwoba, 0.03), weight: 0.14 },
      { value: diffLowerBetter(team.starter.recent_era, opponent.starter.recent_era, 1.6), weight: 0.14 },
      { value: diffHigherBetter(team.starter.pitch_count, opponent.starter.pitch_count, 14), weight: 0.10 },
    ]),
    bullpen_edge: weightedAverage([
      { value: diffLowerBetter(team.bullpen.era, opponent.bullpen.era, 0.65), weight: 0.42 },
      { value: diffLowerBetter(team.bullpen.whip, opponent.bullpen.whip, 0.12), weight: 0.18 },
      { value: diffLowerBetter(team.bullpen.fatigue_num, opponent.bullpen.fatigue_num, 0.8), weight: 0.22 },
      { value: diffHigherBetter(team.bullpen.closer_num, opponent.bullpen.closer_num, 1.0), weight: 0.18 },
    ]),
    lineup_quality: weightedAverage([
      { value: diffHigherBetter(team.lineup.avg_ops, opponent.lineup.avg_ops, 0.09), weight: 0.30 },
      { value: diffHigherBetter(team.lineup.avg_xwoba, opponent.lineup.avg_xwoba, 0.03), weight: 0.26 },
      { value: diffHigherBetter(team.lineup.avg_hard_hit, opponent.lineup.avg_hard_hit, 6), weight: 0.16 },
      { value: diffHigherBetter(team.lineup.avg_barrel, opponent.lineup.avg_barrel, 3), weight: 0.16 },
      { value: diffHigherBetter(team.lineup.avg_iso, opponent.lineup.avg_iso, 0.05), weight: 0.12 },
    ]),
    split_edge: weightedAverage([
      { value: diffHigherBetter(team.lineup.avg_split_ops, opponent.lineup.avg_split_ops, 0.08), weight: 1.0 },
    ]),
    offensive_form: weightedAverage([
      { value: diffHigherBetter(team.form.runs_per_game, opponent.form.runs_per_game, 0.65), weight: 0.36 },
      { value: diffHigherBetter(team.form.ops, opponent.form.ops, 0.07), weight: 0.28 },
      { value: diffHigherBetter(team.form.obp, opponent.form.obp, 0.035), weight: 0.18 },
      { value: diffLowerBetter(team.form.strikeout_rate, opponent.form.strikeout_rate, 0.05), weight: 0.18 },
    ]),
    recent_form: weightedAverage([
      { value: diffHigherBetter(team.form.last10_win_pct, opponent.form.last10_win_pct, 0.25), weight: 0.45 },
      { value: diffHigherBetter(team.form.run_diff, opponent.form.run_diff, 10), weight: 0.55 },
    ]),
    park_factor: clamp((parkEnv * offenseDelta) + (parkEnv * ((diffHigherBetter(team.lineup.avg_barrel, opponent.lineup.avg_barrel, 4) ?? 0) * 0.35)), -1, 1),
    weather_impact: clamp((weatherWindBias * 0.65) + (weatherSuppressionBias * 0.35), -1, 1),
    defensive_surrogate: weightedAverage([
      { value: diffLowerBetter(team.defensive_surrogate.starter_xwoba, opponent.defensive_surrogate.starter_xwoba, 0.03), weight: 0.55 },
      { value: diffLowerBetter(team.defensive_surrogate.bullpen_era, opponent.defensive_surrogate.bullpen_era, 0.65), weight: 0.45 },
    ]),
    travel_fatigue: clamp((opponent.travel.proxy_penalty - team.travel.proxy_penalty), -1, 1),
  };

  return components;
}

function computeMissingPenalty(game, team) {
  const requiredFields = [
    team.starter.era,
    team.starter.whip,
    team.starter.k9,
    team.starter.xera,
    team.bullpen.era,
    team.lineup.avg_ops,
    team.lineup.avg_xwoba,
    team.lineup.avg_split_ops,
    team.form.runs_per_game,
    team.market_current_implied_probability,
    game.weather?.combined?.wind_speed_mph ?? null,
    game.advanced_sabermetrics?.park_factor?.overall ?? null,
  ];

  const missingRatio = countMissing(requiredFields) / requiredFields.length;
  return round(missingRatio * 18, 3);
}

function computeVolatility(team, opponent, total) {
  const starterVariance = average([team.starter.recent_er_stddev, opponent.starter.recent_er_stddev]) ?? 0;
  const bullpenStress = average([team.bullpen.fatigue_num, opponent.bullpen.fatigue_num]) ?? 0;
  const windFactor = team.weather.wind_mph !== null ? clamp(team.weather.wind_mph / 18, 0, 1) : 0.2;
  const totalFactor = total !== null && total !== undefined ? clamp((total - 7) / 4, 0, 1) : 0.4;
  const openerRisk = ((team.starter.pitch_count ?? 75) < 55 || (opponent.starter.pitch_count ?? 75) < 55) ? 1 : 0;
  const marketCoinflip = team.market_current_implied_probability !== null && opponent.market_current_implied_probability !== null
    ? 1 - Math.abs(team.market_current_implied_probability - opponent.market_current_implied_probability)
    : 0.5;

  return round(clamp(((starterVariance / 3.5) * 0.28) + (bullpenStress * 0.24) + (windFactor * 0.15) + (totalFactor * 0.15) + (openerRisk * 0.10) + (marketCoinflip * 0.08), 0, 1) * 100, 2);
}

function detectFlags(game, team, opponent, fairProb, marketProb, componentScores) {
  const flags = [];
  const openProb = team.market_open_implied_probability;
  const currentProb = marketProb;
  const move = openProb !== null && currentProb !== null ? currentProb - openProb : null;
  const edge = fairProb !== null && currentProb !== null ? fairProb - currentProb : null;
  const publicBias = PUBLIC_BIAS_TEAMS.has(team.name);

  if (team.market_current_american !== null && team.market_current_american > 0 && edge !== null && edge >= 0.04) {
    flags.push('undervalued_underdog');
  }
  if (team.market_current_american !== null && team.market_current_american < 0 && edge !== null && edge <= -0.035) {
    flags.push('overpriced_favorite');
  }
  if (team.bullpen.fatigue === 'heavy' || team.bullpen.closer_status === 'high_risk') {
    flags.push('bullpen_exhaustion');
  }
  if ((team.lineup.avg_ops ?? 0) < 0.69 || (team.lineup.avg_split_ops ?? 0) < 0.70) {
    flags.push('lineup_weakness');
  }
  if (move !== null && Math.abs(move) >= 0.045 && Math.abs((componentScores.starter_edge ?? 0) + (componentScores.lineup_quality ?? 0)) < 0.20) {
    flags.push('market_overreaction');
  }
  if (move !== null && move > 0.025 && team.market_current_american !== null && team.market_current_american > 0 && edge !== null && edge > 0) {
    flags.push('reverse_line_movement_candidate');
  }
  if (publicBias && move !== null && move > 0.02 && edge !== null && edge < 0) {
    flags.push('public_bias_indicator');
  }

  const total = game.market?.total?.current ?? null;
  const park = game.advanced_sabermetrics?.park_factor?.overall ?? null;
  const wind = game.weather?.combined?.wind_speed_mph ?? null;
  const rain = game.weather?.combined?.rain_probability_pct ?? null;

  if (total !== null && park !== null && wind !== null) {
    if (total <= 8 && park >= 103 && wind >= 10) {
      flags.push('weather_mismatch_over');
    }
    if (total >= 9.5 && ((park <= 98) || (rain !== null && rain >= 30))) {
      flags.push('weather_mismatch_under');
    }
  }

  return flags;
}

function buildRiskFactors(game, sideAnalysis) {
  const risks = [];
  if (sideAnalysis.uncertainty_score >= 40) {
    risks.push(`Uncertainty elevated at ${formatNum(sideAnalysis.uncertainty_score, 1)}.`);
  }
  if (sideAnalysis.volatility_score >= 60) {
    risks.push(`Volatility elevated at ${formatNum(sideAnalysis.volatility_score, 1)}.`);
  }
  if (!game.lineups[sideAnalysis.side].status || !/confirmed/i.test(game.lineups[sideAnalysis.side].status)) {
    risks.push('Lineup not fully confirmed.');
  }
  if (!game.starting_pitchers[sideAnalysis.side]?.xFIP) {
    risks.push('xFIP unavailable.');
  }
  if (game.bullpen[sideAnalysis.side]?.fatigue_indicator === 'heavy') {
    risks.push('Bullpen workload is heavy.');
  }
  if ((game.weather?.combined?.rain_probability_pct ?? 0) >= 35) {
    risks.push(`Rain probability ${game.weather.combined.rain_probability_pct}%.`);
  }
  return risks;
}

function buildLean(sideAnalysis) {
  if (sideAnalysis.final_edge_score >= 12 && sideAnalysis.confidence_score >= 62) return 'Bettable lean';
  if (sideAnalysis.final_edge_score >= 6 && sideAnalysis.confidence_score >= 55) return 'Watchlist lean';
  if (sideAnalysis.final_edge_score <= -8) return 'Fade / avoid price';
  return 'No action edge';
}

function analyzeGame(game, meta) {
  const total = game.market?.total?.current ?? null;
  const home = buildTeamView(game, 'home');
  const away = buildTeamView(game, 'away');

  const homeComponents = computeComponentSet(home, away, total);
  const awayComponents = computeComponentSet(away, home, total);

  const homeFundamental = round(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + ((homeComponents[key] ?? 0) * weight), 0), 4);
  const awayFundamental = round(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + ((awayComponents[key] ?? 0) * weight), 0), 4);

  const edgeSpread = round((homeFundamental - awayFundamental) * 1.0, 4);
  const homeFairProb = round(logistic(edgeSpread), 4);
  const awayFairProb = round(1 - homeFairProb, 4);

  home.market_price_value = homeFairProb !== null && home.market_current_implied_probability !== null
    ? round(homeFairProb - home.market_current_implied_probability, 4)
    : null;
  away.market_price_value = awayFairProb !== null && away.market_current_implied_probability !== null
    ? round(awayFairProb - away.market_current_implied_probability, 4)
    : null;

  const homeMarketMoveScore = marketMoveScore(home, away);
  const awayMarketMoveScore = marketMoveScore(away, home);

  const sharedVolatility = computeVolatility(home, away, total);
  const sourceConf = sourceConfidence(meta);
  const sharedPenalty = average([
    computeMissingPenalty(game, home),
    computeMissingPenalty(game, away),
  ], 4) ?? 0;

  const buildSideAnalysis = (team, opponent, fairProb, components, marketMove) => {
    const marketProb = team.market_current_implied_probability;
    const openProb = team.market_open_implied_probability;
    const edgeVsMarket = fairProb !== null && marketProb !== null ? round((fairProb - marketProb) * 100, 2) : null;
    const lineMove = marketProb !== null && openProb !== null ? round((marketProb - openProb) * 100, 2) : null;
    const missingPenalty = computeMissingPenalty(game, team);
    const dataPenalty = round((missingPenalty + sharedPenalty) / 2, 3);
    const sourcePenalty = round((1 - sourceConf) * 12, 3);
    const volatilityPenalty = round(sharedVolatility * 0.08, 3);
    const uncertaintyScore = round(clamp(
      18 +
      (dataPenalty * 2.0) +
      sourcePenalty +
      (sharedVolatility * 0.18) +
      (!team.lineup.confirmed ? 8 : 0) +
      (!game.starting_pitchers[team.side]?.xFIP ? 8 : 0) +
      ((team.starter.pitch_count ?? 75) < 55 ? 7 : 0),
      10,
      90
    ), 2);
    const confidenceScore = round(clamp(
      (sourceConf * 55) +
      ((100 - uncertaintyScore) * 0.35) -
      (sharedVolatility * 0.18),
      25,
      86
    ), 2);
    const marketAdjustment = edgeVsMarket !== null ? clamp(edgeVsMarket / 8, -1.5, 1.5) : 0;
    const finalEdgeScore = round(((team === home ? homeFundamental : awayFundamental) * 18) + (marketAdjustment * 10) + ((marketMove ?? 0) * 3) - (dataPenalty * 0.8) - (volatilityPenalty * 0.4), 2);
    const flags = detectFlags(game, team, opponent, fairProb, marketProb, components);

    return {
      side: team.side,
      team: team.name,
      team_abbreviation: team.abbreviation,
      fundamental_score: round((team === home ? homeFundamental : awayFundamental) * 100, 2),
      fair_win_probability: fairProb,
      fair_moneyline: probToAmerican(fairProb),
      market_implied_probability: marketProb,
      market_american: team.market_current_american,
      open_market_american: team.market_open_american,
      edge_vs_market_pct_points: edgeVsMarket,
      market_move_pct_points: lineMove,
      component_scores: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value, 4)])),
      component_weights: WEIGHTS,
      component_explanations: componentDescriptions(team, opponent),
      market_movement_score: round((marketMove ?? 0) * 100, 2),
      volatility_score: sharedVolatility,
      uncertainty_score: uncertaintyScore,
      incomplete_data_penalty: round(dataPenalty, 2),
      source_confidence_weight: sourceConf,
      confidence_score: confidenceScore,
      final_edge_score: finalEdgeScore,
      flags,
      risk_factors: [],
      preliminary_lean: null,
    };
  };

  const homeAnalysis = buildSideAnalysis(home, away, homeFairProb, homeComponents, homeMarketMoveScore);
  const awayAnalysis = buildSideAnalysis(away, home, awayFairProb, awayComponents, awayMarketMoveScore);
  homeAnalysis.risk_factors = buildRiskFactors(game, homeAnalysis);
  awayAnalysis.risk_factors = buildRiskFactors(game, awayAnalysis);
  homeAnalysis.preliminary_lean = buildLean(homeAnalysis);
  awayAnalysis.preliminary_lean = buildLean(awayAnalysis);

  const rankedSides = [homeAnalysis, awayAnalysis].sort((a, b) => b.final_edge_score - a.final_edge_score);
  const bestSide = rankedSides[0];

  return {
    game_id: game.game_id,
    date: game.date,
    matchup: game.matchup,
    original_market: game.market,
    original_weather: game.weather,
    scoring: {
      model_version: 'mlb_quant_engine_v1',
      home: homeAnalysis,
      away: awayAnalysis,
      edge_spread: round(edgeSpread, 4),
      total_environment: {
        market_total: total,
        park_factor: game.advanced_sabermetrics?.park_factor?.overall ?? null,
        weather_wind_mph: game.weather?.combined?.wind_speed_mph ?? null,
        weather_temp_f: game.weather?.combined?.temperature_f ?? null,
        rain_probability_pct: game.weather?.combined?.rain_probability_pct ?? null,
      },
      best_edge: {
        side: bestSide.side,
        team: bestSide.team,
        final_edge_score: bestSide.final_edge_score,
        fair_win_probability: bestSide.fair_win_probability,
        market_implied_probability: bestSide.market_implied_probability,
        edge_vs_market_pct_points: bestSide.edge_vs_market_pct_points,
        confidence_score: bestSide.confidence_score,
        volatility_score: bestSide.volatility_score,
        flags: bestSide.flags,
        preliminary_lean: bestSide.preliminary_lean,
      },
      market_diagnostics: {
        public_bias_present: PUBLIC_BIAS_TEAMS.has(game.matchup.home.team) || PUBLIC_BIAS_TEAMS.has(game.matchup.away.team),
        strongest_market_mover: rankedSides
          .slice()
          .sort((a, b) => Math.abs(b.market_move_pct_points ?? 0) - Math.abs(a.market_move_pct_points ?? 0))[0]?.team ?? null,
      },
    },
  };
}

function buildTopEdges(scoredGames) {
  return scoredGames
    .flatMap((game) => [
      {
        date: game.date,
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side: game.scoring.home.side,
        team: game.scoring.home.team,
        opponent: game.scoring.away.team,
        stadium: game.matchup.stadium,
        game_time_local: game.matchup.game_time_local,
        final_edge_score: game.scoring.home.final_edge_score,
        fair_win_probability: game.scoring.home.fair_win_probability,
        market_implied_probability: game.scoring.home.market_implied_probability,
        edge_vs_market_pct_points: game.scoring.home.edge_vs_market_pct_points,
        confidence_score: game.scoring.home.confidence_score,
        volatility_score: game.scoring.home.volatility_score,
        market_american: game.scoring.home.market_american,
        fair_moneyline: game.scoring.home.fair_moneyline,
        flags: game.scoring.home.flags.join('|'),
        lean: game.scoring.home.preliminary_lean,
      },
      {
        date: game.date,
        game_id: game.game_id,
        matchup: `${game.matchup.away.team} @ ${game.matchup.home.team}`,
        side: game.scoring.away.side,
        team: game.scoring.away.team,
        opponent: game.scoring.home.team,
        stadium: game.matchup.stadium,
        game_time_local: game.matchup.game_time_local,
        final_edge_score: game.scoring.away.final_edge_score,
        fair_win_probability: game.scoring.away.fair_win_probability,
        market_implied_probability: game.scoring.away.market_implied_probability,
        edge_vs_market_pct_points: game.scoring.away.edge_vs_market_pct_points,
        confidence_score: game.scoring.away.confidence_score,
        volatility_score: game.scoring.away.volatility_score,
        market_american: game.scoring.away.market_american,
        fair_moneyline: game.scoring.away.fair_moneyline,
        flags: game.scoring.away.flags.join('|'),
        lean: game.scoring.away.preliminary_lean,
      },
    ])
    .sort((a, b) => b.final_edge_score - a.final_edge_score);
}

function buildReport(scoredGames, topEdges, meta) {
  const lines = [
    '# MLB Edge Report',
    '',
    `Date: ${meta.date}`,
    '',
    '## Highest Rated Edges',
    '',
  ];

  for (const edge of topEdges.slice(0, 8)) {
    const game = scoredGames.find((item) => item.game_id === edge.game_id);
    const analysis = game.scoring[edge.side];
    lines.push('### Game');
    lines.push('');
    lines.push(`${game.matchup.away.team} vs ${game.matchup.home.team}`);
    lines.push('');
    lines.push('### Quant Score');
    lines.push('');
    lines.push(`${edge.team}: ${formatNum(edge.final_edge_score, 2)} | Confidence ${formatNum(edge.confidence_score, 1)} | Volatility ${formatNum(edge.volatility_score, 1)}`);
    lines.push('');
    lines.push('### Market Discrepancy');
    lines.push('');
    lines.push(`Fair win probability ${formatPct(edge.fair_win_probability)} vs market ${formatPct(edge.market_implied_probability)}. Fair line ${edge.fair_moneyline ?? 'n/a'} vs market ${edge.market_american ?? 'n/a'}.`);
    lines.push('');
    lines.push('### Risk Factors');
    lines.push('');
    lines.push(analysis.risk_factors.length ? analysis.risk_factors.join(' ') : 'No major quantified risk flags.');
    lines.push('');
    lines.push('### Preliminary Betting Lean');
    lines.push('');
    lines.push(`${analysis.preliminary_lean}. Flags: ${analysis.flags.length ? analysis.flags.join(', ') : 'none'}.`);
    lines.push('');
  }

  lines.push('## Scoring Logic');
  lines.push('');
  lines.push('Fundamental score blends starter quality, bullpen stability, lineup strength, handedness splits, offensive form, recent form, park/weather context, defensive surrogate, and travel proxy. Market edge is then measured as fair win probability minus current implied probability, with uncertainty and volatility penalties applied before ranking.');
  lines.push('');
  lines.push('## Historical Foundation');
  lines.push('');
  lines.push('This output is ready for backtesting, CLV analysis, ROI tracking, model drift checks, and calibration review because each side keeps fair probability, market price, edge delta, confidence, volatility, and component-level transparency.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const dataset = readJson(INPUT_PATH);
  const scoredGames = dataset.games.map((game) => analyzeGame(game, dataset.meta));
  const topEdges = buildTopEdges(scoredGames);

  const output = {
    meta: {
      date: dataset.meta.date,
      generated_at: new Date().toISOString(),
      source_dataset_generated_at: dataset.meta.generated_at,
      scoring_model: {
        name: 'mlb_quant_engine_v1',
        philosophy: 'Interpretability-first transparent scoring with explicit penalties for uncertainty and missing data.',
        weights: WEIGHTS,
      },
      source_confidence: sourceConfidence(dataset.meta),
      historical_foundation: {
        backtesting_ready: true,
        clv_ready: true,
        roi_tracking_ready: true,
        calibration_ready: true,
        model_drift_ready: true,
        future_extensions: [
          'Live odds snapshots',
          'Intraday market tracking',
          'Alert routing to Telegram/Discord',
          'SQLite/Postgres persistence',
          'Dashboard visualization',
          'EV and CLV tracking',
        ],
      },
      missing_data: dataset.meta.source_summary?.missing_data || [],
      source_health: dataset.meta.source_health || [],
    },
    rankings: {
      top_edges: topEdges,
      highest_confidence: [...topEdges].sort((a, b) => b.confidence_score - a.confidence_score).slice(0, 10),
      lowest_volatility: [...topEdges].sort((a, b) => a.volatility_score - b.volatility_score).slice(0, 10),
    },
    games: scoredGames,
  };

  writeJson(SCORED_JSON_PATH, output);
  writeText(TOP_EDGES_CSV_PATH, toCsv(topEdges));
  writeText(EDGE_REPORT_PATH, buildReport(scoredGames, topEdges, output.meta));

  console.log(JSON.stringify({
    outputs: [
      path.relative(process.cwd(), SCORED_JSON_PATH),
      path.relative(process.cwd(), TOP_EDGES_CSV_PATH),
      path.relative(process.cwd(), EDGE_REPORT_PATH),
    ],
    top_edge: topEdges[0] || null,
  }, null, 2));
}

main();
