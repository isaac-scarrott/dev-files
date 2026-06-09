#!/usr/bin/env node
// Live bridge for understand-codebase-architecture maps.
// Serves the map and turns in-page questions into files the Claude session answers.
// No dependencies (node: builtins only). Binds to 127.0.0.1 only.
//
//   BRIDGE_DIR=/path/to/workdir MAP_FILE=/path/to/map.html node bridge-server.mjs
//
// Prints `BRIDGE_URL=http://127.0.0.1:<port>` once listening. Contract:
//   a question  -> BRIDGE_DIR/inbox/<id>.json  { id, question, context, ts }
//   your answer -> BRIDGE_DIR/outbox/<id>.txt   (plain text)
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DIR = process.env.BRIDGE_DIR;
const MAP_FILE = process.env.MAP_FILE;
const PORT = Number(process.env.PORT || 0); // 0 = ephemeral; the chosen port is printed
if (!DIR || !MAP_FILE) {
  console.error("BRIDGE_DIR and MAP_FILE are required");
  process.exit(1);
}
const inbox = path.join(DIR, "inbox");
const outbox = path.join(DIR, "outbox");
await mkdir(inbox, { recursive: true });
await mkdir(outbox, { recursive: true });

const answerPath = (id) => path.join(outbox, `${id.replace(/[^a-z0-9-]/gi, "")}.txt`);
const sendJson = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
};
const body = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => ((d += c), d.length > 1e6 && req.destroy()));
    req.on("end", () => resolve(d));
  });
const waitForAnswer = async (id, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (existsSync(answerPath(id))) return readFile(answerPath(id), "utf8");
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/map")) {
      const html = await readFile(MAP_FILE, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(html);
    }
    if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true });
    if (req.method === "POST" && url.pathname === "/ask") {
      const data = JSON.parse((await body(req)) || "{}");
      const question = String(data.question || "").trim().slice(0, 2000);
      if (!question) return sendJson(res, 400, { error: "empty question" });
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile(
        path.join(inbox, `${id}.json`),
        JSON.stringify({ id, question, context: data.context ?? null, ts: new Date().toISOString() }, null, 2),
      );
      const answer = await waitForAnswer(id, 100000); // long-poll up to 100s
      return answer === null ? sendJson(res, 202, { id, pending: true }) : sendJson(res, 200, { id, answer });
    }
    if (req.method === "GET" && url.pathname === "/answer") {
      const id = url.searchParams.get("id") || "";
      if (existsSync(answerPath(id))) return sendJson(res, 200, { id, done: true, answer: await readFile(answerPath(id), "utf8") });
      return sendJson(res, 200, { id, done: false });
    }
    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    sendJson(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`BRIDGE_URL=http://127.0.0.1:${server.address().port}`);
});
