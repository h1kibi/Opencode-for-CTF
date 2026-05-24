---
name: ctf-web-source-map
description: Use when source code, JAR, ZIP, or Docker config is available. Builds route-to-input-to-sink-to-auth-to-primitive maps, identifies frameworks and dependencies, and locates dangerous functions.
compatibility: opencode
---

# CTF Web Source Map

## Purpose

When source code is provided, analyze it before any black-box probing. Map every route to its inputs, sinks, auth requirements, and potential primitives. Identify the framework, dependencies, and dangerous patterns.

## Framework Identification

Determine the framework from:

- File extensions (.php, .py, .java, .js, .rb, .go, .cs, .jsp)
- Directory structure (Flask routes, Django apps, Spring controllers, Express middleware)
- Config files (settings.py, application.properties, web.xml, pom.xml, package.json, go.mod)
- Import/include patterns

## Route, Input, Sink Mapping

For each route identified:

1. Map the route path and HTTP method.
2. Extract all inputs: query params, path params, form fields, JSON body, cookies, headers.
3. Identify auth requirements: middleware, decorators, session checks, role checks.
4. Trace input to dangerous sinks: SQL queries, file operations, command execution, template rendering, deserialization, HTTP fetches, eval/exec.

## Dangerous Function Enumeration

### PHP
unserialize, include/require with variable paths, file_get_contents with variable, exec/system/passthru/shell_exec, eval/assert, preg_replace /e, extract, create_function

### Java
ObjectInputStream.readObject, Runtime.exec, ProcessBuilder, JdbcTemplate/executing raw SQL, OGNL/SpEL evaluation, JNDI lookup, XXE parser without features, XStream/Jackson/Fastjson without safemode

### Python (Flask/Django)
pickle.loads, yaml.load, eval/exec, os.system/subprocess, render_template_string with user input, open/file with variable paths, requests.get with user URL, Django raw/extra SQL

### Node (Express)
eval/Function, child_process.exec/spawn with user input, vm.runInNewContext, serialize/unserialize, require with variable, EJS render with user input, Sequelize raw queries, template literal injection

### Go
template.HTML without escaping, os/exec.Command with user input, file operations with user paths, database/sql raw queries

### .NET
BinaryFormatter.Deserialize, Process.Start, SqlCommand with concatenation, Razor templates with user input, XPathExpression, XmlReader without DtdProcessing

## Dependency Analysis

- Check for known-vulnerable dependency versions in package.json, pom.xml, requirements.txt, go.mod, Gemfile.
- Check for serialization libraries: commons-collections, Jackson, Fastjson, XStream, SnakeYAML.
- Check for template engines: Jinja2, Twig, Freemarker, Velocity, Thymeleaf, EJS, Pug, Handlebars.

## Output Contract

Write this to `notes.md`:

```markdown
# Source Map

## Framework
- Language:
- Framework:
- Server:

## Route Map

| Route | Method | Inputs | Auth | Sink Type | Sink Detail | Candidate Primitive |
|---|---|---|---|---|---|---|

## Dangerous Functions Found

| File | Line | Function | Input Source | Primitive |
|---|---|---|---|---|

## Dependencies

| Package | Version | Known Issues |
|---|---|---|
```
