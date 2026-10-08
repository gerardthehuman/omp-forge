# Forge Desktop for OMP

The `forge` plugin registers desktop-provided models and metadata, plus Forge MCP. See the [root README](../../README.md#install) for installation.

## Setup

Run Forge Desktop so it writes `~/.forge/server.json`. Set `FORGE_SERVER_FILE` before starting OMP to override the path. Never commit the descriptor: it contains credentials.

## Usage

```text
/forge models [id]   Inspect the catalog or one model's metadata
/forge refresh       Refresh models and the selected model
/mcp reload          Reconnect MCP after restarting Forge
```

After restarting Forge, run both refresh commands or restart OMP; `/forge refresh` alone does not reconnect MCP.

- OMP receives names, token limits, text/image inputs, tool support, reasoning efforts, and token/cache pricing. Extra metadata remains inspectable through `/forge models`.
- Use `/extended-context on` for full advertised windows where OMP caps context at a pricing threshold. Existing model roles and context preferences remain unchanged.
- The MCP server appears as `forge:forge` in marketplace installations and `forge` in development links.

With OMP 18.6.1, pass model and thinking separately; the combined selector can fail before extensions load:

```sh
omp --model forge/openai/gpt-6-luna --thinking low
```

## Bundled licenses

The build reads each bundled dependency's installed `LICENSE` file and appends its contents to `dist/mcp.js`. Missing license files fail the build.
