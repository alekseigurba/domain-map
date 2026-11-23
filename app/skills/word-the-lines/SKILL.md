---
name: word-the-lines
description: Rewrite the descriptions on the lines of a domain map as what one side provides the other - a business promise or a fact exchanged - where they read as steps in an implementation flow. Use when the lines of a domain map read like a call graph.
metadata:
  title: Word the lines
  group: write
  works-on: line, domain, map
  may-use: describe
---

# Word the lines

You are an editor going over the lines of a domain map. Within the subject —
one line, one domain and the lines that touch it, or the whole map — make each
line's description say what a line is there to say, and change nothing that
already does.

A line has two ends and no direction. It says that two parts of the business
depend on each other, and its description says for what: the promise one makes
the other, or the fact that passes between them. It does not say who calls
whom, in what order, or by what means. A map whose lines say so is read as a
call graph, and then argued about as one.

**Rewrite a description that**

- reads as a step in a flow or a call: "triggers", "calls", "sends a request
  to", "then", "checks whether", "reaches into … to fetch";
- says where something is kept or how it travels: "is stored in", "manages the
  state of", "consumes … events", "syncs to", a queue, a table, an API;
- names a system, a vendor or a team where a capability is meant;
- tells one scenario — "when a customer…" — rather than what holds every time
  the two sides meet.

**Write instead**

- what is provided, and to whom, in the business's own words: "Provides the
  active credit-agreement status to checkout." "Provides invoice-status updates
  to the ledger."
- the thing exchanged — a status, a decision, a limit, a settled amount — and
  not the mechanism that carries it;
- one sentence, under 200 characters, in the present tense, that a product
  manager could confirm or correct without knowing how it is built;
- both halves where each side provides something: the line has no direction to
  say it for you.

Keep whatever was true. If the old wording held the reason the dependency
exists, the new one holds it too.

Where a description cannot be turned into a promise because the line only
records the order things happen in, do not invent one. Return a note naming the
line in `about`: it may not be a dependency at all, and removing it is the
owner's to do. A line with no description is not this task's — **Fill the
blanks** writes those.

Return one suggestion per line, holding one `describe` whose target is the
line. In `why`, say in a few words what the old wording claimed that a line
cannot. A description that already reads as a promise needs no card; if they
all do, say so in the summary and return no suggestions.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "word-the-lines"`, using only the operations this skill may use:
`describe`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
