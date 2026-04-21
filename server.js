const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'ukl.db');
const upload = multer({ dest: path.join(DATA_DIR, 'uploads') });

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    login_name TEXT UNIQUE,
    password TEXT,
    role TEXT,
    is_active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS distributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT,
    district TEXT,
    distributor_name TEXT,
    mobile TEXT,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.get(`SELECT COUNT(*) as c FROM users`, [], (err, row) => {
    if (!err && row && row.c === 0) {
      db.run(`INSERT INTO users (username, login_name, password, role, is_active)
              VALUES ('Admin', 'admin', '1234', 'Admin', 1)`);
    }
  });
});

const tnDistrictCoords = {
  Ariyalur: { x: 188, y: 160 }, Chengalpattu: { x: 235, y: 125 }, Chennai: { x: 245, y: 110 },
  Coimbatore: { x: 95, y: 245 }, Cuddalore: { x: 220, y: 145 }, Dharmapuri: { x: 155, y: 180 },
  Dindigul: { x: 145, y: 245 }, Erode: { x: 118, y: 215 }, Kallakurichi: { x: 185, y: 165 },
  Kancheepuram: { x: 225, y: 120 }, Karur: { x: 145, y: 215 }, Krishnagiri: { x: 165, y: 160 },
  Madurai: { x: 165, y: 275 }, Mayiladuthurai: { x: 218, y: 160 }, Nagapattinam: { x: 225, y: 172 },
  Namakkal: { x: 140, y: 205 }, Nilgiris: { x: 92, y: 205 }, Perambalur: { x: 178, y: 172 },
  Pudukkottai: { x: 182, y: 248 }, Ramanathapuram: { x: 215, y: 295 }, Ranipet: { x: 210, y: 130 },
  Salem: { x: 145, y: 190 }, Sivaganga: { x: 190, y: 278 }, Tenkasi: { x: 125, y: 338 },
  Thanjavur: { x: 195, y: 210 }, Theni: { x: 135, y: 285 }, Thiruvallur: { x: 230, y: 105 },
  Thiruvarur: { x: 205, y: 195 }, Thoothukudi: { x: 165, y: 355 }, Tiruchirappalli: { x: 170, y: 205 },
  Tirunelveli: { x: 145, y: 350 }, Tirupathur: { x: 185, y: 155 }, Tiruppur: { x: 108, y: 230 },
  Tiruvannamalai: { x: 195, y: 148 }, Vellore: { x: 198, y: 138 }, Viluppuram: { x: 205, y: 155 },
  Virudhunagar: { x: 160, y: 312 }
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.post('/api/login', (req, res) => {
  const { login_name, password } = req.body || {};
  db.get(`SELECT id, username, login_name, role FROM users WHERE login_name=? AND password=? AND is_active=1`, [login_name, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid login' });
    res.json({ success: true, user: row });
  });
});

app.get('/api/distributors', (req, res) => {
  db.all(`SELECT * FROM distributors ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/distributors', (req, res) => {
  const { state, district, distributor_name, mobile, email } = req.body || {};
  db.run(
    `INSERT INTO distributors(state,district,distributor_name,mobile,email) VALUES(?,?,?,?,?)`,
    [state || 'Tamil Nadu', district || '', distributor_name || '', mobile || '', email || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/distributors/:id', (req, res) => {
  const { state, district, distributor_name, mobile, email } = req.body || {};
  db.run(
    `UPDATE distributors SET state=?, district=?, distributor_name=?, mobile=?, email=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [state || 'Tamil Nadu', district || '', distributor_name || '', mobile || '', email || '', req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    }
  );
});

app.delete('/api/distributors/:id', (req, res) => {
  db.run(`DELETE FROM distributors WHERE id=?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

app.post('/api/import-excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    let inserted = 0, skipped = 0;

    const normalize = (row) => {
      const keys = Object.keys(row).reduce((acc, k) => {
        acc[String(k).trim().toLowerCase()] = row[k];
        return acc;
      }, {});
      return {
        state: String(keys['state'] || keys['state name'] || 'Tamil Nadu').trim(),
        district: String(keys['district'] || keys['district name'] || '').trim(),
        distributor_name: String(keys['distributor name'] || keys['distributor'] || keys['name'] || '').trim(),
        mobile: String(keys['mobile'] || keys['phone'] || keys['mobile no'] || '').trim(),
        email: String(keys['email'] || keys['email id'] || '').trim()
      };
    };

    const stmt = db.prepare(`INSERT INTO distributors(state,district,distributor_name,mobile,email) VALUES(?,?,?,?,?)`);
    rows.forEach(row => {
      const r = normalize(row);
      if (!r.district) { skipped++; return; }
      stmt.run([r.state, r.district, r.distributor_name, r.mobile, r.email]);
      inserted++;
    });
    stmt.finalize((err) => {
      fs.unlink(req.file.path, () => {});
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, inserted, skipped, totalRows: rows.length });
    });
  } catch (e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/map-config', (req, res) => {
  res.json(tnDistrictCoords);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`UKL app running on ${PORT}`));
