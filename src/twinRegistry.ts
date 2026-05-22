import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const RAPP_HOME = process.env.RAPP_HOME ?? path.join(os.homedir(), '.rapp');
const TWINS_DIR = path.join(RAPP_HOME, 'twins');

export interface Twin {
    hash: string;
    name: string;
    displayName?: string;
    rappid?: string;
    port?: number;
    url?: string;
    anchorPath?: string;
    kind?: string;
    running: boolean;
}

export function twinsDir(): string {
    return TWINS_DIR;
}

export async function listTwins(): Promise<Twin[]> {
    if (!fs.existsSync(TWINS_DIR)) return [];
    let entries: string[];
    try { entries = fs.readdirSync(TWINS_DIR); } catch { return []; }

    const twins: Twin[] = [];
    for (const name of entries) {
        if (name.startsWith('.')) continue;
        const dir = path.join(TWINS_DIR, name);
        let st: fs.Stats;
        try { st = fs.statSync(dir); } catch { continue; }
        if (!st.isDirectory()) continue;

        const rappidPath = path.join(dir, 'rappid.json');
        const manifestPath = path.join(dir, 'manifest.json');
        if (!fs.existsSync(rappidPath)) continue;

        let rappid: any = {};
        let manifest: any = {};
        try { rappid = JSON.parse(fs.readFileSync(rappidPath, 'utf8')); } catch { continue; }
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* ok */ }

        const port: number | undefined = manifest.port_hint ?? manifest.port;
        twins.push({
            hash: name,
            name: rappid.name ?? name,
            displayName: rappid.display_name,
            rappid: rappid.rappid,
            port,
            url: port ? `http://localhost:${port}` : undefined,
            anchorPath: manifest.anchor_path ?? rappid._planted_at_path,
            kind: rappid.kind,
            running: false,
        });
    }

    // Probe ports in parallel.
    await Promise.all(twins.map(async (t) => {
        if (t.port) t.running = await probePort(t.port);
    }));

    twins.sort((a, b) => {
        if (a.running !== b.running) return a.running ? -1 : 1;
        return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name);
    });
    return twins;
}

function probePort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const sock = net.createConnection({ host: '127.0.0.1', port });
        let done = false;
        const finish = (v: boolean) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(v); };
        sock.setTimeout(400);
        sock.once('connect', () => finish(true));
        sock.once('error', () => finish(false));
        sock.once('timeout', () => finish(false));
    });
}
