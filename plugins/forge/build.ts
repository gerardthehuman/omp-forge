import { mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = import.meta.dir;
const result = await Bun.build({
  entrypoints: [join(root, "src/index.ts"), join(root, "src/mcp.ts")],
  root,
  target: "bun",
  format: "esm",
  packages: "bundle",
  env: "disable",
  minify: { syntax: true },
  metafile: true,
});

if (!result.success || !result.metafile) {
  throw new AggregateError(result.logs, "Forge bundle generation failed");
}

await mkdir(join(root, "dist"), { recursive: true });
for (const output of result.outputs) {
  const metadata = result.metafile.outputs[output.path];
  const packageRoots = new Set<string>();
  for (const input of Object.keys(metadata.inputs)) {
    const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/);
    if (match) packageRoots.add(match[1]);
  }

  const notices: string[] = [];
  for (const packageRoot of [...packageRoots].sort()) {
    const directory = join(root, packageRoot);
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      name: string;
      version: string;
    };
    // Read the installed license so dependency updates cannot leave stale notices.
    const license = await readFile(join(directory, "LICENSE"), "utf8");
    notices.push(`${manifest.name}@${manifest.version}\n${license.trimEnd()}`);
  }

  const footer = notices.length
    ? "\n// Third-party licenses\n" +
      notices
        .join("\n\n")
        .split("\n")
        .map((line) => `// ${line}`)
        .join("\n") +
      "\n"
    : "";
  const destination = join(root, "dist", basename(output.path));
  await Bun.write(destination, (await output.text()) + footer);
  console.log(`Built ${basename(destination)} with ${notices.length} dependency license notices`);
}
