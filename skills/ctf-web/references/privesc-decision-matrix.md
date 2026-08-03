# Local Privilege Decision Matrix

Use with `ctf-web-privesc`; this is a hypothesis-ranking aid, not a payload catalogue.

## Rank candidates

Score each candidate on `evidence × reachability × impact ÷ cost`, then subtract risk and environment uncertainty. Prefer a candidate whose owner, permissions, trigger, and success oracle are all visible.

| Candidate | Required proof before trigger | Success oracle |
|---|---|---|
| sudo/policy | exact allowed command, identity, argument/environment boundary | before/after UID or controlled file read |
| SUID/capability | binary is reachable and behavior is understood | controlled identity/file oracle |
| cron/systemd/task | job path/config writable by foothold and trigger timing known | job-owned output or identity change |
| service path/ACL | service identity, restart condition, writable binary/config | service-owned controlled oracle |
| Windows token/service | token privilege or service ACL and safe trigger | integrity/identity or controlled output |
| container boundary | mount/socket/namespace plus permission and host-side oracle | explicit boundary evidence |
| kernel/CVE | exact build match, prerequisites, isolated target | reproducible elevated identity |

## Confirmation discipline

- Check ownership and ACL twice if output is ambiguous.
- Separate “can write” from “will execute.”
- Use a canary or harmless output path when a trigger is required.
- Capture before/after identity and clean up challenge-created artifacts.
- If a candidate depends on a version-specific exploit, verify the version first.

## Dead branches

Mark dead when the file is not writable, the trigger is absent, the service runs under an irrelevant identity, the version does not match, or the oracle is non-discriminating. Do not replace a falsified candidate with a larger unranked list.

