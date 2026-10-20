# Changelog

## Unreleased

- Register a credential- and endpoint-scoped cached catalog before default-model selection, then refresh availability after session startup without discarding models on network failure.
- Register decision-output models with the native OpenRouter decisions API for OMP's Judge role, excluded from chat.
- Report chat/judge registration separately from unsupported media metadata.
- Document the missing Forge image/video endpoints and OMP video role rather than expose unusable roles.

## 1.0.0

- Add direct Forge Router access without Forge Desktop or MCP dependencies.
- Authenticate through native OMP login with masked API-key entry and credential storage.
- Discover available models from the router API and enrich them with OpenRouter metadata.
- Register text-output models for chat; expose non-chat metadata with `/forge-router models [id]`.
- Map token limits, modalities, tool support, reasoning efforts, and token/cache pricing into OMP.
- Refresh availability and the selected model with `/forge-router sync`; retain cached catalogs on discovery failure.
- Distribute a compiled TypeScript bundle through the `omp-forge` marketplace.
