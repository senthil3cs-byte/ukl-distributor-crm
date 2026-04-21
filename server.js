const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "1234") {
    return res.json({ success: true, role: "Admin", username: "admin" });
  }

  res.status(401).json({ success: false, message: "Invalid login" });
});






app.use(express.json());

// ===== DATABASE =====
const db = new sqlite3.Database("data.db");

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

// ===== SERVE FRONTEND =====
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== PORT =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("Server running on " + PORT));
