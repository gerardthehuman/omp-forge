# Forge Desktop for OMP

The `forge` plugin registers desktop-provided models and metadata, plus Forge MCP. See the [root README](../../README.md#install) for installation.

## Setup

Run Forge Desktop so it writes `~/.forge/server.json`. Set `FORGE_SERVER_FILE` before starting OMP to override the path. Never commit the descriptor: it contains credentials.

## Outbound write approvals

Forge shows a desktop dialog before running write tools (Jira, Confluence, …)
for MCP clients, except clients identifying as `opencode` (exact match on the
initialize `clientInfo.name`): for those Forge skips its dialog and relies on
the client's own approval flow. The bridge presents OMP as `opencode`, so gate
Forge write tools with OMP approval overrides, which are honored in every
`tools.approvalMode`:

```yaml
tools:
  approval:
    jira_update_issue: prompt
```

Unconfigured write tools run with no prompt at all when `tools.approvalMode`
is `yolo`.

## Usage

```text
/forge models [id]   Inspect the catalog or one model's metadata
/forge refresh       Refresh models and the selected model
/forge usage         Show available and total daily credits
/mcp reload          Reconnect MCP after restarting Forge
```

After restarting Forge, run both refresh commands or restart OMP; `/forge refresh` alone does not reconnect MCP.

`/forge usage` reads the current local Forge usage snapshot on demand. It reports available credits and the total daily credit allowance, not OMP's estimated token spend. Forge Desktop must be running with a ready usage snapshot. `FORGE_SERVER_FILE` also applies to balance lookup.

- OMP receives names, token limits, text/image inputs, tool support, reasoning efforts, and token/cache pricing. Extra metadata remains inspectable through `/forge models`.
- Use `/extended-context on` for full advertised windows where OMP caps context at a pricing threshold. Existing model roles and context preferences remain unchanged.
- The MCP server appears as `forge:forge` in marketplace installations and `forge` in development links.

With OMP 18.6.1, pass model and thinking separately; the combined selector can fail before extensions load:

```sh
omp --model forge/openai/gpt-6-luna --thinking low
```

## Bundled licenses

The build reads each bundled dependency's installed `LICENSE` file and appends its contents to `dist/mcp.js`. Missing license files fail the build.
