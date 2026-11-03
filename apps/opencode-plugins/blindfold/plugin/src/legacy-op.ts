import { execFile, type ExecFileException } from "node:child_process"

// Long enough for a slow vault; there is no app to wait for.
const TIMEOUT = 2 * 60_000
const ACCOUNT = "my.1password.com"

function opRead(reference: string, account: string | undefined) {
  const args = ["read", "--no-newline", ...(account ? ["--account", account] : []), reference]
  // The desktop-app integration is off for every call: `op` must never raise the "Allow opencode-cli" dialog, which nobody
  // can answer from a background service. It reads with a service account token (OP_SERVICE_ACCOUNT_TOKEN) or an
  // existing session, and otherwise fails at once.
  const env = { ...process.env, OP_BIOMETRIC_UNLOCK_ENABLED: "false" }
  return new Promise<{ error: ExecFileException | null; stdout: string; stderr: string }>((resolve) => {
    execFile("op", args, { timeout: TIMEOUT, env }, (error, stdout, stderr) => resolve({ error, stdout, stderr }))
  })
}

/** `op read` for a `secrets` entry when no 1Password account of blindfold-providers can serve it. */
export async function readOnePassword(name: string, reference: string, account: string | undefined) {
  let { error, stdout, stderr } = await opRead(reference, account)
  // With one account signed in, op picks it on its own; with several, fall back to the personal account.
  if (error && account === undefined && stderr.includes("multiple accounts found")) {
    ;({ error, stdout, stderr } = await opRead(reference, ACCOUNT))
  }
  const fail = (detail: string) => new Error(`Couldn't read ${name} from 1Password (${reference}): ${detail}`)
  if (error && (error as NodeJS.ErrnoException).code === "ENOENT") throw fail("the 1Password CLI (op) isn't installed.")
  if (error && error.killed) throw fail("timed out waiting for 1Password.")
  if (error) {
    const line = stderr.trim() || error.message
    const signedOut = /not currently signed in|not signed in|authenticat/i.test(line)
    throw fail(signedOut ? `${line} (blindfold does not use the 1Password app; set up a service account in blindfold-providers)` : line)
  }
  if (stdout === "") throw fail("the field is empty.")
  return stdout
}
