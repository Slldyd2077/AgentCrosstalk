// Sync src/version.ts from package.json's version.
// Run by the `version` npm lifecycle script during `npm version patch|minor|major`,
// so the code-side VERSION stays in lockstep with package.json before the bump commit.
import { readFileSync, writeFileSync } from "node:fs";

const root = (rel) => new URL(rel, import.meta.url);
const pkg = JSON.parse(readFileSync(root("../package.json"), "utf8"));

const content = `/** Single source for the \`act\` version (synced from package.json by \`npm version\`). */
export const VERSION = "${pkg.version}";
`;
writeFileSync(root("../src/version.ts"), content);
console.log(`synced src/version.ts → ${pkg.version}`);
