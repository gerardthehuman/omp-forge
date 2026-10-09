# Changelog

## Unreleased

- Add `/forge usage` to show available and total daily credits from the local Forge usage snapshot.

## 1.0.0

- Register Forge Desktop models with live metadata from the local server descriptor.
- Map token limits, modalities, tool support, reasoning efforts, and token/cache pricing into OMP.
- Expose complete metadata with `/forge models [id]` and refresh models with `/forge refresh`.
- Connect Forge MCP through a bundled stdio bridge without copying credentials into OMP configuration.
- Distribute compiled TypeScript bundles through the `omp-forge` marketplace.
- Include dependency license notices in the generated MCP bundle instead of a separate file.
