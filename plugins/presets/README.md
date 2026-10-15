# omp-model-presets

Native OMP model presets with session-only activation by default. Uses OMP's existing `modelPresets` storage, lookup precedence, validation, and model resolver. No separate preset file and no automatic migration from third-party preset formats.

## Install

```sh
omp plugin install presets@omp-forge
# Local development instead:
omp plugin link /path/to/omp-forge/plugins/presets
```

Restart OMP after installing. Remove other extensions registering `/preset` to avoid last-loaded-command conflicts. Built against OMP 18.6.1; host runtime imports remain external so settings and native mutation locks share the host's module identity.

## Commands

| Command                 | Behavior                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- |
| `/preset <name>`        | Apply all roles and thinking to this session only                                 |
| `/preset`               | Open a searchable picker with default, slow, and smol selectors beneath each name |
| `/preset list`          | List native presets                                                               |
| `/preset save <name>`   | Save effective role settings and default thinking in native global preset storage |
| `/preset delete <name>` | Delete the global preset entry, respecting native project/overlay ownership       |
| `/preset switch <name>` | Apply persistently using OMP's native preset switch implementation                |

Tab completes preset names and management subcommands. `switch` and `delete` complete preset names after the subcommand. Names matching management subcommands can be activated from the picker.

## Session behavior

- Session activation never writes role or thinking configuration. Omitted roles are masked rather than inherited from the previous preset.
- Model aliases and thinking suffixes use OMP's native resolver. Unavailable defaults are rejected before changing settings.
- Activation uses `pi.setModel()` and `pi.setThinkingLevel()`: native provider-session handling, model-dependent reconciliation, `model_changed` notifications, and `model_change` history entries are preserved. No synthetic events are emitted when only auxiliary roles change.
- A custom session-history entry stores the applied preset snapshot. New sessions restore prior runtime overrides; resumed/forked sessions restore the snapshot independently of later preset edits or deletion. OMP restores the active model from its native model-change history.
- Persistent `switch` exits the session-only overlay before invoking native behavior. Native storage scope and shadowing warnings remain in effect.
- In headless hosts, supply a name explicitly. Picker availability depends on the host's extension UI support.

Harnesses subscribing to native session model changes receive the usual notification. Actual Orca UI detection must be checked in an Orca-hosted session.
