# Authz and state-machine black-box playbook

Use when a Web CTF has login, register, profile, object IDs, roles, teams, tenants, orders, posts, files, approval flows, share links, exports, or reset tokens.

## Two-account matrix

Prefer two normal accounts when registration is allowed:

```text
anonymous
user_a owns object_a
user_b owns object_b
```

Compare:

- same endpoint with no cookie, user A, user B;
- object A with user A vs user B;
- object B with user B vs user A;
- same workflow step in normal order, skipped order, replayed order;
- same request with CSRF/Origin/Referer removed or changed;
- optional hidden fields and role/owner fields accepted by backend.

Use `ctf-web-authz-matrix` for the first low-volume comparison. Feed observed deltas into `ctf-decision-state observe`.

## State ledger

| Action | Actor | Object | Before | After | Persistent? | Oracle | Primitive |
|---|---|---|---|---|---|---|---|

Do not call IDOR confirmed from one 200 response. Confirm ownership mismatch, sensitive content, state change, or flag/control-plane path.
