# 0001: Default AI Session Workflow

Status: Accepted

## Context

AI coding sessions can drift when rough requests, implementation, and review happen in one
long context. The project needs a default method that keeps intent, execution, and review
separate.

## Decision

All AI-assisted changes default to a three-phase workflow: planning session, execution session,
and review session. Planning creates a durable plan under `docs/ai/features/`. Execution
implements one approved slice. Review checks the slice before the next one begins.

## Consequences

- Rough feature requests produce a plan before app code changes.
- Execution sessions stay small and non-overlapping.
- Review can run in a clean context against the plan and changed files.
- Urgent fixes may still be small, but they must either reference an approved plan or create
  a minimal plan first.

