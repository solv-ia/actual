import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

import { htechCall, htechTools } from './htech_tools.ts';

// Actual's API logs through console.log. Keep stdio stdout reserved for JSON-RPC.
const htechLogToStderr = (...args: unknown[]) =>
  process.stderr.write(`${format(...args)}\n`);
console.log = htechLogToStderr;
console.info = htechLogToStderr;
console.debug = htechLogToStderr;

type HtechMessage = {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: { name?: string; arguments?: unknown };
  result?: { tools?: unknown[]; [key: string]: unknown };
};

const htechDirectory = path.dirname(fileURLToPath(import.meta.url));
const htechOriginalServer = process.env.HTECH_ORIGINAL_MCP_ENTRY;
const htechApiEntry = process.env.HTECH_ACTUAL_API_ENTRY;
if (!htechOriginalServer || !htechApiEntry) {
  process.stderr.write(
    'HTECH_ORIGINAL_MCP_ENTRY and HTECH_ACTUAL_API_ENTRY are required\n',
  );
  process.exit(1);
}

const htechChild = spawn(
  process.execPath,
  [
    '--experimental-loader',
    path.join(htechDirectory, 'htech_api_loader.mjs'),
    htechOriginalServer,
    '--stdio',
  ],
  { env: process.env, stdio: ['pipe', 'pipe', 'inherit'] },
);
const htechToolNames = new Set(htechTools.map(tool => tool.name));
const htechListRequests = new Set<string | number>();

function htechWrite(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

createInterface({ input: htechChild.stdout }).on('line', line => {
  let message: HtechMessage;
  try {
    message = JSON.parse(line) as HtechMessage;
  } catch {
    process.stderr.write(`${line}\n`);
    return;
  }
  if (
    message.id !== undefined &&
    htechListRequests.delete(message.id) &&
    message.result?.tools
  ) {
    message.result.tools = [...message.result.tools, ...htechTools];
    htechWrite(message);
    return;
  }
  process.stdout.write(`${line}\n`);
});

createInterface({ input: process.stdin }).on('line', line => {
  let message: HtechMessage;
  try {
    message = JSON.parse(line) as HtechMessage;
  } catch {
    htechChild.stdin.write(`${line}\n`);
    return;
  }
  if (message.method === 'tools/list' && message.id !== undefined) {
    htechListRequests.add(message.id);
  }
  if (
    message.method === 'tools/call' &&
    message.id !== undefined &&
    message.params?.name &&
    htechToolNames.has(message.params.name)
  ) {
    const id = message.id;
    const name = message.params.name;
    void htechCall(name, message.params.arguments).then(
      value =>
        htechWrite({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(value) }],
            structuredContent: value,
          },
        }),
      error =>
        htechWrite({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [
              {
                type: 'text',
                text:
                  error instanceof Error
                    ? error.message
                    : 'Receipt tool failed',
              },
            ],
          },
        }),
    );
    return;
  }
  htechChild.stdin.write(`${line}\n`);
});

process.stdin.on('end', () => htechChild.stdin.end());
htechChild.on('error', error => {
  process.stderr.write(`Actual MCP child could not start: ${error.message}\n`);
  process.exitCode = 1;
});
htechChild.on('exit', code => {
  process.exitCode = code ?? 1;
});
