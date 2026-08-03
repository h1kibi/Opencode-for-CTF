# REV Knowledge Base

Reusable reverse-engineering notes for CTF agents. This directory complements the external `knowledge/ljagiello-ctf-skills/ctf-reverse` mirror with local, workflow-shaped cards that map first signals to the shortest next probe.

## Structure

| Subdirectory | Coverage |
|---|---|
| `android/` | APK fast triage, JNI/native routing, targeted JADX, dynamic adb/frida gating, assets decode, packer signals, runtime ABI/API equivalence, DEX code_item patch mapping. |
| `elf-pe/` | ELF/PE native checker slicing, success/failure string xref, transform extraction, solver routes. PE malware-style loaders, resource-embedded payloads, TLS callbacks, exception handler obfuscation. |
| `vm-bytecode/` | Custom VM dispatchers, opcode tables, bytecode blob identification, handler semantics, VM lifter strategy, trace oracle. |
| `emulation/` | Unicorn/Qiling function emulation, arch/mode/register recovery, self-decrypt replay, compare-hook output. |
| `packed/` | UPX/custom packer detection, self-modifying code, live memory dump strategy, post-unpack checker extraction. |
| `anti-analysis/` | Anti-debug (ptrace/IsDebuggerPresent/rdtsc), anti-VM (CPUID/MAC/timing), anti-Frida, bypass strategy. |
| `closure/` | REV-specific closure ladder, primitive-to-flag shortcuts, endgame decision cards. |

## Retrieval Intent

- Use these notes **after triage signals are known**, not as generic reading material.
- Prefer notes that provide a first probe, a falsifier, and a stop rule.
- Cross-reference with `skills/ctf-rev/references/*.md` for technique detail.
- Cross-reference with `skills-external/ctf-skills/ctf-reverse/*.md` for competition patterns and tool usage.

## Lesson Integration

When a card's `Falsifier` or `Stop Rules` trigger, record the observation in `work/ctf-evidence/<slug>/` and consult `ctf-lesson-search family=failure category=rev` for matching failure signatures. Use `ctf-rev-closure-ladder` tool when a primitive is confirmed and closure routing is needed.
