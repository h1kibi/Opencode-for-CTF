export type ToolEntry = {
  /** Tool basename without extension; this is the registered tool name. */
  name: string
  path: string
  relative: string
}

export function discoverToolEntries(
  rootDirectory: string,
  options?: { extensions?: string[] },
): Promise<ToolEntry[]>
