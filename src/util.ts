import { platform as getPlatform } from 'node:os';
import { spawn } from 'node:child_process';

const platform = getPlatform();

export function isWindows(): boolean {
  return platform  === 'win32';
}

export function isMac(): boolean {
  return platform === 'darwin';
}

export function isLinux(): boolean {
  return  platform === 'linux';
}

export interface SpawnPromiseResult {
  stdout: string;
  exitCode: number;
  error?: string;
}

export async function spawnWithPromise(command: string, spawnArgs?: string[]): Promise<SpawnPromiseResult> {
  let exitCode = 0;
  try {
    const content = await new Promise<string>((resolve, reject) => {
      //  launch command
      const child = spawn(command, spawnArgs);
      let output = '';
      child.stdout.setEncoding('utf8');
      // collect output and append the result
      child.stdout.on('data', stdout => (output += stdout));
      child.on('error', reject);
      child.on('exit', code => {
        if (code) {
          exitCode = code;
          reject(
            new Error(
              `Unable to execute the command ${command} ${
                spawnArgs ? spawnArgs.join(' ') : ''
              }. Exited with code ${code}`,
            ),
          );
        } else {
          resolve(output);
        }
      });
    });

    // now, we have the content
    return { stdout: content, exitCode };
  } catch (error) {
    return { stdout: '', exitCode, error: '' + error };
  }
}