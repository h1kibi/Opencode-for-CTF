---
description: Build revlab Docker image for reverse engineering challenges.
agent: ctf-rev
subtask: false
---

# Build revlab Docker Image

Build the revlab Docker image for reverse engineering:

```
cd <repo-root>/docker
docker compose -f docker-compose.revlab.yml build
```

This builds `revlab:ubuntu22.04` with tools for:

- Network/pcap analysis (tshark, tcpdump, wireshark)
- Binary analysis (binwalk, rizin, radare2)
- Cross-arch emulation (qemu-aarch64, qemu-mips, qemu-riscv64)
- Android analysis (apktool, aapt, jadx)
- Go reversing (GoReSym)
- Symbolic execution (angr, triton)
- Dynamic analysis (rr, qiling, frida)

Run `ctf-env-check category=rev` to verify the image is built.
