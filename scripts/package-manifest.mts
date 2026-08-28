import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve("package.json");
const backupPath = resolve(".package.json.pack-backup");
const [, , action] = process.argv;

if (action === "prepare") {
  if (existsSync(backupPath)) {
    writeFileSync(manifestPath, readFileSync(backupPath));
  }
  const source = readFileSync(manifestPath, "utf8");
  const packed = source.replace(
    / {2}"dependencies": \{\n {4}"@specify-sh\/core": "workspace:\*"\n {2}\},\n/,
    ""
  );
  if (packed === source) {
    throw new Error("Publisher package core dependency was not found");
  }
  writeFileSync(backupPath, source);
  writeFileSync(manifestPath, packed);
} else if (action === "restore" && existsSync(backupPath)) {
  writeFileSync(manifestPath, readFileSync(backupPath));
  rmSync(backupPath);
} else if (action !== "restore") {
  throw new Error("Expected prepare or restore");
}
