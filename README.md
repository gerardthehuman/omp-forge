# omp-forge

A Git-hosted marketplace for Forge integrations and OMP plugins:

- `forge`: desktop-connected provider, live Forge metadata, and Forge MCP.
- `forge-router`: direct remote provider, masked API-key login, and OpenRouter metadata sync. No desktop or MCP dependency.

## Requirements

- OMP. Verified with 18.6.1.
- Bun 1.3 or newer on PATH. Bundle built and exercised with Bun 1.4.2.
- The `forge` plugin requires a running Forge instance that writes `~/.forge/server.json`.
- The `forge-router` plugin requires a router API key and access to its direct URL. See [router setup and metadata sync](plugins/forge-router/README.md).

The desktop plugin reads the local descriptor at runtime. Do not commit that file: it contains credentials. Set `FORGE_SERVER_FILE` to use a different descriptor path.

## Install

### Local marketplace

```sh
omp plugin marketplace add ~/Projects/omp-forge
omp plugin install forge@omp-forge
```

Restart OMP after installation to load the provider extension.

### GitHub marketplace

After this repository is published, replace `OWNER` with its GitHub owner:

```sh
omp plugin marketplace add OWNER/omp-forge
omp plugin install forge@omp-forge
```

No npm publication or dependency installation is needed. The committed `plugins/forge/dist/mcp.mjs` contains the MCP bridge's dependencies.

### Development link

This machine uses a development link rather than a cached marketplace installation:

```sh
omp plugin link ~/Projects/omp-forge/plugins/forge
```

Do not install `forge@omp-forge` alongside that link: both use the `omp-forge` package name. To switch, remove the link registration with `omp plugin uninstall omp-forge`, then install `forge@omp-forge`.

### Standalone router

```sh
omp plugin install forge-router@omp-forge
```

Restart OMP, run `/login`, choose **Forge Router (API key)**, and enter your key. `/forge-router sync` discovers IDs from the authenticated router API and joins all-modality OpenRouter metadata. Text-output models populate the chat picker; `/forge-router models [id]` exposes every returned model, including non-chat metadata. No hardcoded roster or shipped snapshot. Prices are upstream estimates, not Forge billing.

For local development: `omp plugin link ~/Projects/omp-forge/plugins/forge-router`. This machine links both plugins. The existing router credential was migrated into OMP's native storage and the obsolete manual `models.yml` provider removed. Model roles are unchanged.

## Usage

```text
/forge models                         Inspect the complete Forge catalog
/forge models openai/gpt-6-luna        Inspect one model
/forge refresh                        Refresh the provider and selected model
```

After restarting Forge, run `/forge refresh` and `/mcp reload`, or restart OMP. `/forge refresh` does not reconnect MCP.

OMP maps model names, token limits, text/image inputs, tool support, reasoning efforts, token/cache prices, and one long-context pricing tier. Arbitrary metadata such as speed and additional price bands remains available through `/forge models`.

Use `/extended-context on` for the full advertised context windows when OMP otherwise caps them at a long-context pricing threshold. Existing model roles and context preferences are not changed.

OMP 18.6.1 requires separate model and thinking flags for extension providers:

```sh
omp --model forge/openai/gpt-6-luna --thinking low
```

The combined `--model forge/openai/gpt-6-luna:low` form can fail before extensions load. Configured model roles retain their existing selector syntax.

Marketplace MCP servers are namespaced by OMP. The `forge` entry's `forge` server appears as `forge:forge` in a marketplace installation; the development link uses `forge`.

## Repository layout

```text
.omp-plugin/marketplace.json    Marketplace catalog
plugins/forge/                 Forge plugin package
  index.mjs                    Provider registration and /forge commands
  forge.mjs                    Local descriptor and endpoint access
  models.mjs                   Forge → OMP metadata mapping
  mcp.mjs                      Readable MCP bridge source
  dist/mcp.mjs                 Committed, bundled MCP runtime
  .mcp.json                    Plugin-owned MCP configuration
  THIRD_PARTY_NOTICES.md        Bundled dependency licenses
plugins/forge-router/          Standalone router package (no runtime dependencies)
  index.mjs                    Provider, native API-key login, and sync command
  catalog.mjs                  Authenticated API discovery and all-modality metadata cache
  models.mjs                   OpenRouter → OMP metadata mapping
```

## Build

Install build dependencies inside the plugin, then rebuild from the repository root:

```sh
bun install --cwd plugins/forge --frozen-lockfile
bun run build
```

Keep `dist/mcp.mjs` in Git. OMP 18.6.1's marketplace installer copies plugin files but does not run a package-manager install. Environment variables are not inlined into the bundle.

When updating bundled dependencies, update `THIRD_PARTY_NOTICES.md` to preserve the licenses of all packages included in the bundle.

## Add plugins

1. Create a self-contained package under `plugins/<name>/`.
2. Give OMP extensions a unique `package.json` name and declare `omp.extensions`.
3. Add a catalog entry with a unique name, `source: "./plugins/<name>"`, description, and version.
4. Bundle runtime dependencies where needed. Skills, commands, agents, and other conventional plugin content can live in the package as well.
5. Verify installation from a clean snapshot without development dependencies.

## Releases

1. Bump the changed plugin's package version and matching catalog entry version.
2. Rebuild and commit its distributable files and changelog.
3. Verify a clean marketplace installation and real model inference. Exercise metadata sync for the router and refresh/MCP for the desktop plugin.
4. Push to GitHub and tag the release.

Users refresh the catalog and upgrade separately:

```sh
omp plugin marketplace update omp-forge
omp plugin upgrade forge@omp-forge
```

The repository is initialized locally. No GitHub remote or publication is configured yet. Choose a license for the original source before public distribution; third-party licenses are recorded in each plugin's notices.

## Verification

Release 1.0.1 was exercised with OMP 18.6.1 and Bun 1.4.2:

- Clean marketplace snapshot installed without `node_modules`.
- 17 live Forge models registered; mapped costs and limits matched Forge.
- `/forge models` exposed raw pricing, limits, modalities, and metadata.
- `/forge refresh` refreshed the registry and selected model.
- Bundled MCP initialized, exposed 131 tools, and exited with code 0 on stdin EOF.
- OMP performed a real read-only `knowledge_search` call through the marketplace-installed bridge.
- The relocated development link passed model, metadata, and refresh smoke checks.

Model and tool counts reflect that running Forge instance, not fixed plugin limits.

Router release 1.0.1 passed fresh-profile native secret-login validation, API-key persistence across restart, live API discovery of 22 metadata records and the exact 19 chat-compatible IDs, forced sync, selected-model refresh, all three specialized metadata inspections, and direct remote streaming inference. Mapper regressions cover API additions/removals, empty catalogs, missing metadata, and non-chat exclusion. Counts reflect that API response, not fixed limits. The existing local profile has one rejected and one valid router credential; verification used an isolated profile and left both unchanged.
