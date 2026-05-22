import * as vscode from 'vscode';
import * as http from 'http';
import * as net from 'net';

function globalPort(): number {
    return vscode.workspace.getConfiguration('rappBrainstem').get<number>('port', 7071);
}

export interface ChatResult {
    response: string;
    agentLogs: string;
}

export async function postChat(message: string, timeoutMs = 120000): Promise<ChatResult> {
    const data = Buffer.from(JSON.stringify({ user_input: message }));
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: '127.0.0.1', port: globalPort(), path: '/chat', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
                timeout: timeoutMs,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(c as Buffer));
                res.on('end', () => {
                    try {
                        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                        resolve({
                            response: body.response ?? body.assistant_response ?? '',
                            agentLogs: body.agent_logs ?? '',
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('chat timed out')); });
        req.write(data);
        req.end();
    });
}

export async function hatchProjectTwin(projectPath: string): Promise<ChatResult> {
    const msg = `Use the ProjectTwin agent to hatch a project twin at ${projectPath}, then boot it.`;
    return postChat(msg, 180000);
}

export async function bootProjectTwin(name: string): Promise<ChatResult> {
    return postChat(`Use the ProjectTwin agent action=boot name=${name}`, 60000);
}

export async function stopProjectTwin(name: string): Promise<ChatResult> {
    return postChat(`Use the ProjectTwin agent action=stop name=${name}`, 30000);
}

export function probeLocalPort(port: number, timeoutMs = 400): Promise<boolean> {
    return new Promise((resolve) => {
        const sock = net.createConnection({ host: '127.0.0.1', port });
        let done = false;
        const finish = (v: boolean) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(v); };
        sock.setTimeout(timeoutMs);
        sock.once('connect', () => finish(true));
        sock.once('error', () => finish(false));
        sock.once('timeout', () => finish(false));
    });
}

export async function waitForPort(port: number, timeoutMs = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probeLocalPort(port)) return true;
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}
