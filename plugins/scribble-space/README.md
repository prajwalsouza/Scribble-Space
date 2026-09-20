# Scribble Space for Codex

A 3D sketch canvas that starts locally and hands images, camera pose and notes back to Codex through MCP.

Requires Node.js 22+ on PATH. The editor and MCP dependencies are bundled: no npm installation or AI API key required.

Install from the public repo marketplace:

```sh
codex plugin marketplace add prajwalsouza/Scribble-Space
codex plugin add scribble-space@scribble-space-plugins
```

Start a new Codex task and ask: **“Open a blank 3D canvas so I can sketch what I mean.”** The skill instructs Codex to call `open_sketch`, open the returned URL, and use `read_sketch` after you save.

Tools: `open_sketch`, `list_sketches`, `read_sketch`, `wait_for_sketch`, `export_sketch`, `read_format_spec`.

This is a local stdio plugin with a browser-panel canvas. It is not an embedded MCP Apps widget or an official-directory listing. Each session uses a free loopback port. Saved data lives in the host's plugin data folder; the editor stops when its MCP session ends.

Standalone ZIP distribution: copy this whole `scribble-space` folder into your own repo marketplace's `plugins/` directory and point its catalog entry at `./plugins/scribble-space`. Never copy a private data directory into the plugin.

The generated `app/` is built from https://github.com/prajwalsouza/Scribble-Space. See `DEPENDENCIES.md` and `app/THIRD-PARTY.md` for licenses.
