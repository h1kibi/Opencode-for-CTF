# Security Policy

## Supported use

This repository is intended for:

- authorized CTF competitions
- local labs
- benchmarks
- explicitly authorized training environments

It is not intended for unauthorized real-world target use.

## Reporting a security issue

If you find a repository security issue such as:

- accidentally committed secrets
- unsafe default configuration
- dangerous template behavior
- unintentionally over-broad permissions
- bundled code with obvious harmful side effects

please report it responsibly through GitHub Issues or by contacting the maintainer through the repository profile if public disclosure is not appropriate.

## What to include

Please include:

- affected file(s)
- reproduction steps
- risk summary
- suggested mitigation if available

## Operational safety notes

This repository is a configuration/template project, not a sandbox.

Users should:

- run unknown binaries in isolated environments
- avoid placing real secrets in tracked files
- review permissions before enabling extra tools or MCP services
- keep provider/model credentials in private local configuration only
