# omp-forge

Forge plugins for OMP:

- [forge](plugins/forge/README.md): Forge Desktop models, metadata, and MCP.
- [forge-router](plugins/forge-router/README.md): direct router access with API-key login. No desktop dependency.

## Install

Requires OMP (verified with 18.6.1) and Bun ≥1.3 on PATH. From a local checkout:

```sh
omp plugin marketplace add /path/to/omp-forge
omp plugin install forge@omp-forge # Or forge-router@omp-forge
```

Restart OMP, then follow the plugin's setup guide above. Committed bundles need no dependency install.

To update:

```sh
omp plugin marketplace update omp-forge
omp plugin upgrade forge@omp-forge # Or forge-router@omp-forge
```

## Development

Use Bun 1.4.2 from the repository root:

```sh
bun install --frozen-lockfile
bun run build  # Typecheck and bundle both plugins
bun run test
bun run check  # Type-aware lint, TypeScript diagnostics, format check
bun run fix    # Safe lint autofixes and formatting
```

Lefthook runs read-only `check` before commits. Rebuild and commit `dist/` after source changes. Bundles are excluded from lint and formatting. Keep package and marketplace versions aligned.

For local testing, use `omp plugin link /path/to/omp-forge/plugins/<plugin>` instead of a marketplace installation of that plugin. Do not register both forms.
