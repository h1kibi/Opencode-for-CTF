# Windows Host and Identity Artifacts

Use when a Windows disk/memory/log artifact is the primary evidence. Preserve timestamps and source paths.

## Triage order

- event logs: process creation, service/task changes, logon/authentication, PowerShell/script block, WMI, and network connection events;
- registry hives: user profiles, Run keys, services, typed paths, recent files, mounted devices, and shell history;
- file system: Prefetch, Amcache/Shimcache, scheduled-task/service definitions, browser profiles, and suspicious temp/download paths;
- memory: processes, command lines, loaded modules, handles, injected regions, tokens, and network sockets.

## Evidence discipline

Correlate at least two artifact families before claiming execution or identity. A string in a hive is not proof of execution; a process name is not proof of maliciousness. Record timezone, parser version, hash, and extraction path.

