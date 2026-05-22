import * as vscode from 'vscode';
import * as path from 'path';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

export class MarkdownPreviewProvider implements vscode.CustomTextEditorProvider {
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
            const body = md.render(document.getText());
            const base = webviewPanel.webview.asWebviewUri(docDir).toString() + '/';
            webviewPanel.webview.html = this.wrap(body, base);
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

    private wrap(body: string, base: string): string {
        return `<!doctype html>
<html>
<head>
  <base href="${base}">
  <meta charset="utf-8">
  <style>
    body {
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 780px; margin: 40px auto; padding: 0 24px 80px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    h1, h2, h3, h4 { line-height: 1.25; margin-top: 1.8em; }
    h1 { border-bottom: 1px solid var(--vscode-panel-border, #444); padding-bottom: .3em; }
    h2 { border-bottom: 1px solid var(--vscode-panel-border, #444); padding-bottom: .2em; }
    code {
      font: 13px/1.4 "SF Mono", Menlo, Consolas, monospace;
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,.15));
      padding: 2px 6px; border-radius: 3px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,.12));
      padding: 16px; border-radius: 6px; overflow-x: auto;
    }
    pre code { background: transparent; padding: 0; }
    a { color: var(--vscode-textLink-foreground, #4ea1f3); }
    blockquote {
      border-left: 4px solid var(--vscode-panel-border, #555); margin: 1em 0;
      padding: 0 1em; color: var(--vscode-descriptionForeground, #aaa);
    }
    img { max-width: 100%; }
    table { border-collapse: collapse; margin: 1em 0; }
    th, td { border: 1px solid var(--vscode-panel-border, #555); padding: 6px 12px; }
    hr { border: 0; border-top: 1px solid var(--vscode-panel-border, #444); margin: 2em 0; }
    #rapp-toolbar {
      position: fixed; top: 8px; right: 8px;
      background: rgba(30,30,30,.85); color: #eee;
      border: 1px solid #444; padding: 4px 10px; border-radius: 6px;
      font: 12px -apple-system, sans-serif;
      backdrop-filter: blur(4px);
    }
    #rapp-toolbar button {
      background: transparent; color: inherit; border: 0; cursor: pointer;
      font: inherit; padding: 2px 6px;
    }
    #rapp-toolbar button:hover { text-decoration: underline; }
  </style>
</head>
<body>
${body}
<div id="rapp-toolbar">
  <span>RAPP preview</span>
  <button id="rapp-show-source">Show source</button>
</div>
<script>
(function(){
  if (typeof acquireVsCodeApi !== 'function') return;
  var vs = acquireVsCodeApi();
  var btn = document.getElementById('rapp-show-source');
  if (btn) btn.addEventListener('click', function(){ vs.postMessage({ type: 'showSource' }); });
})();
</script>
</body>
</html>`;
    }
}
