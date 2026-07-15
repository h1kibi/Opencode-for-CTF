# Java Web Fallback Matrix

Use when a Java Web branch stalls. Pick exactly one fallback that changes route, source, sink, dependency, or oracle evidence.

| Failed Stage | Symptom | Fallback | Stop / Pivot Rule |
|---|---|---|---|
| Source Map | `ctf-java-map` flat output is insufficient | Build Java Constraint Equation manually from controllers, config, filters, and sinks | If no Java source/JAR/WAR exists, pivot to black-box Web Java fingerprinting |
| Route Reachability | Handler exists but route behavior unclear | Verify method/path/content-type/body binding with one safe request | After 2 no-diff probes, inspect route prefix/filter/security source |
| Auth Boundary | 401/403 or role wall | Load auth/filter reference, map matcher/filter/session, test one normalization or role differential | Do not mutate admin state before read-only bypass evidence |
| Dependency Bug | Risky dependency but exploit fails | Verify version, config gate, reachable parser, and controlled data shape | If any gate missing, demote below source-proven sinks |
| Template/Expression | Payloads render literally or errorless | Identify engine/parser/context; switch to engine-specific safe marker | After 2 payloads no oracle, pivot to source context |
| Deserialization | Gadget payload no effect | Verify parser type, token format, key/config, classpath, and parse error oracle | Stop gadget guessing without parser-specific evidence |
| SQL/MyBatis | Payload no SQL differential | Inspect mapper binding `${}` vs `#{}`, dynamic SQL path, DB type, and service xrefs | After 2 no-diff payloads, pivot to source/query extraction |
| File/Upload | Upload/traversal no effect | Map base dir, normalization, extension/MIME, served path, and canary behavior | Do not overwrite existing files; stop encoding spray after 2 no-diff variants |
| XXE/SSRF | No callback/error | Identify parser/fetcher, validator, allowed schemes, redirect/DNS/IP handling | Do not spray parser bypasses before source chain mapping |
| Final Chain | Primitive confirmed but flag not reached | Choose stable control plane: config leak, file read, admin route, JSP write, DB query, actuator | Stop broad probing after one reliable flag path |

High-information fallbacks:

- Source reachability beats dependency-name guessing.
- Config gates beat CVE payload variation.
- Engine/parser identity beats generic payloads.
- Canary file/write checks beat blind overwrite.
- Route/auth table beats path normalization spraying.
