// Karigar Tech Relay — tiny cloud collector.
// Receives silent "phone home" pings from Karigar Slip Register installations
// and stores them so the local Tech Panel (on your own PC) can sync/pull them.
//
// No customer/business financial data is ever sent here — only:
//   installation_id, app version, platform, business names + created dates, timestamp.

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "relay.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS installations (
    installation_id TEXT PRIMARY KEY,
    app TEXT,
    version TEXT,
    platform TEXT,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    ping_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS business_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    installation_id TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_created_at TEXT,
    seen_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (installation_id) REFERENCES installations(installation_id)
  );
`);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Simple API key check for the Tech Panel pull endpoint (not for the ping endpoint —
// installations shouldn't need a secret to phone home).
const TECH_PANEL_KEY = process.env.TECH_PANEL_KEY || "change-me-please";

// ── Ping endpoint — hit by every Karigar Slip installation ─────────────────
app.post("/api/ping", (req, res) => {
  try {
    const { installation_id, app: appName, version, platform, businesses = [] } = req.body || {};
    if (!installation_id) return res.status(400).json({ error: "installation_id required" });

    const existing = db.prepare("SELECT * FROM installations WHERE installation_id=?").get(installation_id);
    if (existing) {
      db.prepare("UPDATE installations SET last_seen=datetime('now'), ping_count=ping_count+1, version=?, platform=? WHERE installation_id=?")
        .run(version || existing.version, platform || existing.platform, installation_id);
    } else {
      db.prepare("INSERT INTO installations (installation_id, app, version, platform) VALUES (?,?,?,?)")
        .run(installation_id, appName || "karigar-slip-register", version || "", platform || "");
    }

    // Store a fresh snapshot of business names for this installation (dedupe by name)
    const insertBiz = db.prepare("INSERT INTO business_snapshots (installation_id, business_name, business_created_at) VALUES (?,?,?)");
    const existingNames = new Set(
      db.prepare("SELECT DISTINCT business_name FROM business_snapshots WHERE installation_id=?").all(installation_id).map(r => r.business_name)
    );
    for (const b of businesses) {
      if (b?.name && !existingNames.has(b.name)) {
        insertBiz.run(installation_id, b.name, b.created_at || null);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Ping error:", e.message);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Tech Panel pull endpoints — require key ─────────────────────────────────
function requireKey(req, res, next) {
  const key = req.headers["x-tech-key"] || req.query.key;
  if (key !== TECH_PANEL_KEY) return res.status(401).json({ error: "Invalid key" });
  next();
}

app.get("/api/installations", requireKey, (req, res) => {
  const rows = db.prepare("SELECT * FROM installations ORDER BY last_seen DESC").all();
  res.json(rows);
});

app.get("/api/businesses", requireKey, (req, res) => {
  const rows = db.prepare(`
    SELECT bs.*, i.platform, i.version FROM business_snapshots bs
    JOIN installations i ON i.installation_id = bs.installation_id
    ORDER BY bs.seen_at DESC
  `).all();
  res.json(rows);
});

app.get("/api/summary", requireKey, (req, res) => {
  const totalInstallations = db.prepare("SELECT COUNT(*) as c FROM installations").get().c;
  const totalBusinesses = db.prepare("SELECT COUNT(DISTINCT business_name || installation_id) as c FROM business_snapshots").get().c;
  const activeToday = db.prepare("SELECT COUNT(*) as c FROM installations WHERE last_seen >= datetime('now','-1 day')").get().c;
  const activeWeek = db.prepare("SELECT COUNT(*) as c FROM installations WHERE last_seen >= datetime('now','-7 day')").get().c;
  res.json({ totalInstallations, totalBusinesses, activeToday, activeWeek });
});

app.get("/", (req, res) => res.send("Karigar Tech Relay — running ✓"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Tech relay running on port ${PORT}`));
