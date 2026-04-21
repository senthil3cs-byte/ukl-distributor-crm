const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(express.json());

// ===== DATABASE (SAFE FOR RAILWAY) =====
const dbPath = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbPath);

// Create table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT,
      district TEXT,
      distributor_name TEXT,
      mobile TEXT,
      email TEXT
    )
  `);
});

// ===== API =====
app.get("/api/distributors", (req, res) => {
  db.all("SELECT * FROM distributors", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/api/distributors", (req, res) => {
  const { state, district, distributor_name, mobile, email } = req.body;

  db.run(
    `INSERT INTO distributors(state,district,distributor_name,mobile,email)
     VALUES(?,?,?,?,?)`,
    [state, district, distributor_name, mobile, email],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ===== FRONTEND =====
app.get("/", (req, res) => {
  res.send(`
    <h1>UKL Distributor CRM ✅</h1>
    <p>App is running successfully</p>
    <p>API: <a href="/api/distributors">View Data</a></p>
  `);
});

// ===== PORT FIX =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("Server running on " + PORT));
