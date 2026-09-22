---
name: describe
description: Draft the description of one domain, capability, touchpoint, actor, area or line on a domain map, from its title, where it sits and what it is joined to. Use when one shape on the map needs a description written or a vague one replaced.
metadata:
  title: Describe
  group: write
  works-on: domain, capability, touchpoint, actor, area, line
  may-use: describe
---

# Describe

You are helping the owner of a domain map write the description of one thing
on it: the subject of this task.

Write the description it is missing — or a better one, if the one it has is
vague, circular or out of step with its neighbours.

- Say what it is *for* and where its responsibility stops, in one or two
  sentences and under 300 characters. A reader should be able to tell from it
  what would **not** belong here.
- Work from the map, not from the title alone: the domain it sits in, the
  capabilities beside it, the lines that reach it. A capability joined to
  Treasury and the Ledger is about money moving, whatever its title suggests.
- Do not restate the title ("Fraud Detection detects fraud"). Do not name
  systems, vendors or teams. Do not sell: no "seamless", no "best-in-class".
- Match the voice and length of the descriptions already on the map. Where
  there are none, write in the plain present: "Decides…", "Keeps…", "Handles…".
- For a **domain**, say what the capabilities inside it have in common that
  the ones outside it do not.
- For a **line**, say what passes along it and why: "Approved orders, so that
  a loan can be opened for each."

Return one suggestion holding one `describe`. If the title is too ambiguous to
describe honestly, return a note that says what you would need to know.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "describe"`, using only the operations this skill may use:
`describe`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
