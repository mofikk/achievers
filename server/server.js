const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const playersRouter = require("./routes/players");
const attendanceRouter = require("./routes/attendance");
const settingsRouter = require("./routes/settings");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "client")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/players", playersRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/settings", settingsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
