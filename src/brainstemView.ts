import * as vscode from 'vscode';
import * as http from 'http';
import { bootBrainstem } from './brainstemBoot';

export class BrainstemViewProvider implements vscode.WebviewViewProvider {
    async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
        view.webview.options = { enableScripts: true };

        const port = vscode.workspace
            .getConfiguration('rappBrainstem')
            .get<number>('port', 7071);
        const url = `http://localhost:${port}`;

        const render = async () => {
            const up = await probeBrainstem(port);
            view.webview.html = up ? embedShell(url) : downShell(url);
        };

        view.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'boot') {
                await bootBrainstem();
                view.webview.html = bootingShell(url);
                await waitForBrainstem(port, 30000);
                await render();
            } else if (msg?.type === 'open') {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } else if (msg?.type === 'recheck') {
                await render();
            }
        });

        await render();
    }
}

function embedShell(url: string): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); }
    iframe { border: 0; width: 100%; height: 100vh; display: block; }
  </style>
</head>
<body>
  <iframe src="${url}" allow="clipboard-read; clipboard-write; microphone"></iframe>
</body>
</html>`;
}

function bootingShell(url: string): string {
    return wrapMessage(`
<h3>Booting brainstem…</h3>
<p>Starting the server, then loading <code>${url}</code>.</p>
<div class="spinner"></div>
<style>
  .spinner {
    width: 24px; height: 24px; margin: 12px auto;
    border: 3px solid rgba(127,127,127,.3);
    border-top-color: var(--vscode-progressBar-background, #4ea1f3);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
`);
}

function downShell(url: string): string {
    return wrapMessage(`
<h3>Brainstem isn't running</h3>
<p>Nothing is listening on <code>${url}</code>.</p>
<button id="boot">Boot brainstem</button>
<button id="recheck" class="secondary">Recheck</button>
<p style="margin-top:24px; opacity:.7; font-size:12px;">
  Or run <code>./start.sh</code> in <code>rapp_brainstem/</code> yourself.
</p>
<script>
  const vs = acquireVsCodeApi();
  document.getElementById('boot').addEventListener('click', () => vs.postMessage({ type: 'boot' }));
  document.getElementById('recheck').addEventListener('click', () => vs.postMessage({ type: 'recheck' }));
</script>
`);
}

function wrapMessage(inner: string): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 24px; text-align: center;
    }
    button {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: 0; padding: 8px 16px; border-radius: 4px; cursor: pointer;
      font: inherit; margin: 6px;
    }
    button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    button.secondary {
      background: transparent;
      color: var(--vscode-button-foreground, #fff);
      border: 1px solid var(--vscode-button-background, #0e639c);
    }
    code {
      background: rgba(127,127,127,.15);
      padding: 2px 6px; border-radius: 3px;
      font: 12px "SF Mono", Menlo, Consolas, monospace;
    }
  </style>
</head>
<body>${inner}</body>
</html>`;
}

function probeBrainstem(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(
            { host: '127.0.0.1', port, path: '/health', timeout: 800 },
            (res) => {
                resolve((res.statusCode ?? 500) < 500);
                res.resume();
            }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function waitForBrainstem(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probeBrainstem(port)) return true;
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}
