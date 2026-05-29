# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run compile` — TypeScript build to `out/` (rootDir `src`, target ES2020, CommonJS).
- `npm run watch` — `tsc -w` for iterative development.
- `npm run package` — `vsce package`, produces a `rapp-brainstem-<ver>.vsix` at the repo root. CI uses `npx vsce package --no-dependencies --out docs/rapp-brainstem.vsix --allow-missing-repository` instead (see below).
- **Debugging in VS Code:** open this folder and press F5. The `Run Extension` launch config (`.vscode/launch.json`) spawns an Extension Development Host with this extension loaded; the `compile` task runs first.
- No test suite, no linter.

### CI / distribution

`.github/workflows/release.yml` runs on pushes to `main` that touch `src/`, `media/`, `package*.json`, `tsconfig.json`, or the workflow itself. It compiles, repackages, and commits the rebuilt artifact to `docs/rapp-brainstem.vsix`. `docs/` is served via GitHub Pages — the install button on `https://kody-w.github.io/rapp-vscode-extension/` links directly at that .vsix. **Do not hand-edit `docs/rapp-brainstem.vsix`**; CI will overwrite it. If you need a local build, `npm run package` writes to the repo root, which is gitignored.

## Architecture

This extension is a thin VS Code UI shell over an out-of-process **brainstem server** that lives in a separate repo. The brainstem is what actually runs agents, hatches "twins" (per-project agents), and serves their UIs. This extension never spawns agents itself — it speaks HTTP to a brainstem the user must boot.

### The two layers of state

1. **Global brainstem** — a server on `rappBrainstem.port` (default `7071`). The extension talks to it via `http://127.0.0.1:<port>/chat` (POST) and `/health` (GET). `brainstemBoot.ts` locates a local `rapp_brainstem/` directory (workspace root, parent dir, or `~/.brainstem/src/rapp_brainstem`) and runs `start.sh` / `start.ps1` in a VS Code terminal. If none is found, it offers a platform-specific install one-liner that fetches from `kody-w.github.io/rapp-installer`.
2. **Project twins** — per-project agents registered on disk at `~/.rapp/twins/<hash>/` (overridable via `RAPP_HOME`). Each twin has a `rappid.json` (identity) and `manifest.json` (which carries `port_hint`). `twinRegistry.listTwins()` reads that directory, probes each twin's port to derive `running`, and sorts running twins first.

All twin lifecycle operations (hatch, boot, stop) are routed through the global brainstem's `/chat` endpoint as natural-language commands (`twinControl.ts`), e.g. `Use the ProjectTwin agent action=boot name=<name>`. The extension does not manage twin processes directly. Before any twin op, `extension.ts:requireGlobalBrainstem()` probes port 7071 and prompts the user to boot/install if it's not up.

### Entry point and contributions

`src/extension.ts` is the only `activate()`. It wires up:

- **Custom text editors** for `.html` / `.htm` (`HtmlPreviewProvider`) and `.md` / `.markdown` (`MarkdownPreviewProvider`). Both are registered as the **default** editor for those extensions (see `package.json` → `contributes.customEditors`), so opening a markdown/html file in this workspace shows the rendered page, not the source. The `rappBrainstem.showSource` command swaps back to the default text editor.
- **Activity-bar view container** `rappBrainstem` with one view: `twinTree` (the `TwinTreeProvider` — auto-refreshes every 5s). The sidebar is intentionally **not** used as the brainstem-chat surface — that space is reserved for Copilot/Claude Code-style assistant panels. The Twins view title bar carries the "Open Brainstem" icon button as the discoverable entry point.
- **Brainstem center tab** — `src/brainstemPanel.ts` owns a singleton `WebviewPanel` keyed by `rappBrainstem.brainstem` that opens in `ViewColumn.Active` and iframes `http://localhost:<port>`. When the brainstem is down it renders a boot/install card. The panel auto-opens (with `preserveFocus: true`) the first time `requireGlobalBrainstem()` confirms the brainstem is up in a session, so any twin op pops the chat tab alongside without stealing focus. The `rappBrainstem.openBrainstem` command opens or reveals it directly.
- **Twin tabs** — opening a twin from the tree calls `openTwinPanel(twin)` in `twinWebviewManager.ts`, which maintains a `Map<hash, WebviewPanel>` so each twin gets a singleton tab that iframes its `http://localhost:<port_hint>`.

### Preview providers — base-href injection

Both preview providers do the same trick: they inject a `<base href="${webview.asWebviewUri(docDir)}/">` into rendered HTML so that relative paths in user HTML/Markdown resolve through VS Code's webview URI scheme. `localResourceRoots` is scoped to the doc's directory + workspace folder. Both providers append an in-page toolbar (a `<div id="rapp-toolbar">` with a "Show source" button) that posts a `showSource` message back to the extension. When editing either provider, preserve both the `<base href>` injection and the toolbar message channel — twins and previews both depend on this iframe-with-baseref pattern to keep relative assets working.

### Iframe-embed pattern (brainstem + twins)

`brainstemPanel.ts` and `twinWebviewManager.ts` both render a near-identical webview shell: full-bleed iframe pointed at a local `http://localhost:<port>` URL with a floating reload button. When you change one, look at the other — they should stay in sync visually and behaviorally. Both also rely on `retainContextWhenHidden: true` so switching tabs doesn't tear down the iframe.

### Twin discovery contract

Anything reading from `~/.rapp/twins/` should mirror `twinRegistry.listTwins()`'s assumptions:
- A directory under `twins/` is a twin only if it contains `rappid.json`. `manifest.json` is optional.
- `manifest.json.port_hint` (or `.port`) is how the extension finds the twin's UI URL.
- `running` is derived live from a TCP probe of the port, not stored.

If you change the on-disk schema, you must also update whatever lives in the brainstem repo that writes these files — this extension only reads.

## Things that aren't here

- The brainstem server, the agent runtime, the installer scripts, and the ProjectTwin agent implementation all live in other repos (`rapp_brainstem`, `kody-w/rapp-installer`). When something seems missing ("how does hatch actually work?"), it's because the work happens server-side via `/chat`.
- No source maps in published .vsix (sourceMap is on in tsconfig but `.vscodeignore` excludes `src/` and `**/*.map`).
