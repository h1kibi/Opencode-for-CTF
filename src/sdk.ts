import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"

export function createRuntimeClient(directory: string): OpencodeClient {
  return createOpencodeClient({ directory })
}

export function createRuntimeClientForServer(directory: string, baseUrl: string): OpencodeClient {
  return createOpencodeClient({ directory, baseUrl })
}
