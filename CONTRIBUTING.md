# Contributing

Thanks for your interest in improving **Opencode-for-CTF**.

This repository is intended to be a reusable OpenCode CTF agent configuration project. Contributions should improve portability, clarity, maintainability, safety boundaries, or benchmarked behavior.

## What is welcome

- Documentation improvements
- New or improved OpenCode skills
- New commands with clear scope
- Safer or more reusable tools
- Benchmarks and regression cases
- Portability fixes for public/template usage
- Cleanup of hard-coded local assumptions

## Before opening a PR

Please try to keep changes focused:

- One topic per pull request
- Avoid mixing refactors, docs, and unrelated feature additions
- Preserve the repository's public-template nature
- Do not commit private provider/model settings, local tokens, or personal absolute paths

## Rules for contributions

### 1. Do not commit secrets

Never commit:

- API keys
- Access tokens
- Cookies
- Private endpoints
- Personal local environment files
- Personal knowledge-base paths

Use placeholders, `.env.example`, or documentation instead.

### 2. Keep the public config portable

This repository should remain usable as a template. If you add new config:

- prefer environment variables
- avoid author-specific model/provider bindings
- avoid machine-specific absolute paths unless clearly marked as examples
- document any new required setup in `README.md`

### 3. Keep skills and commands maintainable

When adding or editing skills/commands:

- keep scope explicit
- avoid unnecessary overlap
- state expected inputs/outputs clearly
- prefer reusable workflows over one-off challenge logic

### 4. Keep tools safe and focused

For `.opencode/tools/` changes:

- prefer small, composable tools
- document assumptions
- avoid unnecessary destructive behavior
- keep output concise and useful for agent routing/verification

### 5. Prefer benchmark-backed improvements

If you change solve behavior, routing strategy, or a tool's intended decision role, add or update:

- `benchmarks/`
- `lessons/`
- `retros/`
- or verification scripts when appropriate

## Suggested workflow

1. Fork the repository
2. Create a branch
3. Make a focused change
4. Update docs if behavior/setup changed
5. Run available checks if relevant:

```bash
npm run check
npm run list
npm run tools:verify
```

6. Open a pull request with:

- what changed
- why it changed
- any setup impact
- any benchmark/tooling impact

## Scope boundary

This project is for authorized CTF, lab, benchmark, and learning environments only. Contributions should not expand the repository toward unauthorized real-world offensive use.
