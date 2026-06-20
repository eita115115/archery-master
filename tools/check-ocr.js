const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "36-score-ocr.js"), "utf8");

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

assert(source.includes("window.ArcherOCR"), "ArcherOCR export missing");
const stripped = source.replace(/if\s*\(typeof window[\s\S]*$/, "");
const sandbox = { console, Math, Object, Array, Promise, Error, document: { head: { appendChild() {} }, querySelector: () => null }, window: {} };
sandbox.__exports = {};
vm.createContext(sandbox);
vm.runInContext(`${stripped}
__exports.parseOcrLines = parseOcrLines;
__exports.normalizeOcrToken = normalizeOcrToken;
`, sandbox);

const { parseOcrLines, normalizeOcrToken } = sandbox.__exports;
assert(normalizeOcrToken("X") === "X", "normalize X");
assert(normalizeOcrToken("10") === "10", "normalize 10");
assert(normalizeOcrToken("m") === "M", "normalize M");
const ends = parseOcrLines("X 10 9 9 8 7\n10 10 9 8 8 M");
assert(ends.length >= 2, "parseOcrLines should split ends");
assert(ends[0].length === 6, "first end should have 6 arrows");
console.log("OCR checks OK");