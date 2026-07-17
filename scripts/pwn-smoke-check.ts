import { readFileSync } from "node:fs"

type Check = {
  file: string
  needles: string[]
  oneOfNeedles?: string[]
}

const checks: Check[] = [
  {
    file: "tools/ctf-pwn-docker-harness.ts",
    needles: [
      "dockerfile_runtime_hints:",
      "compose_runtime_hints:",
      "alpine_musl_runtime_detected_glibc_pwnlab_may_not_match",
      "musl_runtime_notes:",
      "Do not reuse glibc symbol offsets",
      "substrate_gate:",
      "Explicit loader command:",
      "bundled_libc_present_do_not_validate_heap_or_overlap_on_mismatched_base",
    ],
  },
  {
    file: "tools/ctf-pwn-docker-runner.ts",
    needles: [
      'schema_version: "pwn_docker_runner.v4"',
      "saveOutput",
      "outputPath",
      "output_truncated",
      "output_saved",
      "output_path",
      "success_by_regex",
      "path_equivalence:",
      "Raw stdout/stderr can be saved to a workspace log file",
    ],
  },
  {
    file: "tools/ctf-pwn-redflag-panel.ts",
    needles: [
      'schema_version: "pwn_redflag_panel.v1"',
      "stack_layout_hints:",
      "constraint_hints:",
      "route_pressure:",
      "stop_rule:",
    ],
  },
  {
    file: "tools/ctf-pwn-syscall-orw-check.ts",
    needles: [
      "syscall_abi_hints:",
      "schema_version: pwn_syscall_orw_check.v1",
      "prefer_direct_file_read_or_orw_route_over_shell",
      "arg0: rdi",
      "arg0: ebx",
      "arg0: x0",
    ],
  },
  {
    file: "tools/ctf-pwn-ret2csu-check.ts",
    needles: [
      "gadget_shape:",
      "schema_version: pwn_ret2csu_check.v1",
      "promotion_gate:",
      "complete_pop_and_call_shape",
      "ret2csu_partial_shape_needs_matching_second_gadget_before_promotion",
    ],
  },
  {
    file: "tools/ctf-pwn-playbook-router.ts",
    needles: [
      "jsonOnly",
      "schema_version: pwn_playbook_router.v1",
      'schema_version: "pwn_playbook_router.v1"',
      "signals,",
      "ret2csu-call-primitive",
      "seccomp-orw-syscall",
      "signal_summary:",
      "crash-control-reduction",
      "remote-drift-recheck",
      "runner-result-closure-check",
      "closure_priority:",
      "libc resolver evidence",
      "format-map evidence",
      "heap-menu-map evidence",
      "syscall ABI known",
      "complete ret2csu gadget shape",
    ],
  },
  {
    file: "tools/ctf-pwn-io-diff-check.ts",
    needles: [
      'schema_version: "pwn_io_diff_check.v1"',
      "fixed_length_read_suspected",
      "menu_desync_risk",
      "payload_shortfall",
      "stop_rule:",
    ],
  },
  {
    file: "tools/ctf-pwn-runner.ts",
    needles: [
      "const envRemote",
      "const remoteSuccess",
      'schema_version: "pwn_runner_summary.v1"',
      "remote_success: remoteSuccess",
      "host_execution_blocked",
      'recommended_runner: "ctf-pwn-docker-runner"',
    ],
  },
  {
    file: "tools/ctf-binary-probe.ts",
    needles: [
      "probe_backend:",
      "backend_decision_reason:",
      "preferred_backend_for_future_steps:",
      "docker_fallback_used:",
      "packer_suspected:",
      "packer_confidence:",
      "packer_signals:",
      "DOCKER_PROBE_IMAGE",
      "safeExecDocker",
    ],
  },
  {
    file: "tools/ctf-safe-extract.ts",
    needles: [
      "if (await find7z())",
      'if (await exists("jar"))',
      'return "7z"',
      'return "jar"',
      "scanZipLocalHeaders",
      "inferZipDataEnd",
      "zip-local-header-recovery",
    ],
  },
  {
    file: "tools/archive-safe-extract.ts",
    needles: ['if (await exists("7z"))', 'if (await exists("jar"))', 'return "7z"', 'return "jar"'],
  },
  {
    file: "docker/Dockerfile.pwnlab.general-ubuntu22.04",
    needles: ["angr", "claripy", "z3-solver", "OK angr", "OK claripy", "OK z3"],
  },
  {
    file: "tools/ctf-pwn-disasm-constraint-map.ts",
    needles: [
      'schema_version: "pwn_disasm_constraint_map.v1"',
      "stack_layout_hints:",
      "constraint_hints:",
      "route_pressure:",
      "next_focus:",
    ],
  },
  {
    file: "tools/ctf-pwn-stack-frame-solver.ts",
    needles: [
      'schema_version: "pwn_stack_frame_solver.v1"',
      "rbp_expressions:",
      "candidate_leak_surfaces:",
      "route_pressure:",
    ],
  },
  {
    file: "tools/ctf-pwn-got-leak-router.ts",
    needles: [
      'schema_version: "pwn_got_leak_router.v1"',
      "FRAME_INDEXED_PRINTF_LEAK",
      "rbp-relative-pointer-fed-into-print",
      "routes:",
      "recommended_next:",
    ],
  },
  {
    file: "tools/ctf-pwn-stage-harness.ts",
    needles: [
      'schema_version: "pwn_stage_harness.v1"',
      "saved_rbp_ret_to_callsite",
      "payload_file=",
      "recommended_flow:",
      "Use ctf-pwn-docker-runner",
    ],
  },
  {
    file: "tools/ctf-pwn-stage-delta-runner.ts",
    needles: ['schema_version: "pwn_stage_delta_runner.v1"', "snapshot_file=", "registers_added:", "recommended_use:"],
  },
  {
    file: "tools/ctf-pwn-fast-bootstrap.ts",
    needles: [
      "route_scores",
      '"heap-simple": 0',
      "const routeDecision = classifyRoute(evidence)",
      "substrate_gate",
      "ctf-pwn-libc-runtime-doctor",
      "pwn_fast_shellcode.py",
    ],
  },
  {
    file: "docker/Dockerfile.pwnlab.general-ubuntu18.04",
    needles: ["bootstrap.pypa.io/pip/3.6/get-pip.py", "pwntools==4.9.0", "OK pwntools", "/usr/local/bin/checksec"],
  },
  {
    file: "tools/ctf-pwn-crash-probe.ts",
    needles: [
      "input_mode:",
      "mode: tool.schema.string",
      "Input mode: stdin | argv",
      "argvPrefixJson",
      "payloadFile",
      "payload_file:",
      "stdinPayload",
      "argvPayload",
      "custom_payload:",
      "argv_prefix_count:",
    ],
  },
  {
    file: "tools/ctf-pwn-libc-runtime-doctor.ts",
    needles: [
      "pwn_libc_runtime_doctor:",
      "recommended_image:",
      "explicit_loader_command:",
      "stop_condition:",
      "bundled_libc_present_force_runtime_lock",
    ],
  },
  {
    file: "tools/ctf-pwn-menu-contract-probe.ts",
    needles: ["pwn_menu_contract_probe:", "read_exact:", "helper_contract:"],
  },
  {
    file: "tools/ctf-pwn-heap-overlap-mapper.ts",
    needles: ["pwn_heap_overlap_mapper:", "pairs:", "recommendations:"],
  },
  {
    file: "tools/ctf-pwn-wp-diff.ts",
    needles: ["pwn_wp_diff:", "shared_route_signals:", "wp_only_signals:", "current_only_signals:"],
  },
  {
    file: "tools/ctf-pwn-gdb-snapshot.ts",
    needles: [
      "pwn_gdb_snapshot:",
      "signal_class:",
      "registers:",
      "backtrace:",
      "mapping_sample:",
      "memory_views:",
      "gdb_unavailable",
      "noInit",
      "quickProfile",
      "-nx",
      "patch_register_count:",
      "patch_memory_count:",
      "continue_after_patch:",
      "expect_rip_matched:",
      "expect_contains_matched:",
      "termination_state:",
    ],
  },
  {
    file: "tools/ctf-pwn-linux-session.ts",
    needles: [
      "PWN_LINUX_SESSION",
      "runtime_profile_id:",
      "recommended_image:",
      "recommended_service:",
      "docker_runner_defaults:",
      "ctf-pwn-gdb-snapshot runtimeProfileId=",
      "ctf-pwn-expect-runner mode=docker runtimeProfileId=",
    ],
  },
  {
    file: "tools/ctf-pwn-wsl-runner.ts",
    needles: [
      "healthOnly",
      "runWslHealth",
      "wsl_health_ok",
      "failure_kind",
      "primary_error_line",
      "suggested_fix",
      "noise_lines_removed",
      'schema_version: "pwn_wsl_runner.v2"',
      "Use healthOnly=true first",
    ],
  },
  {
    file: "tools/ctf-go-binary-assist.ts",
    needles: ["detected_go", "go_signals", "user_code_candidates", "runtime_noise_candidates", "recommended_next"],
  },
  {
    file: "commands/image-info.md",
    needles: [
      "image-file-info",
      "this model lacks vision input",
      "do not use generic file read first",
      "do not retry direct visual reading",
    ],
  },
  {
    file: "commands/ctf-pwn-vm-open.md",
    needles: [
      "PWN VM opener",
      "ctf-binary-probe",
      "ctf-elf-slice",
      "ctf-pwn-vm-bytecode-helper",
      "PWN_VM_OPEN",
      "dispatcher_signals:",
      "high_risk_path:",
      "If `ctf-binary-probe` suggests generic ret2libc/ret2system seeds",
      "read_handlers`, `write_handlers`, `bounds_to_offsets`, or `high_risk_paths`",
      "next_probe:",
    ],
  },
  {
    file: "tools/ctf-pwn-vm-bytecode-helper.ts",
    needles: [
      "pwn_vm_bytecode_helper:",
      "dispatcher_signals:",
      "dispatcher_models:",
      "dispatcher_table_hints:",
      "dispatcher_base_hints:",
      "candidate_handlers:",
      "read_handlers:",
      "write_handlers:",
      "bounds_check_signals:",
      "state_slot_clusters:",
      "bounds_to_offsets:",
      "high_risk_paths:",
      "opcode_width_hints:",
      "recommended_next:",
    ],
  },
  {
    file: "tools/ctf-rev-unicorn-helper.ts",
    needles: [
      'schema_version: "rev_unicorn_helper.v2"',
      "detected_unicorn_style",
      "inferred_arch",
      "live_dump_needed",
      "marker_driven_dump_plan",
      "replay_builder_plan",
      "replay_plan",
      "replay_skeleton",
      "helper_chain",
      "recommended_next",
    ],
  },
  {
    file: "tools/ctf-rev-live-memory-dump.ts",
    needles: [
      'schema_version: "rev_live_memory_dump.v1"',
      "stdout marker",
      "dump only after a stable marker",
      "ctf-pwn-docker-runner",
      "ctf-pwn-wsl-runner",
      "helper_script_preview",
      "/proc/{pid}/mem",
    ],
  },
  {
    file: "tools/ctf-rev-unicorn-replay-builder.ts",
    needles: [
      'schema_version: "rev_unicorn_replay_builder.v1"',
      "payload_file",
      "replay_script",
      "UC_ARCH_RISCV",
      "UC_MODE_RISCV64",
      "mu.emu_start",
      "next_actions",
      "replay_script_preview",
    ],
  },
  {
    file: "tools/ctf-pwn-leak-ledger.ts",
    needles: ["pwn_leak_ledger:", "forbidden_final_math", "unknown/stack/heap", "recommended_next:"],
  },
  {
    file: "tools/ctf-pwn-closure-router.ts",
    needles: [
      "pwn_closure_router:",
      "priority_queue:",
      "direct_file_read_or_orw_closure",
      "one_shot_command_or_limited_shell_closure",
      "stop_rule:",
    ],
  },
  {
    file: "tools/ctf-pwn-heap-reduction-check.ts",
    needles: ["pwn_heap_reduction_check:", "missing_prerequisites:", "anti_routes:", "primitive_upgrade_path:"],
  },
  {
    file: "tools/ctf-pwn-heap-state-diff.ts",
    needles: ["pwn_heap_state_diff:", "operation_deltas:", "clues:", "next_questions:"],
  },
  {
    file: "agents/ctf-pwn.md",
    needles: [
      "PWN ENVIRONMENT ROUTING",
      "prefer Docker pwnlab over WSL",
      "pwn_env_setup.ps1",
      "docker-compose.revlab.yml",
      "PWN CONTEST AUTOPILOT",
      "EXPLOIT TEMPLATE RULE",
      "REMOTE DRIFT CHECKLIST",
      "HEAP VERSION ROUTING",
      "PWN NOTES DISCIPLINE",
      "templates\\pwn_notes.md",
      "Protection Summary",
      "Primitive Ladder",
      "Remote Drift Checklist",
      "Calibration Ledger",
      "Post-Exploit Near-Success Classification",
      "EXPLOIT CALIBRATION STATE MACHINE",
      "CONTROL_CONFIRMED",
      "CALIBRATION",
      "pwn-route-matrix.md",
      "heap-version-route-matrix.md",
      "ctf-pwn-syscall-orw-check",
      "ctf-pwn-ret2csu-check",
      "ctf-pwn-leak-ledger",
      "ctf-pwn-closure-router",
      "ctf-pwn-heap-reduction-check",
      "ctf-pwn-heap-state-diff",
      "ctf-pwn-gdb-snapshot",
      "pwn-runtime-substrate-lock.md",
      "pwn-output-hijack-closure.md",
      "pwn-near-success-classifier.md",
      "work/ctf-evidence",
      "final-verification.txt",
    ],
  },
  {
    file: "agents/ctf-fast.md",
    needles: [
      "CTF PWN Fast Mode",
      "15-Minute Soft Budget",
      "references/pwn-fast-autonomy.md",
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
      "ctf-binary-probe",
      "ctf-pwn-crash-probe",
      "ctf-pwn-docker-harness",
      "ctf-pwn-libc-resolver",
      "ctf-pwn-libc-runtime-doctor",
      "ctf-pwn-menu-contract-probe",
      "ctf-pwn-remote-drift-check",
      "Use the larger `solve_pwn.py` only when a generic scaffold is more useful",
      "prebuilt pwnlab Docker runbox (`pwnlab:general-ubuntu22.04`)",
      "Do not split analysis across host/WSL/container after this lock.",
      "If local works but remote fails, use `ctf-pwn-remote-drift-check` before gadget or libc roulette.",
      "Stop pretending it is fast if you need a top-3 queue",
      "ctf-pwn-gdb-snapshot",
    ],
  },
  {
    file: "agents/ctf-master.md",
    needles: [
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
      "references/runtime-closure-index.md",
      "ctf-pwn-syscall-orw-check",
      "ctf-pwn-ret2csu-check",
      "ctf-pwn-gdb-snapshot",
      "work/ctf-evidence",
    ],
  },
  {
    file: "skills/ctf-pwn/SKILL.md",
    needles: [
      "Keep this skill thin.",
      "references/REFERENCE_INDEX.md",
      "references/pwn-fast-autonomy.md",
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
      "pwn-route-matrix.md",
      "heap-family-first-questions.md",
      "heap-version-route-matrix.md",
      "leak-to-primitive-ladder.md",
      "partial-control-to-arbitrary-write-read.md",
      "remote-local-divergence.md",
      "seccomp-sandbox-closure.md",
      "glibc-version-uncertainty-routing.md",
      "exploit-calibration.md",
      "pwn-near-success-classifier.md",
      "pwn-output-hijack-closure.md",
      "pwn-runtime-substrate-lock.md",
    ],
  },
  {
    file: "commands/ctf-pwn.md",
    needles: [
      "ctf-fast",
      "/ctf-master",
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
      "Prefer pwntools scripts over fragile shell pipes",
    ],
  },
  {
    file: "commands/ctf-fast.md",
    needles: [
      "agent: ctf-fast",
      "references/pwn-fast-autonomy.md",
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
      "ctf-pwn-fast-bootstrap",
      "ctf-pwn-template-init",
      "ctf-pwn-container-probe",
      "ctf-pwn-libc-resolver",
      "ctf-pwn-libc-runtime-doctor",
      "ctf-pwn-menu-contract-probe",
      "templates/pwn_fast_ret2win.py",
      "ctf-pwn-io-diff-check",
      "output_path",
      "contest_meta",
    ],
  },
  {
    file: "commands/ctf-pwn-runtime-doctor.md",
    needles: ["ctf-pwn-libc-runtime-doctor", "explicit_loader_command", "stop_condition"],
  },
  {
    file: "commands/ctf-pwn-menu-contract.md",
    needles: ["ctf-pwn-menu-contract-probe", "helper_contract", "recommended_send_mode"],
  },
  {
    file: "commands/ctf-pwn-overlap-map.md",
    needles: ["ctf-pwn-heap-overlap-mapper", "pairs:", "recommended_next_probe"],
  },
  {
    file: "commands/ctf-pwn-wp-diff.md",
    needles: ["ctf-pwn-wp-diff", "shared_route_signals:", "recommended_next_diff:"],
  },
  {
    file: "commands/ctf-pwn-replay.md",
    needles: [
      "PWN_REPLAY_PLAN",
      "ctf-pwn-libc-runtime-doctor",
      "ctf-pwn-menu-contract-probe",
      "ctf-pwn-heap-overlap-mapper",
      "ctf-pwn-wp-diff",
      "templates/pwn_failure_signature.md",
    ],
  },
  {
    file: "commands/ctf-master.md",
    needles: [
      "entry: `/ctf`, `/ctf-fast`, `/ctf-master`, `/ctf-fast`",
      "state/control: `/ctf-resume`, `/ctf-snapshot`, `/ctf-control`, `/ctf-signal-memory`, `/ctf-evidence`",
      "closure/final: `/ctf-closure`, `/ctf-close`, `/ctf-final`, `/ctf-retro-lite`",
      "references/pwn-mode-boundary.md",
      "references/pwn-runtime-trigger-matrix.md",
    ],
  },
  {
    file: "commands/ctf-final.md",
    needles: ["work/ctf-evidence", "solve-output.txt", "final-verification.txt"],
  },
  {
    file: "commands/ctf-close.md",
    needles: ["work/ctf-evidence", "closure.json", "final-verification.txt"],
  },
  {
    file: "commands/ctf-resume.md",
    needles: ["templates/ctf_resume_packet.md", "ctf_fast_handoff.md", "ctf_handoff.md", "ctf_evidence_snapshot.md"],
  },
  {
    file: "skills/ctf-common/SKILL.md",
    needles: [
      "templates/ctf_plan.md",
      "templates/ctf_handoff.md",
      "templates/ctf_evidence_snapshot.md",
      "work/ctf-evidence/<challenge-slug>/",
      "final-verification.txt",
      "solve-output.txt",
    ],
  },
  {
    file: "skills/ctf-web/references/web-closure-matrix.md",
    needles: [
      "Highest-value closure path",
      "Downgrade trigger",
      "source leak",
      "file read / LFI",
      "upload / file write",
    ],
  },
  {
    file: "skills/ctf-pwn/references/pwn-output-hijack-closure.md",
    needles: ["Use this reference when a confirmed write", "output path", "Downgrade rule"],
  },
  {
    file: "skills/ctf-pwn/references/pwn-near-success-classifier.md",
    needles: [
      "shell likely spawned, command set limited",
      "file-read primitive likely works without shell",
      "stdout/stderr closure differs",
    ],
  },
  {
    file: "skills/ctf-pwn/references/pwn-runtime-substrate-lock.md",
    needles: ["SUBSTRATE_WINDOWS_PS", "SUBSTRATE_DOCKER", "SUBSTRATE_WSL", "Minimal lock card"],
  },
  {
    file: "skills/ctf-pwn/references/REFERENCE_INDEX.md",
    needles: [
      "# PWN Reference Index",
      "## Route Families",
      "## Trigger Rules",
      "## Maintenance Rule",
      "pwn-fast-autonomy.md",
      "pwn-mode-boundary.md",
      "pwn-runtime-trigger-matrix.md",
      "knowledge/pwn/runtime/bundled-libc-first.md",
      "knowledge/pwn/runtime/exact-read-contracts.md",
      "knowledge/pwn/curated/kernel-route-gate.md",
      "bundled-libc-first.md",
      "wrong-libc-anti-pattern.md",
      "exact-read-contracts.md",
      "glibc27-fake-stdout-shortplaybook.md",
      "free_hook-setcontext-orw.md",
      "seccomp-closure-router.md",
    ],
  },
  {
    file: "skills/ctf-pwn/references/pwn-fast-autonomy.md",
    needles: [
      "# PWN Fast Autonomy",
      "exploit.py",
      "Helper Demotion Rules",
      "Soft Budget Interpretation",
      "Hard Guardrails That Still Stay",
    ],
  },
  {
    file: "skills/ctf-pwn/references/pwn-mode-boundary.md",
    needles: ["# PWN Mode Boundary", "ctf-fast", "ctf-master", "ctf-pwn", "Fast-to-Rigorous Handoff Minimum"],
  },
  {
    file: "skills/ctf-pwn/references/pwn-runtime-trigger-matrix.md",
    needles: [
      "# PWN Runtime Trigger Matrix",
      "ctf-pwn-libc-runtime-doctor",
      "ctf-pwn-container-probe",
      "ctf-pwn-menu-contract-probe",
      "ctf-pwn-remote-drift-check",
      "ctf-pwn-io-diff-check",
    ],
  },
  {
    file: "knowledge/pwn/README.md",
    needles: [
      "PWN Knowledge Index",
      "runtime-aware",
      "closure-first",
      "bundled-libc-first.md",
      "glibc-version-route-map.md",
      "exact-read-contracts.md",
      "glibc27-fake-stdout-shortplaybook.md",
      "free_hook_setcontext_orw.md",
      "seccomp-closure-router.md",
      "pwn-anti-patterns.md",
      "CARD_TEMPLATE.md",
      "retrieval-fields.md",
      "musl-heap-differences.md",
      "windows-x64-shortplaybook.md",
      "aarch64-pwn-shortplaybook.md",
      "mipsel-pwn-shortplaybook.md",
      "kernel-route-gate.md",
      "qemu-device-route-gate.md",
      "browser-jit-vm-route-gate.md",
      "race-ufd-route-gate.md",
    ],
  },
  {
    file: "knowledge/pwn/runtime/bundled-libc-first.md",
    needles: ["Bundled Libc First", "ctf-pwn-libc-runtime-doctor", "heap overlap"],
  },
  {
    file: "knowledge/pwn/runtime/glibc-version-route-map.md",
    needles: ["glibc Version Route Map", "glibc 2.23鈥?.27", "__free_hook", "setcontext+53"],
  },
  {
    file: "knowledge/pwn/runtime/exact-read-contracts.md",
    needles: ["Exact Read Contracts", "read(size+1)", "ctf-pwn-menu-contract-probe", "sendline"],
  },
  {
    file: "knowledge/pwn/curated/glibc27-fake-stdout-shortplaybook.md",
    needles: ["glibc 2.27 Fake stdout Short Playbook", "setcontext+53", "fake stdout"],
  },
  {
    file: "knowledge/pwn/closure/free_hook_setcontext_orw.md",
    needles: ["free_hook -> setcontext+53 -> ORW", "__free_hook", "setcontext+53", "ORW"],
  },
  {
    file: "knowledge/pwn/closure/seccomp-closure-router.md",
    needles: ["Seccomp Closure Router", "execve", "existing fd", "ctf-pwn-syscall-orw-check"],
  },
  {
    file: "knowledge/pwn/anti-patterns/pwn-anti-patterns.md",
    needles: [
      "PWN Anti-Patterns",
      "Wrong libc / wrong base validation",
      "Menu helper drift",
      "Primitive already exists but branch stays broad",
    ],
  },
  {
    file: "knowledge/pwn/curated/CARD_TEMPLATE.md",
    needles: ["PWN Decision Card Template", "glibc_version", "closure_family", "Next Probe"],
  },
  {
    file: "knowledge/pwn/retrieval-fields.md",
    needles: ["PWN Retrieval Fields", "glibc_version", "Ranking Policy", "The best hit should answer"],
  },
  {
    file: "knowledge/pwn/runtime/musl-heap-differences.md",
    needles: ["musl Heap Differences", "challenge runtime", "glibc-specific"],
  },
  {
    file: "knowledge/pwn/curated/windows-x64-shortplaybook.md",
    needles: ["Windows x64 Short Playbook", "PE/x64", "ELF assumptions"],
  },
  {
    file: "knowledge/pwn/curated/aarch64-pwn-shortplaybook.md",
    needles: ["AArch64 PWN Short Playbook", "ABI", "amd64"],
  },
  {
    file: "knowledge/pwn/curated/mipsel-pwn-shortplaybook.md",
    needles: ["MIPSel PWN Short Playbook", "MIPSel", "x86/amd64"],
  },
  {
    file: "knowledge/pwn/curated/kernel-route-gate.md",
    needles: ["Kernel Route Gate", "ioctl", "payloads further"],
  },
  {
    file: "knowledge/pwn/curated/qemu-device-route-gate.md",
    needles: ["QEMU Device Route Gate", "MMIO", "device state model"],
  },
  {
    file: "knowledge/pwn/curated/browser-jit-vm-route-gate.md",
    needles: ["Browser JIT VM Route Gate", "addrof", "memory model"],
  },
  {
    file: "knowledge/pwn/curated/race-ufd-route-gate.md",
    needles: ["Race / userfaultfd Route Gate", "oracle", "race window"],
  },
  {
    file: "skills/ctf-pwn/references/runtime-closure-index.md",
    needles: [
      "PWN Runtime / Closure Index",
      "bundled-libc-first.md",
      "exact-read-contracts.md",
      "anti-pattern",
      "Next Probe Rule",
    ],
  },
  {
    file: "skills/ctf-pwn/references/runtime-closure-index.md",
    needles: [
      "PWN Runtime / Closure Index",
      "bundled-libc-first.md",
      "exact-read-contracts.md",
      "anti-pattern",
      "Next Probe Rule",
    ],
  },
  {
    file: "skills/ctf-pwn/references/bundled-libc-first.md",
    needles: [
      "Bundled libc first: lock runtime before heap probing",
      "bundled libc first",
      "ctf-pwn-libc-runtime-doctor",
    ],
  },
  {
    file: "skills/ctf-pwn/references/wrong-libc-anti-pattern.md",
    needles: ["Wrong libc anti-pattern for heap verification", "wrong libc", "ctf-pwn-libc-runtime-doctor"],
  },
  {
    file: "skills/ctf-pwn/references/exact-read-contracts.md",
    needles: ["Exact read(size+1) menu desync contract", "read(size+1)", "ctf-pwn-menu-contract-probe"],
  },
  {
    file: "skills/ctf-pwn/references/glibc27-fake-stdout-shortplaybook.md",
    needles: ["glibc 2.27 fake stdout to __free_hook setcontext ORW", "setcontext+53", "fake stdout"],
  },
  {
    file: "skills/ctf-pwn/references/free_hook-setcontext-orw.md",
    needles: ["free_hook-setcontext-orw", "setcontext+53", "ORW"],
  },
  {
    file: "skills/ctf-pwn/references/seccomp-closure-router.md",
    needles: [
      "closure router: seccomp ORW / FILE / output-hijack",
      "seccomp closure router",
      "ctf-pwn-syscall-orw-check",
    ],
  },
  {
    file: "knowledge/pwn/anti-patterns/wrong-libc-anti-pattern.md",
    needles: ["Wrong Libc / Wrong Base Validation", "ctf-pwn-libc-runtime-doctor", "heap overlap"],
  },
  {
    file: "tools/ctf-skill-repo-search.ts",
    needles: ["DEFAULT_LOCAL_PWN", "knowledge/pwn/", "bundled-libc-first", "runtime-closure-index"],
  },
  {
    file: "tools/ctf-pattern-card-search.ts",
    needles: ["DEFAULT_PWN_CURATED_INDEX", "pwn-curated.cards.v1.json", "local-pwn-curated", "rank_boost"],
  },
  {
    file: "knowledge/pattern-cards/pwn-curated.cards.v1.json",
    needles: [
      "pwn-runtime-bundled-libc-first",
      "glibc27 fake stdout short playbook",
      "free_hook to setcontext+53 to ORW",
      "seccomp closure router",
      "rank_boost",
      '"curated": true',
    ],
  },
  {
    file: "skills/ctf-web/references/REFERENCE_INDEX.md",
    needles: ["# Web Reference Index", "## Recon / Mapping", "## Closure / Endgame", "## Maintenance Rule"],
  },
  {
    file: "templates/ctf_plan.md",
    needles: ["# CTF Plan", "## Route Score", "## Top-3 Hypotheses", "## Closure Model"],
  },
  {
    file: "templates/ctf_handoff.md",
    needles: ["# CTF Handoff", "## Current Owner", "## Best Evidence", "## Branch State"],
  },
  {
    file: "templates/ctf_evidence_snapshot.md",
    needles: ["# CTF Evidence Snapshot", "## Strongest Evidence", "## Confirmed Primitive", "## Next Probe"],
  },
  {
    file: "docs/CTF_COMMAND_LAYERS.md",
    needles: [
      "# CTF Command Layers",
      "## Entry Commands",
      "## State / Control Commands",
      "## Closure / Final Commands",
    ],
  },
  {
    file: "docs/CTF_COMMAND_LAYERS.md",
    needles: ["## Soft Deprecation Policy", "Soft-deprecated helper note:"],
  },
  {
    file: "commands/ctf-choose.md",
    needles: [
      "Soft-deprecated helper note:",
      "Prefer `/ctf`",
      "Keep `/ctf-choose` only as a thin mode-selection helper",
    ],
  },
  {
    file: "commands/ctf-route.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf` as the standard route-only front door"],
  },
  {
    file: "commands/ctf-branch.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-control`"],
  },
  {
    file: "commands/ctf-recover.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-resume`"],
  },
  {
    file: "commands/ctf-endgame.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-close`", "Prefer `/ctf-final`"],
  },
  {
    file: "commands/ctf-escalate.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-control`"],
  },
  {
    file: "commands/ctf-state-update.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-snapshot` or `/ctf-control`"],
  },
  {
    file: "commands/ctf-budget.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-hard-open`, `/ctf-master`, or `/ctf-stop-gate`"],
  },
  {
    file: "commands/ctf-owner.md",
    needles: ["Soft-deprecated helper note:", "Prefer `/ctf-control`"],
  },
  {
    file: "templates/solve_pwn.py",
    needles: [
      "document_orw_route",
      "document_ret2csu_route",
      "leak_to_u64",
      "parse_first_pointer",
      "classify_address",
      "calc_base",
      "require_range",
      "ret2libc_chain",
      "amd64_orw_chain",
      "log_drift_context",
      "--debug-drift",
      "--payload-file",
      "--argv",
      "shlex.split",
      "--hex-payload",
      "--line-payload",
      "--dry-run-payload",
      "--recvuntil",
      "--sendafter",
      "--sendline",
      "--ld",
      "--use-bundled-libc",
      "ctf-pwn-syscall-orw-check",
      "ctf-pwn-ret2csu-check",
    ],
  },
  {
    file: "commands/ctf-pwn-env.md",
    needles: [
      "Prepare or select a Docker-based pwnlab environment instead of WSL",
      "Prefer Docker pwnlab over WSL",
      "ctf-pwn-docker-harness",
      "ctf-pwn-libc-runtime-doctor",
      "explicit_loader_command",
      "pwn_env_setup.ps1",
      "docker-compose.revlab.yml",
      "Dockerfile.pwnlab.ubuntu22.04",
      "PWN_ENV_PLAN",
      "Ask before running Docker build",
    ],
  },
  {
    file: "benchmarks/pwn/bundled-libc-hard-gate/expected_behavior.md",
    needles: ["bundled-libc-hard-gate", "ctf-pwn-libc-runtime-doctor", "hard gate"],
  },
  {
    file: "benchmarks/pwn/menu-read-contract-lock/expected_behavior.md",
    needles: ["menu-read-contract-lock", "ctf-pwn-menu-contract-probe", "helper contract"],
  },
  {
    file: "templates/pwn_env_setup.ps1",
    needles: [
      "docker-compose.revlab.yml",
      "Dockerfile.pwnlab.ubuntu18.04",
      "Dockerfile.pwnlab.ubuntu20.04",
      "Dockerfile.pwnlab.ubuntu22.04",
      "Dockerfile.pwnlab.ubuntu24.04",
      "Dockerfile.pwnlab.i386-ubuntu20.04",
      "solve_pwn.py",
      "pwn_notes.md",
      "pwn_retro.md",
      "docker compose -f docker-compose.revlab.yml",
      "checksec --file=./chall",
    ],
  },
  {
    file: "docker/docker-compose.revlab.yml",
    needles: [
      "pwn-ubuntu18",
      "pwn-ubuntu20",
      "pwn-ubuntu22",
      "pwn-ubuntu24",
      "pwn-i386",
      "SYS_PTRACE",
      "seccomp=unconfined",
    ],
  },
  {
    file: "docker/Dockerfile.pwnlab.ubuntu22.04",
    needles: ["pwntools", "ROPGadget", "ropper", "one_gadget", "seccomp-tools", "gdbserver", "strace", "ltrace"],
  },
  {
    file: "skills/ctf-pwn/references/pwn-route-matrix.md",
    needles: [
      "# PWN Route Matrix",
      "No Canary + No PIE",
      "Canary On",
      "PIE On",
      "Full RELRO",
      "Static Binary",
      "Seccomp / Sandbox",
      "Format String",
      "Heap Menu",
    ],
  },
  {
    file: "skills/ctf-pwn/references/heap-version-route-matrix.md",
    needles: [
      "# Heap Version Route Matrix",
      "glibc <= 2.23",
      "glibc 2.32 - 2.33",
      "glibc >= 2.34",
      "Safe-linking",
      "Primitive-to-Route Map",
      "No version -> no named technique",
    ],
  },
  {
    file: "skills/ctf-pwn/references/heap-family-first-questions.md",
    needles: ["Heap Family First Questions", "Mandatory Reduction Table", "technique-first drift", "Stop / Pivot Rule"],
  },
  {
    file: "skills/ctf-pwn/references/leak-to-primitive-ladder.md",
    needles: [
      "Leak to Primitive Ladder",
      "Leak Classification",
      "Unknown-class leaks cannot drive final ROP",
      "Ladder",
    ],
  },
  {
    file: "skills/ctf-pwn/references/partial-control-to-arbitrary-write-read.md",
    needles: ["Partial Control", "Upgrade Paths", "partial overwrite", "stability"],
  },
  {
    file: "skills/ctf-pwn/references/remote-local-divergence.md",
    needles: [
      "Remote Local Divergence",
      "Drift Checklist Order",
      "ctf-pwn-remote-drift-check",
      "remote brute-force gadgets",
    ],
  },
  {
    file: "skills/ctf-pwn/references/seccomp-sandbox-closure.md",
    needles: ["Seccomp Sandbox Closure", "ctf-pwn-syscall-orw-check", "ORW", "execve"],
  },
  {
    file: "skills/ctf-pwn/references/glibc-version-uncertainty-routing.md",
    needles: [
      "glibc Version Uncertainty Routing",
      "Version Sources by Reliability",
      "ctf-pwn-libc-resolver",
      "glibc >= 2.34",
    ],
  },
  {
    file: "skills/ctf-pwn/references/exploit-calibration.md",
    needles: [
      "# Exploit Calibration",
      "When to Load",
      "Calibration Workflow",
      "Calibration Ledger",
      "Parser Side-Effect Checks",
      "Minimum Closure Proof",
      "Near-Success Classification",
      "Do not immediately reopen route selection",
    ],
  },
  {
    file: "lessons/failure-pwn-control-confirmed-but-not-calibrated.md",
    needles: [
      "pwn control confirmed but exploit not calibrated",
      "route was probably already correct",
      "stop horizontal exploration",
      "calibration ledger",
      "post-exploit diagnostics",
    ],
  },
  {
    file: "benchmarks/pwn/control-confirmed-calibration/expected_behavior.md",
    needles: [
      "control-confirmed-calibration",
      "Stop broad family exploration",
      "Calibration Ledger",
      "one variable at a time",
      "Minimum local closure proof",
    ],
  },
  {
    file: "benchmarks/pwn/post-exploit-near-success/expected_behavior.md",
    needles: [
      "post-exploit-near-success",
      "possible near-success",
      "one command at a time",
      "cat /flag",
      "shell aesthetics",
    ],
  },
  {
    file: "benchmarks/pwn/parser-side-effect-overflow/expected_behavior.md",
    needles: [
      "parser-side-effect-overflow",
      "calibration blockers",
      "spaces, plus signs, null bytes, newlines",
      "preserve/no-write regions",
      "differential experiments",
    ],
  },
  {
    file: "benchmarks/pwn/ret2win-basic/expected_behavior.md",
    needles: ["ret2win-basic", "ctf-fast", "ctf-binary-probe", "ctf-pwn-crash-probe", "ctf-pwn-runner"],
  },
  {
    file: "benchmarks/pwn/fmtstr-leak-write/expected_behavior.md",
    needles: ["fmtstr-leak-write", "ctf-pwn-format-map", "leak-to-primitive-ladder.md", "%n", "RELRO"],
  },
  {
    file: "benchmarks/pwn/seccomp-orw/expected_behavior.md",
    needles: ["seccomp-orw", "ctf-pwn-syscall-orw-check", "seccomp-sandbox-closure.md", "ORW", "Agent Should Not"],
  },
  {
    file: "benchmarks/pwn/heap-tcache-poisoning/expected_behavior.md",
    needles: [
      "heap-tcache-poisoning",
      "ctf-pwn-heap-menu-map",
      "heap-family-first-questions.md",
      "heap-version-route-matrix.md",
      "glibc >= 2.34",
    ],
  },
  {
    file: "benchmarks/pwn/remote-drift/expected_behavior.md",
    needles: [
      "remote-drift",
      "ctf-pwn-remote-drift-check",
      "remote-local-divergence.md",
      "Change one variable",
      "payload roulette",
    ],
  },
  {
    file: "benchmarks/pwn/control-confirmed-calibration/expected_behavior.md",
    needles: ["Calibration Ledger", "Minimum local closure proof", "compact contest checkpoint"],
  },
  {
    file: "benchmarks/pwn/seccomp-orw/expected_behavior.md",
    needles: ["ctf-pwn-syscall-orw-check", "ORW/direct file-read route", "Flag bytes or final file-read oracle"],
  },
  {
    file: "templates/pwn_notes.md",
    needles: [
      "# PWN Solve Notes",
      "Target Inventory",
      "Protection Summary",
      "PWN Constraint Equation",
      "Primitive Ladder",
      "Crash / Control",
      "Leak Ledger",
      "Gadget / Symbol Ledger",
      "Heap Menu State",
      "Seccomp / ORW Plan",
      "Remote Drift Checklist",
      "Final Verification",
    ],
  },
  {
    file: "templates/pwn_retro.md",
    needles: [
      "# PWN Retro Template",
      "Challenge Summary",
      "Mitigation Matrix",
      "Final Primitive",
      "Local / Remote Drift",
      "Pattern Feedback",
      "Knowledge Update Candidates",
      "Exploit Reliability Checklist",
      "One-line Reusable Lesson",
    ],
  },
  {
    file: "commands/ctf-pwn-retro.md",
    needles: [
      "description: CTF PWN: Create a structured post-solve retro and feedback plan",
      "templates\\pwn_retro.md",
      "PWN_RETRO_SUMMARY",
      "ctf-pattern-feedback",
      "knowledge_update_candidates",
      "Do not store raw secrets in reusable lessons",
    ],
  },
]

