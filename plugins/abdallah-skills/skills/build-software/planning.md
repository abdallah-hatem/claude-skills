# Planning: classes and edge cases

Break the spec into tasks. Each gets a **class** (`logic` / `ui` / `surface` — see Task classes in
`SKILL.md`), an area (`backend` / `frontend` / `mobile` / `infra`), and what it depends on. The dependency marks
decide what can run in parallel.

## Shared building blocks

When two or more tasks need the same component, helper, or piece of service logic that doesn't exist
yet — a data table, a money helper, a permission check — it becomes **its own task**, and the tasks
that use it depend on it. It lands in an earlier wave; otherwise parallel agents each build their own
copy.

## Edge cases for `logic` tasks

Every `logic` task lists its edge cases in the plan **before any code is written**. Derive them from
three sources, in this order:

| Source | Rule |
|---|---|
| **Business doc** | every invariant the task touches gets a test that tries to break it · every failure path in its flows gets a test · every money rule gets boundary tests · every role gets a test proving a role without the permission is refused |
| **Contract** | every request field the task accepts: missing, `null`, wrong type, at the limit, one past the limit |
| **Stack checklist** | the generic cases in `building-backends` → `testing.md`, or `building-frontends` → Testing |

Business-doc cases come first because no generic checklist can produce them.

## Edge cases for `ui` and `surface` tasks

`ui` tasks list only the interaction cases that apply — validation messages, empty and error states,
double submit. `surface` tasks list none; their smoke screenshots are the check.

## Writing them

One line per case: what happens, the expected outcome, and where the case came from.

```markdown
#### Task 7 — Cancel a booking (backend · logic)
Edge cases:
- [ ] Cancel a booking whose wash has started → 409, status unchanged   (invariant: cancel only before start)
- [ ] Cancel another customer's booking → 404                            (role: customers see only their own)
- [ ] Cancel a paid booking → refund created for the full amount         (money: cancellation refunds in full)
- [ ] Cancel an already-cancelled booking → 409                          (checklist: wrong state)
- [ ] Unknown booking id → 404                                           (checklist: not found)
```

The source in brackets shows why each case is there — and makes a missing one easy to spot.

## Before any code

Keep the lists in the plan file and include them when you summarise the plan, so the user sees them
before any code and can add a case that was missed. Then run the alignment review on the plan: it
checks the classes and fails a plan that leaves a business rule without a case that tries to break it.

During Build, a case discovered along the way is added to the plan **and** tested — the list only
grows. During Verify, each case is ticked off against the test named for it.

## Red flags

- A task with no class, or one classed down to avoid its tests
- Two tasks that each build the same component or helper, instead of a shared task both depend on
- A wave built from logical dependencies alone. **Compare the tasks' file lists**: a task that
  *creates* a file another task *modifies* must land first, however unrelated the two sound (a
  module, a controller or a layout one task creates and two others extend is the usual case). Two
  tasks that both modify a file can share a wave only when their edits are purely additive — routes,
  providers, locale keys in separate namespaces.
- A `logic` task with no edge-case list, or one drawn only from the generic checklist
- A rule in the business doc that must never break, with no case that tries to break it
- An edge case without an expected outcome or a source
- A case found during Build that was tested but never added to the plan
- A green suite accepted as proof without ticking each planned case against a named test
