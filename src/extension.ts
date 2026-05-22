import * as vscode from 'vscode';
import { HtmlPreviewProvider } from './htmlPreviewProvider';
import { MarkdownPreviewProvider } from './markdownPreviewProvider';
import { BrainstemViewProvider } from './brainstemView';
import { bootBrainstem, offerOneLinerInstall } from './brainstemBoot';
import { TwinTreeProvider, asTwin } from './twinTreeProvider';
import { openTwinPanel, refreshTwinPanel } from './twinWebviewManager';
import {
    hatchProjectTwin, bootProjectTwin, stopProjectTwin,
    probeLocalPort, waitForPort,
} from './twinControl';
import { Twin } from './twinRegistry';

export function activate(context: vscode.ExtensionContext) {
    const twinTree = new TwinTreeProvider();
    context.subscriptions.push({ dispose: () => twinTree.dispose() });

    const globalPort = () =>
        vscode.workspace.getConfiguration('rappBrainstem').get<number>('port', 7071);

    const requireGlobalBrainstem = async (): Promise<boolean> => {
        if (await probeLocalPort(globalPort())) return true;
        const choice = await vscode.window.showWarningMessage(
            `Global brainstem not running on :${globalPort()}.`,
            'Boot now', 'Install via one-liner', 'Cancel'
        );
        if (choice === 'Boot now') {
            await bootBrainstem();
            return await waitForPort(globalPort(), 45000);
        }
        if (choice === 'Install via one-liner') {
            await offerOneLinerInstall();
            return await waitForPort(globalPort(), 120000);
        }
        return false;
    };

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'rappBrainstem.htmlPreview',
            new HtmlPreviewProvider(),
            { webviewOptions: { retainContextWhenHidden: true } }
        ),
        vscode.window.registerCustomEditorProvider(
            'rappBrainstem.markdownPreview',
            new MarkdownPreviewProvider(),
            { webviewOptions: { retainContextWhenHidden: true } }
        ),
        vscode.window.registerWebviewViewProvider(
            'rappBrainstem.brainstemView',
            new BrainstemViewProvider()
        ),
        vscode.window.registerTreeDataProvider('rappBrainstem.twinTree', twinTree),

        vscode.commands.registerCommand('rappBrainstem.showSource', async (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (!target) {
                vscode.window.showInformationMessage('No file to show.');
                return;
            }
            await vscode.commands.executeCommand('vscode.openWith', target, 'default');
        }),
        vscode.commands.registerCommand('rappBrainstem.showPreview', async (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (!target) return;
            const ext = target.path.toLowerCase();
            const editorId = ext.endsWith('.md') || ext.endsWith('.markdown')
                ? 'rappBrainstem.markdownPreview'
                : 'rappBrainstem.htmlPreview';
            await vscode.commands.executeCommand('vscode.openWith', target, editorId);
        }),
        vscode.commands.registerCommand('rappBrainstem.bootBrainstem', () => bootBrainstem()),
        vscode.commands.registerCommand('rappBrainstem.installBrainstem', () => offerOneLinerInstall()),
        vscode.commands.registerCommand('rappBrainstem.openInBrowser', async () => {
            await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${globalPort()}`));
        }),

        vscode.commands.registerCommand('rappBrainstem.refreshTwins', () => twinTree.refresh()),

        vscode.commands.registerCommand('rappBrainstem.openTwin', async (arg: unknown) => {
            const twin = asTwin(arg);
            if (!twin) return;
            const panel = openTwinPanel(twin);
            if (!twin.running && twin.port) {
                if (!await requireGlobalBrainstem()) return;
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Booting ${twin.displayName ?? twin.name}…` },
                    async () => {
                        await bootProjectTwin(twin.name);
                        await waitForPort(twin.port!, 30000);
                    }
                );
                const updated: Twin = { ...twin, running: true };
                refreshTwinPanel(updated);
                await twinTree.refresh();
            }
            return panel;
        }),

        vscode.commands.registerCommand('rappBrainstem.bootTwin', async (arg: unknown) => {
            const twin = asTwin(arg);
            if (!twin) return;
            if (!await requireGlobalBrainstem()) return;
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Booting ${twin.displayName ?? twin.name}…` },
                async () => {
                    await bootProjectTwin(twin.name);
                    if (twin.port) await waitForPort(twin.port, 30000);
                }
            );
            await twinTree.refresh();
        }),

        vscode.commands.registerCommand('rappBrainstem.stopTwin', async (arg: unknown) => {
            const twin = asTwin(arg);
            if (!twin) return;
            if (!await requireGlobalBrainstem()) return;
            await stopProjectTwin(twin.name);
            await twinTree.refresh();
        }),

        vscode.commands.registerCommand('rappBrainstem.revealTwinFolder', async (arg: unknown) => {
            const twin = asTwin(arg);
            if (!twin?.anchorPath) {
                vscode.window.showWarningMessage('Twin has no anchor path on disk.');
                return;
            }
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(twin.anchorPath));
        }),

        vscode.commands.registerCommand('rappBrainstem.hatchTwin', async (folderUri?: vscode.Uri) => {
            let target = folderUri;
            if (!target) {
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
                    openLabel: 'Hatch twin here',
                });
                target = picked?.[0];
            }
            if (!target) return;
            if (!await requireGlobalBrainstem()) return;
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Hatching twin at ${target.fsPath}…` },
                async () => { await hatchProjectTwin(target!.fsPath); }
            );
            await twinTree.refresh();
            vscode.window.showInformationMessage(`Hatched twin for ${target.fsPath}`);
        })
    );
}

export function deactivate() {}
