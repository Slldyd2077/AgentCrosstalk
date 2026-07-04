/**
 * Interactive prompt helpers.
 *
 * `promptPassword` reads a line from stdin without echoing it (classic Node
 * `_writeToOutput` mute trick). Used once during SSH trust bootstrap, when the
 * peer's password is needed to install this machine's public key.
 *
 * Note: requires a real TTY — i.e. run `act talk ...` in your own terminal,
 * not piped. That's also where the password should be typed.
 */
import readline from "node:readline";

export function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Suppress echo of typed characters; still show the prompt itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rl as any)._writeToOutput = (s: string) => {
      if (s === prompt) process.stdout.write(s);
    };
    rl.question(prompt, (answer) => {
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}
