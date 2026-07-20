# PWN Fast Handoff

Use this when a fast PWN branch escalates to `ctf-expert`. The goal is to let expert continue from the last-known-good probe without repeating triage.

## target_runtime
- challenge name / slug:
- binary:
- binary sha256:
- libc:
- libc sha256:
- ld:
- ld sha256:
- docker/compose:
- run script:
- remote host/port:
- flag_format:

## mitigation_summary
- arch / bits:
- checksec:
- PIE/canary/NX/RELRO:
- stripped/static/CET/seccomp:
- glibc / allocator notes:

## protocol_input_model
- argv/stdin/menu/network/file:
- prompt sync:
- delimiters / badchars / truncation:
- fixed read length / length field:
- normal output / error output:
- local-vs-remote protocol notes:

## selected_fast_route
- route: ret2win | ret2libc | fmt | orw | shellcode | heap-simple | ret2csu | srop | stack-pivot | other
- why selected:
- shortest closure family:
- route confidence: high | medium | low

## exploit_normal_form
- control: saved_rip | saved_rbp | stack_pivot | aar | aaw | unknown
- code_addr: fixed | pie | unknown
- writable_memory: none | stack | heap | bss | global | unknown
- replay: yes | no | unknown
- leak_surface: puts_got | printf_got | show_path | fmt_read | none | unknown
- closure_template: ret2win | pivot+bss | leak+replay | orw | shell | data_only | unknown
- reference_class: fake-stack leak | ret2libc replay | format read-first | ORW seccomp | heap stale overwrite | data-only hijack | unknown
- minimum_solve_sketch: 20-40 line shortest plausible exploit outline

## simpler_closure_families_checked
- direct win / direct secret path:
- one leak -> one minimal close:
- read-only fmt or show leak:
- direct ORW / output-hijack:
- which one remained shortest and why:

## strongest_evidence
- crash/control:
- offset/control width:
- format offset / leak map:
- stable leak/base assumptions:
- unknown-class leaks that must not drive final math:
- heap/menu primitive:
- seccomp/syscall facts:
- primitive:

## primitive_compression_status
- shortest original primitive candidate:
- source evidence:
- frame/register formula:
- callsite address:
- first fixed target:
- minimal probe payload shape:
- oracle:
- probe run: yes / no
- result: untested | confirmed | falsified
- if not run, why:
- closure families blocked until this is resolved:
- complex-chain failures that do NOT falsify this primitive:

## exploit_artifact
- exploit path:
- template used:
- local command:
- remote command:
- current last-good stage:
- final failing stage:
- last local output summary:
- last remote output summary:

## attempts_spent
| # | family | one variable changed | command/artifact | oracle | result | state delta |
|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |

- same-family attempts:
- flat differentials:
- falsified assumptions:
- cheap wrong attempts still worth retrying? yes / no + reason:

## active_substrate
- substrate: host | challenge-docker | pwnlab-docker | WSL | remote-only
- image / service / profile:
- workdir / mount:
- tool health:
- unlock condition:

## blocker
- exact blocker:
- why no longer fast-lane simple:
- is blocker conceptual, runtime, leak stability, heap reduction, or closure ambiguity?:

## next_rigorous_probe
- probe:
- one variable:
- oracle:
- confirm condition:
- falsify condition:
- expected state change:
- estimated cost/risk:

## anti_overcomplication_status
- bridge primitive if any:
- closure primitive if any:
- is a higher-priority canonical family still live?: yes / no
- did the last two rounds shorten the exploit chain?: yes / no
- if no, what should be demoted:

## contest_meta
- fast_outcome: solved | near_closure_template_lock | escalated | deprioritized
- continue_probability_next_5m: high | medium | low
- continue_probability_next_10m_under_rigorous: high | medium | low
- resume_cost: low | medium | high
- why_not_simple:
