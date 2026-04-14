const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');

/** Fenêtre pour enchaîner 3 sanctions (niveau 3) : 90 jours */
const STRIKE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const defaultData = () => ({
  total: 0,
  monthKey: '',
  monthCount: 0,
  dayKey: '',
  dayCount: 0,
  blacklist: {},
  guilds: {},
  strikes: {},
});

function load() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultData(),
      ...parsed,
      blacklist: parsed.blacklist && typeof parsed.blacklist === 'object' ? parsed.blacklist : {},
      guilds: parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {},
      strikes: parsed.strikes && typeof parsed.strikes === 'object' ? parsed.strikes : {},
    };
  } catch {
    return defaultData();
  }
}

function save(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeCounters(data) {
  const mk = currentMonthKey();
  const dk = currentDayKey();
  if (data.monthKey !== mk) {
    data.monthKey = mk;
    data.monthCount = 0;
  }
  if (data.dayKey !== dk) {
    data.dayKey = dk;
    data.dayCount = 0;
  }
  return data;
}

function pruneBlacklist(data) {
  const now = Date.now();
  const bl = { ...data.blacklist };
  for (const [userId, iso] of Object.entries(bl)) {
    const end = new Date(iso).getTime();
    if (Number.isNaN(end) || end <= now) {
      delete bl[userId];
    }
  }
  data.blacklist = bl;
  return data;
}

function ensureGuild(data, guildId) {
  if (!data.guilds) data.guilds = {};
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      total: 0,
      monthKey: '',
      monthCount: 0,
      dayKey: '',
      dayCount: 0,
    };
  }
  return data.guilds[guildId];
}

function normalizeGuildCounters(g) {
  const mk = currentMonthKey();
  const dk = currentDayKey();
  if (g.monthKey !== mk) {
    g.monthKey = mk;
    g.monthCount = 0;
  }
  if (g.dayKey !== dk) {
    g.dayKey = dk;
    g.dayCount = 0;
  }
  return g;
}

function getGuildSnapshot(data, guildId) {
  const g = ensureGuild(data, guildId);
  normalizeGuildCounters(g);
  return g;
}

function incrementSanctions(data, guildId) {
  data = normalizeCounters(data);
  data.total += 1;
  data.monthCount += 1;
  data.dayCount += 1;
  if (guildId) {
    const g = ensureGuild(data, guildId);
    normalizeGuildCounters(g);
    g.total += 1;
    g.monthCount += 1;
    g.dayCount += 1;
  }
  save(data);
  return data;
}

function pruneStrikes(data) {
  if (!data.strikes) data.strikes = {};
  const cutoff = Date.now() - STRIKE_WINDOW_MS;
  for (const userId of Object.keys(data.strikes)) {
    const arr = (data.strikes[userId] || []).filter((iso) => {
      const t = new Date(iso).getTime();
      return !Number.isNaN(t) && t > cutoff;
    });
    if (arr.length === 0) delete data.strikes[userId];
    else data.strikes[userId] = arr;
  }
  return data;
}

function strikeCount(data, userId) {
  const arr = data.strikes?.[userId];
  return Array.isArray(arr) ? arr.length : 0;
}

function addStrike(data, userId) {
  if (!data.strikes) data.strikes = {};
  if (!data.strikes[userId]) data.strikes[userId] = [];
  data.strikes[userId].push(new Date().toISOString());
  pruneStrikes(data);
  save(data);
  return data;
}

module.exports = {
  load,
  save,
  normalizeCounters,
  normalizeGuildCounters,
  pruneBlacklist,
  pruneStrikes,
  strikeCount,
  addStrike,
  incrementSanctions,
  currentMonthKey,
  currentDayKey,
  ensureGuild,
  getGuildSnapshot,
};
