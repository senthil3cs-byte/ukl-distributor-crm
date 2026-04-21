onst express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'Admin'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT,
      district TEXT,
      distributor_name TEXT,
      mobile TEXT,
      email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const admin = await get(`SELECT * FROM users WHERE username = ?`, ["admin"]);
  if (!admin) {
    await run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [
      "admin",
      "1234",
      "Admin",
    ]);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await get(
      `SELECT id, username, role FROM users WHERE username = ? AND password = ?`,
      [username || "", password || ""]
    );
    if (!user) return res.status(401).json({ error: "Invalid login" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/distributors", async (_req, res) => {
  try {
    const rows = await all(`SELECT * FROM distributors ORDER BY id DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/distributors", async (req, res) => {
  try {
    const { state, district, distributor_name, mobile, email } = req.body || {};
    if (!district || !distributor_name) {
      return res.status(400).json({ error: "District and Distributor Name are required" });
    }
    const result = await run(
      `INSERT INTO distributors (state, district, distributor_name, mobile, email, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [state || "Tamil Nadu", district, distributor_name, mobile || "", email || ""]
    );
    const row = await get(`SELECT * FROM distributors WHERE id = ?`, [result.lastID]);
    res.json({ success: true, row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/distributors/:id", async (req, res) => {
  try {
    const { state, district, distributor_name, mobile, email } = req.body || {};
    await run(
      `UPDATE distributors
       SET state = ?, district = ?, distributor_name = ?, mobile = ?, email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [state || "Tamil Nadu", district || "", distributor_name || "", mobile || "", email || "", req.params.id]
    );
    const row = await get(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
    res.json({ success: true, row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/distributors/:id", async (req, res) => {
  try {
    await run(`DELETE FROM distributors WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log("Server running on " + PORT));
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
