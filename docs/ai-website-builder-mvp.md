# AI Website Builder — MVP Product Brief

> **ملخص عربي:** الهدف هو بناء منصّة تمكّن المستخدم من وصف موقع أو تطبيق ويب، ومراجعة خطة إنشائه، ثم معاينته وتحسينه باللغة الطبيعية. هذه مواصفات منتج مقترحة، وليست وصفاً لميزات موجودة. لا تختار إطاراً أو مزوّد نموذج أو استضافة؛ تبقى هذه قرارات تحتاج موافقة وتوثيقاً منفصلين.

## 1. Product intent

Build a web application that helps a user go from a plain-language brief to a working, previewable web project. The first release focuses on the website-builder workflow, not on reproducing every Manus product or capability.

The product should make the build process understandable and reversible: the user sees the proposed plan, can review generated changes, can inspect or export project code, and explicitly approves publishing.

## 2. Primary user and job

**Primary user:** a non-specialist who can explain a website idea but may not know how to set up a framework, backend, or deployment pipeline.

**Job to be done:** “Help me turn my description into a usable website, let me see it while it is being built, and let me refine and publish it without losing control of the project.”

## 3. MVP workflow

1. **Create a project:** enter a name and describe its purpose, audience, pages, and main action.
2. **Review the plan:** see proposed pages, functionality, assumptions, and any missing information. The user can revise or approve it before generation.
3. **Generate a first version:** create a runnable web project in an isolated workspace. Show build progress and actionable errors rather than a blank loading state.
4. **Preview:** display the running project in an interactive preview with desktop/mobile viewport controls and path navigation.
5. **Refine:** accept a natural-language change request scoped to the selected project. Show the result in preview and preserve the previous version for recovery.
6. **Own the result:** inspect and download the project source and project metadata.
7. **Publish deliberately:** show the target, visibility, and any relevant configuration; require explicit confirmation before publishing.

## 4. MVP scope

### Must have

- Project list and project creation.
- Brief → reviewable plan → user approval → first generated website.
- Isolated project workspace and live preview.
- Conversational follow-up edits, with clear progress and failure states.
- Save and restore project versions.
- Downloadable source code; no platform lock-in by design.
- Arabic and English UI, correct RTL/LTR behavior, responsive layouts, keyboard access, and accessible labels/focus states.
- Explicit consent for code execution, external integrations, and publication; secrets are never exposed to generated browser code.

### Defer until the core loop works

- Local desktop agent and direct access to a user's computer.
- Two-way GitHub synchronization.
- Managed databases, authentication, user uploads, payments, and custom domains.
- Mobile app and game generation, team collaboration, scheduled automations, and usage-based billing.
- Visual element selection and direct style controls. These are valuable follow-ups after reliable prompt-based generation and preview are proven.

## 5. Safety and trust requirements

- Treat prompts, uploaded project files, dependencies, and generated code as untrusted input.
- Run generated code in a per-project isolated environment with resource limits; do not run it in the control-plane process.
- Separate control-plane credentials from preview/runtime environments. Never embed provider or deployment secrets in client bundles or generated source.
- Gate network egress and dependency installation; require an explicit, auditable approval path for new external services.
- Keep publishing opt-in and show exactly which project and destination will become public.
- Make changes recoverable through version history; report failed or partial builds truthfully.
- Use synthetic data in fixtures and tests. Do not send project content to external providers unless the user has opted in and the destination is declared.

## 6. MVP acceptance criteria

A release candidate is acceptable when a test user can:

- Create a project from a brief and approve or revise its plan before code generation.
- Reach a working preview and navigate at least one generated route.
- Request a change in natural language, see the outcome, and restore the previous version.
- Use the interface in Arabic/RTL and English/LTR on narrow and wide viewports, with keyboard navigation.
- Export the project source without publishing it.
- Publish only after a clear confirmation step (once a deployment target is selected).

Automated tests must cover workflow state transitions, authorization boundaries, build failures, version restoration, and publishing approval. Security testing must verify project isolation and that secrets cannot be read from the preview.

## 7. Decisions required before implementation

These are deliberately open; this brief does not decide them:

- **Stack and runtime:** framework, build/runtime model, and supported generated-project templates (AGENTS.md D1).
- **Design system:** visual language, typefaces, tokens, and styling/RTL implementation (D2).
- **Deployment:** platform, preview isolation, production publishing, and custom-domain scope (D3/D6).
- **Model provider:** provider, user consent, data handling, credentials, and declared egress destinations.
- **Execution sandbox:** isolation boundary, resource quotas, network policy, and lifecycle.
- **First-release mode:** hosted-only is the recommended smallest first step; local development can follow after the hosted workflow is proven.

Each accepted platform-level choice must be recorded in a new ADR before the relevant implementation begins. This document is a product brief, not authorization to choose those technologies.

## 8. Reference and differentiation

The workflow takes inspiration from publicly documented website-builder capabilities: plan before build, live preview and iterative natural-language editing, code access/export, and deliberate publishing. It is an independent implementation; it must not depend on Manus internals, copy proprietary assets, or imply affiliation.

Reference pages: [Manus 2.0](https://manus.im/docs/website-builder/getting-started), [Editing and Previewing](https://manus.im/docs/website-builder/editing-and-previewing), [Build locally](https://manus.im/docs/website-builder/build-locally), [Cloud Infrastructure](https://manus.im/docs/website-builder/cloud-infrastructure), [Publishing](https://manus.im/docs/website-builder/publishing), and [Code Control](https://manus.im/docs/website-builder/code-control).
