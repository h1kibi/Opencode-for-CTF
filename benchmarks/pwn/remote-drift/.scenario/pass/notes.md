# Pwn Triage

ctf-binary-probe identified the local binary and baseline transcript.
Local works, but remote fails with EOF after the prompt; this is a remote drift signal.
Record remote-local-divergence and run ctf-pwn-remote-drift-check.
Check runtime substrate, libc/loader assumptions, buffering, prompt timing, and transcript diff before changing exploit family.
Next probe is targeted at buffering and loader drift; do not rotate gadgets or allocator routes yet.
