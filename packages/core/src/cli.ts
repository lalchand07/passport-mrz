import { runCli, type OcrModule } from './cli/run.js';

declare const __VERSION__: string;

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

runCli(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  readStdin,
  // Optional package, resolved at runtime only when --image is used.
  importOcr: () => import('passport-mrz-ocr' as string) as Promise<OcrModule>,
  version: typeof __VERSION__ === 'string' ? __VERSION__ : 'dev',
}).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`Unexpected error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 2;
  },
);
