# Web flag recovery after primitive

Use this reference after a Web target is successfully pierced but no flag is found. Treat flag recovery as a separate phase with a written hypothesis: where the flag lives, which privilege can read it, and which primitive can reach that boundary.

## Recovery mode trigger

When a critical Web primitive is confirmed, stop broad exploitation and switch to flag-recovery mode. First identify the primitive type and privilege boundary:

- file read / LFI
- command execution / code execution
- SQL or database read
- admin/session access
- SSRF/internal access
- source/config leak
- upload/file write
- template execution
- deserialization
- browser/admin-bot execution

Then build a compact flag-location checklist and test the cheapest, most likely locations before exploring new vulnerabilities.

## Common flag locations in Web CTF containers and deployments

- `/flag`, `/flag.txt`, `/flag_*`, `/readflag`, `/getflag`
- `/app/flag`, `/app/flag.txt`, `/var/www/flag`, `/var/www/html/flag.txt`
- challenge root, current working directory, parent directory, web root, home directory of the service user
- environment variables, process command line, `/proc/self/environ`, `/proc/1/environ` when readable
- Docker/Kubernetes secrets, mounted files, `/run/secrets`, `/var/run/secrets`, service config mounts
- source/config files: `.env`, `config.php`, `settings.py`, `appsettings.json`, `config.js`, `docker-compose.yml`, `Dockerfile`, nginx/apache config
- database tables/collections containing flag, secret, admin, config, note, post, user, key, token
- admin-only pages, debug panels, logs, backup/source archives, uploaded/imported files

## Primitive-specific flag recovery

- Command execution: first run low-impact identity and location commands: `pwd`, `id`/`whoami`, list current and parent directories, then targeted checks for `/flag*`, `/readflag`, `/app`, `/var/www`, `/home`, and environment. Prefer reading only likely small flag/config files. If a `readflag` binary exists, inspect permissions and execute it only when intended by the challenge.
- Arbitrary file read/LFI: read likely flag paths first, then app config/source, then `/proc/self/environ` or process metadata only if readable and useful. Avoid dumping large files. Use traversal depth systematically and record working base path.
- SQL/database access: enumerate schema minimally, search table/column names for flag/secret/key/token/admin/config, then query only promising rows. Do not dump entire databases unless necessary and allowed.
- Admin/session access: check admin dashboard, profile, settings, export/debug/log pages, hidden API endpoints, and privileged object IDs before looking for a new bug.
- SSRF/internal access: try low-volume metadata/internal service discovery only within challenge scope, then look for admin/debug/config/flag endpoints. Prefer HEAD/GET and tiny fixed lists.
- Source/config leak: perform a backward slice from flag sources, env vars, readflag calls, admin checks, and privileged routes to reachable inputs.
- Browser/admin-bot execution: determine whether the flag is in cookie, localStorage/sessionStorage, DOM, admin-only page, or internal request result. Use one harmless canary before exfiltration-style payloads.

## Container and deployment clues

- Check Dockerfile, docker-compose.yml, entrypoint scripts, supervisord config, nginx/apache config, and start.sh for COPY/MOVE/CHMOD/CHOWN of flag, readflag, app user, working directory, and service command.
- If source is available, search for strings and identifiers: flag, FLAG, readflag, getflag, secret, proof, admin, debug, environment variable names, and route names that imply privileged reads.
- If the app runs as non-root and `/flag` is unreadable, look for a setuid helper, readflag binary, sudoers rule, cron/job, internal privileged service, or app route intentionally wrapping the helper.
- If the container uses multiple services, determine which container holds the flag. Web frontend compromise may need pivot through Redis/MySQL/worker/admin/internal API rather than filesystem search in the frontend container.

## Path and process strategy

- Always record current working directory, effective user, web root, framework root, and writable directories after RCE or file-write.
- For PHP/Apache/Nginx common roots, check `/var/www/html`, `/var/www`, `/app`, `/usr/src/app`, `/srv/app`, `/opt/app`.
- For Node/Python/Java, check process cwd, package/app root, templates/static directories, and config directories.
- For file read, derive absolute paths from error messages, stack traces, source maps, `__dirname`/`path.join` usage, include_path, Flask/Django settings, Express static roots, Java classpath, and container workdir.
- For command execution, prefer targeted find with shallow depth and names: `flag*`, `*flag*`, `readflag`, `getflag`, `proof*`, `secret*`. Avoid full filesystem recursive scans unless local or explicitly allowed.

## When initial flag paths fail

- Do not assume the primitive is useless. Ask whether the flag is guarded by privilege, hidden behind an app route, stored in DB, generated dynamically, placed in another container, exposed only to admin bot, or revealed only after a workflow transition.
- Pivot from raw filesystem search to source-guided search: identify all routes/functions that mention flag/secret/admin/debug/export and reach them with the current primitive.
- If source contains a fake/example flag, verify whether it is used at runtime, in tests/docs only, or overwritten by environment/deployment.
- If environment variables are sanitized or unavailable, look for config loaders, secret managers, mounted files, and framework-specific config caches.

## Framework-specific hints

- Flask/Django/FastAPI: check app config, instance folder, templates, `.env` loading, `SECRET_KEY`, debug console clues, management commands, celery/worker tasks, and SQLite files.
- Express/Next/Nuxt/Vite: check server-side routes/API routes, build artifacts, `.next/server`, source maps, `process.env` usage, middleware, and SSR-only code not visible in client JS.
- PHP/Laravel/ThinkPHP: check document root vs project root, `.env`, storage/logs, config cache, route files, include paths, phar/upload wrappers, and disabled function bypass hints.
- Java/Spring/Tomcat: check `application.properties`/`application.yml`, actuator/debug endpoints, template paths, classpath resources, JSP/webapps root, logs, and deserialization/file-read sinks that can reach classpath or filesystem.

## False-flag handling

- Treat flags in README, sample tests, comments, public JS, and challenge templates as suspect until confirmed by runtime path, deployment context, or scoreboard acceptance.
- Treat values like `flag{test}`, `flag{example}`, `flag{fake}`, `flag{placeholder}`, `flag{not_the_flag}`, `CTF{dummy}`, and repeated sample values as decoys unless challenge context proves otherwise.
- If multiple candidate flags appear, rank by runtime origin first, privileged source second, static sample last. Report the highest-confidence candidate with evidence and preserve others in `notes.md`.

## Finalization discipline

- Once a real flag is found, stop additional exploitation, write `agent_flag.txt`, and produce the shortest reproducible solve path.
- The final solve path should start from a clean state when possible: target URL/artifact, credentials if any, exact request/command sequence, and why the result is the real flag.
- If flag recovery fails after a confirmed primitive, summarize: primitive, user/privilege, reachable files/routes/DB/internal services, tried flag locations, blocked boundaries, and next orthogonal flag-location hypothesis.
