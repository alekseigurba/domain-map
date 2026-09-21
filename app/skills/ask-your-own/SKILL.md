---
name: ask-your-own
description: Answer a free-form question about a domain map and return any changes it implies as checked suggestions. Use when the owner has a question about a domain map that none of the standard skills covers.
metadata:
  title: Ask your own
  group: ask
  works-on: domain, capability, touchpoint, actor, line, map
  may-use: describe, rename, set-type, add-domain, add-capability, add-touchpoint, add-actor, move-capability, connect
  asks: question
  asks-label: Your question
  asks-hint: What would break if Checkout and Payments were one domain?
---

# Ask your own

The owner of a domain map has a question about it:

> {{question}}

Answer it from what is on the map. Be direct and be critical: the owner would
rather hear that the question rests on a wrong assumption than be agreed with.

- Put the answer itself in the summary, in a few plain sentences.
- Where the answer implies a change to the map, return it as a suggestion with
  the operations that make it, and say in `why` how it follows from the
  answer.
- Where it implies something a reply cannot do — removing or merging shapes,
  deleting a line, moving anything about — or something only the owner can
  decide, return a note that names the shapes in `about`.
- Keep to the subject of the task where there is one.

If the question cannot be answered from the map and what the brief says about
the business, say what is missing rather than guessing.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "ask-your-own"`, using only the operations this skill may use:
`describe`, `rename`, `set-type`, `add-domain`, `add-capability`, `add-touchpoint`, `add-actor`, `move-capability`, `connect`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
