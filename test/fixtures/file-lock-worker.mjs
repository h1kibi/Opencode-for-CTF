import { writeFile } from "node:fs/promises"
import { appendCaseEvent, migrateLegacyCase } from "../../src/case-state.ts"
import { atomicUpdateJsonFile } from "../../src/state-store.ts"
import { withFileLock } from "../../src/file-lock.ts"

const [mode, file, iterationsText, delayText, staleText, signalFile] = process.argv.slice(2)
const iterations = Number(iterationsText || 1)
const delay = Number(delayText || 0)
const stale = Number(staleText || 15_000)
const retries = { retries: 80, factor: 1.15, minTimeout: 10, maxTimeout: 250 }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (mode === "increment") {
  for (let index = 0; index < iterations; index++) {
    await atomicUpdateJsonFile(
      file,
      { counter: 0 },
      async (state) => {
        if (delay > 0) await sleep(delay)
        state.counter += 1
        return state
      },
      { stale, retries },
    )
  }
  process.stdout.write("DONE\n")
} else if (mode === "migrate-case") {
  const caseId = signalFile || "migrated"
  const result = await migrateLegacyCase({
    caseId,
    worktree: file,
    legacyStateFiles: [`${file}/legacy.json`],
  })
  process.stdout.write(`${result.migrated ? "MIGRATED" : "EXISTING"}\n`)
} else if (mode === "case-events") {
  const caseId = signalFile || "concurrent"
  for (let index = 0; index < iterations; index += 1) {
    await appendCaseEvent(file, caseId, `worker.${process.pid}`, { index })
    if (delay > 0) await sleep(delay)
  }
  process.stdout.write("DONE\n")
} else if (mode === "stale-atomic") {
  try {
    await atomicUpdateJsonFile(
      file,
      { counter: 0 },
      async (state) => {
        process.stdout.write("LOCKED\n")
        const end = Date.now() + delay
        while (Date.now() < end) {
          // Deliberately block the event loop so the lease can be taken over.
        }
        state.counter = 999
        return state
      },
      { stale, retries, onCompromised: () => undefined },
    )
    process.stdout.write("OLD-WROTE\n")
  } catch (error) {
    if (error?.code !== "ELOCKFENCED") throw error
    process.stdout.write("FENCED\n")
  }
} else if (mode === "stale-release") {
  await withFileLock(
    file,
    async (lease) => {
      process.stdout.write("LOCKED\n")
      const end = Date.now() + delay
      while (Date.now() < end) {
        // Let the parent take over the stale lease.
      }
      while (!signalFile) await sleep(25)
      while (true) {
        try {
          await import("node:fs/promises").then(({ access }) => access(signalFile))
          break
        } catch {
          await sleep(25)
        }
      }
      try {
        await lease.assertOwned()
        throw new Error("expected stale owner to be fenced")
      } catch (error) {
        if (error?.code !== "ELOCKFENCED") throw error
        process.stdout.write("FENCED\n")
      }
    },
    { stale, retries, onCompromised: () => undefined },
  )
} else if (mode === "stale-write") {
  await withFileLock(
    file,
    async (lease) => {
      process.stdout.write("LOCKED\n")
      const end = Date.now() + delay
      while (Date.now() < end) {
        // Deliberately block the event loop so proper-lockfile's heartbeat
        // cannot refresh the lease. The parent process then takes it over.
      }
      try {
        await lease.assertOwned()
        await writeFile(file, JSON.stringify({ counter: 999 }), "utf8")
        process.stdout.write("OLD-WROTE\n")
      } catch (error) {
        if (error?.code !== "ELOCKFENCED") throw error
        process.stdout.write("FENCED\n")
      }
    },
    { stale, retries, onCompromised: () => undefined },
  )
} else if (mode === "hold") {
  await withFileLock(
    file,
    async () => {
      process.stdout.write("LOCKED\n")
      process.stdout.resume()
      await new Promise(() => setInterval(() => {}, 250))
    },
    { stale, retries },
  )
} else {
  throw new Error(`unknown worker mode: ${mode}`)
}
