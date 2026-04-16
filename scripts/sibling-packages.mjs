import fs from "node:fs";
import path from "node:path";

export const siblingPackages = [
  {
    name: "hare-cli",
    packagePath: path.resolve(process.cwd(), "..", "hare-cli", "package.json"),
  },
  {
    name: "hare-code-desktop",
    packagePath: path.resolve(
      process.cwd(),
      "..",
      "hare-code-desktop",
      "package.json",
    ),
  },
];

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseTargetNames(argv) {
  const targets = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--only") {
      const value = argv[index + 1];
      if (value) {
        targets.push(value);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--only=")) {
      targets.push(arg.slice("--only=".length));
    }
  }
  return new Set(targets);
}

export function selectSiblingPackages(argv) {
  const targetNames = parseTargetNames(argv);
  if (targetNames.size === 0) {
    return siblingPackages;
  }
  return siblingPackages.filter((pkg) => targetNames.has(pkg.name));
}
