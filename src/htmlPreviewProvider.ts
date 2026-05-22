import * as vscode from 'vscode';
import * as path from 'path';

export class HtmlPreviewProvider implements vscode.CustomTextEditorProvider {
    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const docDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const roots = workspaceFolder ? [docDir, workspaceFolder.uri] : [docDir];

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: roots,
        };

        const render = () => {
            webviewPanel.webview.html = this.buildHtml(
                webviewPanel.webview,
                document.getText(),
                docDir
            );
        };
        render();

        const sub = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
                render();
            }
        });
        webviewPanel.onDidDispose(() => sub.dispose());

        webviewPanel.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'showSource') {
                await vscode.commands.executeCommand('rappBrainstem.showSource', document.uri);
            }
        });
    }

    private buildHtml(webview: vscode.Webview, raw: string, docDir: vscode.Uri): string {
        const base = webview.asWebviewUri(docDir).toString() + '/';
        const withBase = /<head[^>]*>/i.test(raw)
            ? raw.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`)
            : `<!doctype html><html><head><base href="${base}"></head><body>${raw}</body></html>`;

        const toolbar = `
<style id="rapp-toolbar-style">
  #rapp-toolbar {
    position: fixed; top: 8px; right: 8px; z-index: 2147483647;
    background: rgba(30,30,30,.85); color: #eee;
    border: 1px solid #444; padding: 4px 10px; border-radius: 6px;
    font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    backdrop-filter: blur(4px);
  }
  #rapp-toolbar button {
    background: transparent; color: inherit; border: 0; cursor: pointer;
    font: inherit; padding: 2px 6px;
  }
  #rapp-toolbar button:hover { text-decoration: underline; }
</style>
<div id="rapp-toolbar">
  <span>RAPP preview</span>
  <button id="rapp-show-source">Show source</button>
</div>
<script>
(function(){
  if (typeof acquireVsCodeApi !== 'function') return;
  if (window.__rappVs) return;
  window.__rappVs = acquireVsCodeApi();
  var btn = document.getElementById('rapp-show-source');
  if (btn) btn.addEventListener('click', function(){
    window.__rappVs.postMessage({ type: 'showSource' });
  });
})();
</script>`;

        return /<\/body>/i.test(withBase)
            ? withBase.replace(/<\/body>/i, `${toolbar}</body>`)
            : withBase + toolbar;
    }
}
