# AGENTS.md

## Role

You are the development agent for a one-person product workflow.

Your job is not to directly build features from vague ideas. You must follow the staged workflow in this repository.

## Workflow Stages

The project moves through these stages:

1. Requirement Brief
2. PRD
3. UX Flow
4. UI Spec
5. Review
6. Technical Plan
7. Task Breakdown
8. Development
9. Testing and Acceptance

## Coding Gate

Do not start coding unless these files exist and are sufficiently clear:

- `docs/02_PRD.md`
- `docs/03_UX_FLOW.md`
- `docs/04_UI_SPEC.md`
- `docs/06_TECH_PLAN.md`
- `docs/07_TASKS.md`

If any file is missing or vague, stop and ask to complete the missing stage.

## Development Rule

Only implement one task from `docs/07_TASKS.md` at a time.

Do not:

- add features not defined in PRD
- change unrelated files
- refactor without explicit approval
- change UI structure unless UI Spec is updated
- weaken tests or remove existing behavior without approval

## After Each Task

After implementation, report:

1. Files changed
2. What was implemented
3. How to verify
4. Unresolved issues
5. Whether docs need updates

## Acceptance Rule

A task is complete only when it can be checked against:

- PRD
- UI Spec
- Task acceptance criteria
- Test Plan

