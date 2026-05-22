import * as vscode from 'vscode';
import { Twin } from './twinRegistry';

const panels = new Map<string, vscode.WebviewPanel>();

export function openTwinPanel(twin: Twin): vscode.WebviewPanel {
    const existing = panels.get(twin.hash);
    if (existing) {
        existing.reveal(vscode.ViewColumn.Active);
        existing.webview.html = renderShell(twin);
        return existing;
    }
    const panel = vscode.window.createWebviewPanel(
        'rappBrainstem.twin',
        twin.displayName ?? twin.name,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = new vscode.ThemeIcon('zap');
    panel.webview.html = renderShell(twin);
    panel.onDidDispose(() => panels.delete(twin.hash));
    panels.set(twin.hash, panel);
    return panel;
}

export function refreshTwinPanel(twin: Twin): void {
    const p = panels.get(twin.hash);
    if (p) p.webview.html = renderShell(twin);
}

function renderShell(twin: Twin): string {
    if (!twin.url) {
        return notRunningShell(twin, 'Twin has no port_hint in its manifest.');
    }
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); }
    iframe { border: 0; width: 100%; height: 100vh; display: block; }
    #reload {
      position: fixed; top: 8px; right: 8px; z-index: 999;
      background: rgba(30,30,30,.85); color: #eee;
      border: 1px solid #444; padding: 4px 10px; border-radius: 6px;
      font: 12px -apple-system, sans-serif; cursor: pointer;
      backdrop-filter: blur(4px);
    }
    #reload:hover { background: rgba(60,60,60,.9); }
  </style>
</head>
<body>
  <iframe id="frame" src="${twin.url}" allow="clipboard-read; clipboard-write; microphone"></iframe>
  <button id="reload" title="Reload twin UI">↻</button>
  <script>
    document.getElementById('reload').addEventListener('click', () => {
      const f = document.getElementById('frame');
      f.src = f.src;
    });
  </script>
</body>
</html>`;
}

function notRunningShell(twin: Twin, reason: string): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 40px; text-align: center;
    }
  </style>
</head>
<body>
  <h3>${twin.displayName ?? twin.name}</h3>
  <p>${reason}</p>
</body>
</html>`;
}
