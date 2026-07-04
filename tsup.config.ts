import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "mcp-server": "src/mcp-server.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  splitting: false,
  // Both bin entries are executable Node scripts — give them a shebang.
  banner: { js: "#!/usr/bin/env node" },
});
