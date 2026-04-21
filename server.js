const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
app.use(express.json());

// ===== STORAGE PATH =====
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadDir = path.join(dataDir, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// ===== DATABASE =====
const dbPath = path.join(dataDir, "data.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT,
      district TEXT,
      distributor_name TEXT,
      mobile TEXT,
      email TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safe add if older DB existed before these fields
  db.all(`PRAGMA table_info(distributors)`, [], (err, rows) => {
    if (err) return;

    const cols = rows.map(r => r.name.toLowerCase());

    if (!cols.includes("address")) {
      db.run(`ALTER TABLE distributors ADD COLUMN address TEXT`);
    }
    if (!cols.includes("lat")) {
      db.run(`ALTER TABLE distributors ADD COLUMN lat REAL`);
    }
    if (!cols.includes("lng")) {
      db.run(`ALTER TABLE distributors ADD COLUMN lng REAL`);
    }
    if (!cols.includes("updated_at")) {
      db.run(`ALTER TABLE distributors ADD COLUMN updated_at TEXT`);
    }
  });
});

function norm(v) {
  return String(v || "").trim();
}

function numOrNull(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// ===== LOGIN =====
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === "admin" && password === "1234") {
    return res.json({ success: true, role: "Admin", username: "admin" });
  }

  return res.status(401).json({ success: false, message: "Invalid login" });
});

// ===== GET ALL =====
app.get("/api/distributors", (req, res) => {
  db.all(
    `SELECT * FROM distributors ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ===== ADD =====
app.post("/api/distributors", (req, res) => {
  const {
    state,
    district,
    distributor_name,
    mobile,
    email,
    address,
    lat,
    lng
  } = req.body || {};

  if (!norm(district) || !norm(distributor_name)) {
    return res
      .status(400)
      .json({ error: "District and Distributor Name are required" });
  }

  db.run(
    `INSERT INTO distributors
      (state, district, distributor_name, mobile, email, address, lat, lng, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      norm(state),
      norm(district),
      norm(distributor_name),
      norm(mobile),
      norm(email),
      norm(address),
      numOrNull(lat),
      numOrNull(lng)
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// ===== EDIT =====
app.put("/api/distributors/:id", (req, res) => {
  const {
    state,
    district,
    distributor_name,
    mobile,
    email,
    address,
    lat,
    lng
  } = req.body || {};

  if (!norm(district) || !norm(distributor_name)) {
    return res
      .status(400)
      .json({ error: "District and Distributor Name are required" });
  }

  db.run(
    `UPDATE distributors
        SET state = ?,
            district = ?,
            distributor_name = ?,
            mobile = ?,
            email = ?,
            address = ?,
            lat = ?,
            lng = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
    [
      norm(state),
      norm(district),
      norm(distributor_name),
      norm(mobile),
      norm(email),
      norm(address),
      numOrNull(lat),
      numOrNull(lng),
      req.params.id
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    }
  );
});

// ===== DELETE =====
app.delete("/api/distributors/:id", (req, res) => {
  db.run(
    `DELETE FROM distributors WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    }
  );
});

// ===== EXCEL IMPORT =====
app.post("/api/import-excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: ""
    });

    let inserted = 0;
    let skipped = 0;

    const stmt = db.prepare(`
      INSERT INTO distributors
      (state, district, distributor_name, mobile, email, address, lat, lng, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const row of rows) {
      const lowered = {};
      Object.keys(row).forEach(k => {
        lowered[String(k).trim().toLowerCase()] = row[k];
      });

      const state = norm(lowered["state"] || lowered["state name"] || lowered["st"]);
      const district = norm(
        lowered["district"] || lowered["district name"] || lowered["districts"]
      );
      const distributor = norm(
        lowered["distributor"] ||
          lowered["distributor name"] ||
          lowered["name"] ||
          lowered["dealer"]
      );
      const mobile = norm(
        lowered["mobile"] ||
          lowered["mobile no"] ||
          lowered["phone"] ||
          lowered["contact"]
      );
      const email = norm(
        lowered["email"] || lowered["email id"] || lowered["mail id"]
      );
      const address = norm(
        lowered["address"] || lowered["full address"] || lowered["location"]
      );
      const lat = numOrNull(lowered["lat"] || lowered["latitude"]);
      const lng = numOrNull(lowered["lng"] || lowered["longitude"]);

      if (!district && !distributor && !state) {
        skipped++;
        continue;
      }

      if (!district || !distributor) {
        skipped++;
        continue;
      }

      stmt.run(state, district, distributor, mobile, email, address, lat, lng);
      inserted++;
    }

    stmt.finalize(err => {
      fs.unlink(req.file.path, () => {});
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, inserted, skipped, totalRows: rows.length });
    });
  } catch (e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: e.message });
  }
});

// ===== FRONTEND =====
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== PORT =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Server running on " + PORT);
});
