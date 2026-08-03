import { isCtfSafePermission } from "../plugin-support.ts"

export async function handlePermissionAsk(args: {
  input: { type: string; title: string }
  output: { status?: string }
  isHookEnabled: (hook: any) => boolean
}) {
  if (!args.isHookEnabled("permission_auto_allow")) return
  if (isCtfSafePermission({ type: args.input.type, title: args.input.title })) {
    args.output.status = "allow"
  }
}
