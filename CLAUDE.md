# Tide

An iOS to-do app. Todoist's mental model (projects, natural-language quick add,
priorities, labels), a calmer UI, and an AI assistant.

- SwiftUI + SwiftData, iOS 27, Swift 6.
- Local-only storage for now. CloudKit is a later flip, so the models must stay
  CloudKit-compatible (see Data model below).
- Personal daily driver. Not App Store bound. No onboarding, paywall, or analytics.

## Layout

```
Tide/
  TideApp.swift            @main, ModelContainer setup
  Models/                  Task.swift  Project.swift  Label.swift
  Features/                Inbox/ Today/ Upcoming/ ProjectDetail/
                           QuickAdd/ Assistant/ Settings/
  AI/                      TaskParser.swift  ClaudeClient.swift
                           AssistantTools.swift  KeychainStore.swift
  DesignSystem/            Theme.swift  Typography.swift  Haptics.swift
                           Components/  (TaskRow, PriorityDot, DateChip, ProjectPill)
```

The Xcode target uses a file-system-synchronized group — new files under `Tide/`
are picked up automatically. No `project.pbxproj` edits needed to add a file.

## Data model

Three `@Model` classes: `Task`, `Project`, `Label`.

**Every stored property is optional or has a default value. No
`@Attribute(.unique)`. Every relationship declares its inverse.** This is what
keeps CloudKit sync a one-line change later; violating it is expensive to undo.

Other conventions:
- `priority` is 1–4, Todoist-style: 1 = urgent, 4 = none.
- `sortOrder` is a `Double`. Reorder by taking the midpoint between neighbours —
  never reindex the whole list.
- `hasTime: Bool` distinguishes "Friday" from "Friday 3pm". A `dueDate` alone is
  not enough.
- Recurrence is stored as a string rule and parsed at read time.

Every smart-list predicate lives in one `TaskQueries` enum. The UI and the AI
layer both read from it, so "what counts as Today" is defined exactly once.

## Design system

- **No hardcoded colors or font sizes in feature views.** Use `Theme` and
  `Typography`. A raw `.font(.system(size: 17))` or `Color(red:...)` in a feature
  file is a bug.
- Semantic colors live in `Assets.xcassets` with light and dark appearances both
  authored deliberately. Dark mode is designed, not derived.
- Color carries meaning only: priority and project. Never decoration.
- Completion is a spring animation + haptic + row collapse, not a checkbox flip.
- Gestures over chrome: swipe right = complete, swipe left = schedule,
  long-press = AI actions.

## AI

Two tiers.

**On-device (Foundation Models)** — quick-add parsing and project/label
suggestions. Uses `SystemLanguageModel.default` with `@Generable` guided
generation. Always check `model.availability` first; `.appleIntelligenceNotEnabled`
and `.modelNotReady` are real states on real devices.

**Tide must be fully usable with zero AI.** A deterministic parser
(`NSDataDetector` + regex for `p1`, `#project`, `@label`) is the fallback and the
correctness baseline. It ships before the on-device model does.

**Claude (REST, `URLSession`)** — breakdown, day planning, weekly review, chat.
No Swift SDK exists, so call `POST https://api.anthropic.com/v1/messages` directly.
- Model `claude-opus-5`, header `anthropic-version: 2023-06-01`.
- `"thinking": {"type": "adaptive"}` for reasoning-heavy requests. Never send
  `budget_tokens` — it is a 400 on this model.
- Stream with `"stream": true` + `URLSession.bytes(for:)`; `max_tokens: 64000`.
- Check `stop_reason == "refusal"` before reading `content`.
- Tool loop: while `stop_reason == "tool_use"`, return **all** `tool_result`
  blocks in a single user message.

**The AI never writes to SwiftData directly.** A tool call produces a *proposed*
change that renders as a confirm card ("Create 3 tasks in #Work — Apply /
Discard"). A bad parse must cost a tap, not a cleanup.

The Anthropic API key lives in the Keychain, entered in Settings. Never
`UserDefaults`, never a committed file.

## Working here

- Commit after every working feature. Small commits are the undo button.
- Build and run after each change. Previews for components, simulator for flows.
- `xcodebuild -project Tide.xcodeproj -scheme Tide \
   -destination 'platform=iOS Simulator,name=iPhone 17' build`
- The parser has unit tests. Add a case whenever it gets something wrong.
- When a convention here changes, update this file in the same commit.
