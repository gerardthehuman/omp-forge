# Changelog

## 1.0.0

- Add direct Forge Router access without Forge Desktop or MCP dependencies.
- Authenticate through native OMP login with masked API-key entry and credential storage.
- Discover available models from the router API and enrich them with OpenRouter metadata.
- Register text-output models for chat; expose non-chat metadata with `/forge-router models [id]`.
- Map token limits, modalities, tool support, reasoning efforts, and token/cache pricing into OMP.
- Refresh availability and the selected model with `/forge-router sync`; retain cached catalogs on discovery failure.
- Distribute a compiled TypeScript bundle through the `omp-forge` marketplace.