const failures: string[] = []
for (const check of checks) {
  const text = readFileSync(check.file, "utf8")
  for (const needle of check.needles) {
    if (!text.includes(needle)) failures.push(`${check.file} missing ${needle}`)
  }
  if (check.oneOfNeedles?.length && !check.oneOfNeedles.some((needle) => text.includes(needle))) {
    failures.push(`${check.file} missing one of: ${check.oneOfNeedles.join(" | ")}`)
  }
}

const routerJsonFixture = JSON.stringify({
  pwn_playbook_router: {
    schema_version: "pwn_playbook_router.v1",
    mode: "medium",
    routes_considered: 1,
    routes_returned: 1,
    signal_summary: ["nx=yes", "ip_control=yes"],
    signals: { nx: true, ip_controlled: true, flag_detected: false },
    closure_priority: "control_to_leak_or_call_chain",
    top_routes: [{ rank: 1, id: "ret2libc-or-rop", score: 100, evidence: ["fixture"] }],
  },
})
const parsedFixture = JSON.parse(routerJsonFixture) as {
  pwn_playbook_router?: { schema_version?: string; signals?: Record<string, unknown>; top_routes?: unknown[] }
}
if (parsedFixture.pwn_playbook_router?.schema_version !== "pwn_playbook_router.v1")
  failures.push("router JSON fixture schema_version mismatch")
if (parsedFixture.pwn_playbook_router?.signals?.ip_controlled !== true)
  failures.push("router JSON fixture signals missing ip_controlled")
if (!Array.isArray(parsedFixture.pwn_playbook_router?.top_routes))
  failures.push("router JSON fixture top_routes not array")

if (failures.length) {
  console.error("pwn smoke check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`pwn_smoke_ok checks=${checks.length}`)
