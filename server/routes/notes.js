const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const notesPath = path.join(__dirname, "..", "data", "notes.json");

async function readNotes() {
  const raw = await fs.readFile(notesPath, "utf-8");
  return JSON.parse(raw);
}

async function writeNotes(notes) {
  const json = JSON.stringify(notes, null, 2);
  await fs.writeFile(notesPath, json, "utf-8");
}

router.get("/", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const page = Math.max(1, Number(req.query.page) || 1);
    const q = String(req.query.q || "").trim().toLowerCase();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;

    const filtered = notes.filter((note) => {
      if (!q) return true;
      return String(note.text || "").toLowerCase().includes(q);
    });

    const dateFiltered = filtered.filter((note) => {
      const timestamp = new Date(note.updatedAt || note.createdAt).getTime();
      if (Number.isFinite(fromTime) && timestamp < fromTime) return false;
      if (Number.isFinite(toTime) && timestamp > toTime) return false;
      return true;
    });

    const sorted = dateFiltered.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit);

    res.json({ items, total, page, totalPages });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) {
      res.status(400).send("Note text is required.");
      return;
    }

    const now = new Date().toISOString();
    const note = {
      id: crypto.randomUUID(),
      text,
      createdAt: now,
      updatedAt: now,
      pinned: Boolean(req.body.pinned),
      tag: req.body.tag ? String(req.body.tag).trim() : ""
    };

    const notes = await readNotes();
    notes.push(note);
    await writeNotes(notes);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const note = notes.find((item) => item.id === req.params.id);
    if (!note) {
      res.status(404).json({ ok: false });
      return;
    }

    if (req.body.text !== undefined) {
      const text = String(req.body.text || "").trim();
      if (!text) {
        res.status(400).send("Note text is required.");
        return;
      }
      note.text = text;
    }
    if (req.body.pinned !== undefined) {
      note.pinned = Boolean(req.body.pinned);
    }
    if (req.body.tag !== undefined) {
      note.tag = String(req.body.tag || "").trim();
    }
    note.updatedAt = new Date().toISOString();

    await writeNotes(notes);
    res.json(note);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const index = notes.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ ok: false });
      return;
    }
    notes.splice(index, 1);
    await writeNotes(notes);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
