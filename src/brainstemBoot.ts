import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

type Platform = 'mac' | 'linux' | 'windows';

interface OsCommands {
    install: string;
    boot: string;
    bootScriptName: string;
    shellPath?: string;
}

function detectPlatform(): Platform {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'mac';
    return 'linux';
}

const COMMANDS: Record<Platform, OsCommands> = {
    mac: {
        install: 'curl -fsSL https://kody-w.github.io/rapp-installer/install.sh | bash',
        boot: './start.sh',
        bootScriptName: 'start.sh',
    },
    linux: {
        install: 'curl -fsSL https://kody-w.github.io/rapp-installer/install.sh | bash',
        boot: './start.sh',
        bootScriptName: 'start.sh',
    },
    windows: {
        // ExecutionPolicy Bypass so we don't trip on locked-down policies.
        install: 'powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/kody-w/rapp-installer/main/install.ps1 | iex"',
        boot: 'powershell -ExecutionPolicy Bypass -File .\\start.ps1',
        bootScriptName: 'start.ps1',
        // Pin PowerShell so the boot command lands in the right shell regardless of the user's default.
        shellPath: 'powershell.exe',
    },
};

function osCommands(): OsCommands {
    return COMMANDS[detectPlatform()];
}

export function findBrainstemRoot(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const configured = vscode.workspace
        .getConfiguration('rappBrainstem')
        .get<string>('brainstemPath', '');

    const candidates: string[] = [];
    if (configured) {
        candidates.push(path.isAbsolute(configured) ? configured : (folder ? path.join(folder, configured) : configured));
    }
    if (folder) {
        candidates.push(
            path.join(folder, 'rapp_brainstem'),
            path.join(folder, '..', 'rapp_brainstem'),
            folder
        );
    }
    candidates.push(path.join(os.homedir(), '.brainstem', 'src', 'rapp_brainstem'));

    const scriptName = osCommands().bootScriptName;
    return candidates.find((p) => p && fs.existsSync(path.join(p, scriptName)));
}

export async function bootBrainstem(): Promise<void> {
    const cmds = osCommands();
    const root = findBrainstemRoot();
    if (root) {
        const term = vscode.window.createTerminal({
            name: 'RAPP Brainstem',
            cwd: root,
            shellPath: cmds.shellPath,
        });
        term.sendText(cmds.boot);
        term.show();
        return;
    }
    await offerOneLinerInstall();
}

export async function offerOneLinerInstall(): Promise<void> {
    const cmds = osCommands();
    const platformLabel = detectPlatform() === 'windows' ? 'Windows (PowerShell)' : 'macOS/Linux (bash)';
    const choice = await vscode.window.showInformationMessage(
        `No brainstem found on this machine. Install it now with the official ${platformLabel} one-liner?`,
        { modal: true, detail: cmds.install },
        'Install + Boot', 'Copy command', 'Cancel'
    );
    if (choice === 'Install + Boot') {
        const term = vscode.window.createTerminal({
            name: 'RAPP Brainstem Install',
            shellPath: cmds.shellPath,
        });
        term.sendText(cmds.install);
        term.show();
        vscode.window.showInformationMessage(
            'Installer running in the terminal. The brainstem auto-boots when install completes.'
        );
    } else if (choice === 'Copy command') {
        await vscode.env.clipboard.writeText(cmds.install);
        vscode.window.showInformationMessage('One-liner copied to clipboard.');
    }
}
