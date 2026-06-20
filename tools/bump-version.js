const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const versionPath = path.join(root, "version.json");
const storagePath = path.join(root, "scripts", "10-storage-native.js");
const swPath = path.join(root, "sw.js");
const packagePath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, text) {
  fs.writeFileSync(file, text);
}

function currentVersion() {
  const json = JSON.parse(read(versionPath));
  return Number(json.v) || 0;
}

const raw = process.argv[2];
const next = raw ? Number(raw) : currentVersion() + 1;
if (!Number.isInteger(next) || next <= 0) {
  console.error("Usage: node tools/bump-version.js [positive-integer-version]");
  process.exit(1);
}

let storage = read(storagePath);
storage = storage.replace(/const APP_VER=\d+;/, `const APP_VER=${next};`);
write(storagePath, storage);

write(versionPath, `{ "v": ${next} }\n`);

let sw = read(swPath);
sw = sw.replace(/archery-note-v\d+/, `archery-note-v${next}`);
write(swPath, sw);

const pkg = JSON.parse(read(packagePath));
pkg.version = `0.${next}.0`;
write(packagePath, JSON.stringify(pkg, null, 2) + "\n");

if (fs.existsSync(packageLockPath)) {
  const lock = JSON.parse(read(packageLockPath));
  lock.version = `0.${next}.0`;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = `0.${next}.0`;
  }
  write(packageLockPath, JSON.stringify(lock, null, 2) + "\n");
}

console.log(`Archery Note version set to ${next}`);
