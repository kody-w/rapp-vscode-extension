import * as vscode from 'vscode';
import { Twin, listTwins } from './twinRegistry';

export class TwinTreeProvider implements vscode.TreeDataProvider<TwinItem> {
    private _emitter = new vscode.EventEmitter<TwinItem | undefined | void>();
    readonly onDidChangeTreeData = this._emitter.event;
    private twins: Twin[] = [];
    private timer: NodeJS.Timeout | undefined;

    constructor() {
        void this.refresh();
        this.timer = setInterval(() => void this.refresh(), 5000);
    }

    dispose() {
        if (this.timer) clearInterval(this.timer);
    }

    async refresh(): Promise<void> {
        this.twins = await listTwins();
        this._emitter.fire();
    }

    getTreeItem(item: TwinItem): vscode.TreeItem {
        return item;
    }

    getChildren(): TwinItem[] {
        if (!this.twins.length) {
            const empty = new TwinItem('No twins hatched yet', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('lightbulb');
            empty.description = 'Right-click a folder to hatch one';
            empty.contextValue = 'empty';
            return [empty];
        }
        return this.twins.map((twin) => {
            const label = twin.displayName ?? twin.name;
            const item = new TwinItem(label, vscode.TreeItemCollapsibleState.None);
            item.twin = twin;
            item.description = twin.port ? `:${twin.port}${twin.running ? '' : ' • stopped'}` : 'no port';
            item.tooltip = [
                label,
                twin.url ?? '(not running)',
                twin.anchorPath ?? '',
                twin.rappid ?? '',
            ].filter(Boolean).join('\n');
            item.iconPath = new vscode.ThemeIcon(
                twin.running ? 'circle-filled' : 'circle-outline',
                twin.running ? new vscode.ThemeColor('charts.green') : new vscode.ThemeColor('descriptionForeground')
            );
            item.contextValue = twin.running ? 'twin-running' : 'twin-stopped';
            item.command = {
                command: 'rappBrainstem.openTwin',
                title: 'Open Twin',
                arguments: [item],
            };
            return item;
        });
    }
}

export class TwinItem extends vscode.TreeItem {
    twin?: Twin;
}

export function asTwin(arg: any): Twin | undefined {
    if (!arg) return undefined;
    if (arg.twin) return arg.twin as Twin;
    if (arg.hash && arg.name) return arg as Twin;
    return undefined;
}
