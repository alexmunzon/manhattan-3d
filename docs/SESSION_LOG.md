# Session Log

Append-only. One entry per session: date · milestone · changes · verified · next.

## 2026-09-29 · Planning
- **Changes:** Rewrote the original LLM-generated prompt into `docs/BUILD_PROMPT.md` (the original is in
  `docs/archive/`). Added CLAUDE.md, README, ROADMAP, DECISIONS (ADR-001–004), VISUAL_SPEC, .gitignore
  and .env.example.
- **Research:** Apple 3D data is off the table (ADR-002). The visual target was captured from sf.thijs.gg.
- **Verified:** `.env` is git-ignored and no secrets are in tracked files.
- **Next:** M0 Scaffold.
