## Vendored Repositories

This project vendors external repositories under @vendors/

- Use vendored repositories as read-only reference material when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not edit files under @vendors/ unless explicitly asked
- Do not import from @vendors/ - application code should continue importing from normal package dependencies

## Effect

When writing Effect code, inspect @vendors/effect/LLMS.md for examples of idiomatic usage, tests, module structure, and API design. Treat it as the source of truth for Effect patterns. If you not find something related to effect, then inspect the whole directory: @vendors/effect/