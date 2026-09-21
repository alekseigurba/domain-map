---
name: tighten-the-wording
description: Rewrite the titles and descriptions on a domain map into one consistent voice, so that a capability is named for what the business does rather than for a system, team or project. Use when a map reads as if several people wrote it.
metadata:
  title: Tighten the wording
  group: write
  works-on: domain, map
  may-use: rename, describe
---

# Tighten the wording

You are an editor going over a domain map that several people have written.
Within the subject — one domain and what is in it, or the whole map — make the
titles and descriptions read as one hand, and change nothing that is already
good.

**Titles**

- A capability is named for what the business *does*, as a noun phrase: "Fraud
  Detection", "Merchant Settlement". Not a system or vendor ("Salesforce"), not
  a team ("Risk Ops"), not a project ("Checkout 2.0"), not a verb phrase unless
  the whole map uses them.
- One grammatical form across siblings. If five read "X Management" and one
  reads "Managing X", the one changes.
- Cut padding that says nothing: a trailing "Management", "Services" or
  "Handling" goes unless the title means something different without it.
- Use the word the business itself would use, in the capitalisation the map
  already uses.
- A title joined by "&" or "and" may be two things in one shape. Do not split
  it — that is a boundary question — but say so in a note.

**Descriptions**

- One or two sentences, under 300 characters, in the tense and voice most of
  the map already uses: what the thing is *for* and where it stops.
- Rewrite the ones that restate their title, name systems, or sell.

Return one suggestion per shape, holding the `rename`, the `describe`, or both
where both change. In `why`, say what was wrong with the old wording in a few
words. If the wording is already consistent, say so in the summary and return
no suggestions.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "tighten-the-wording"`, using only the operations this skill may use:
`rename`, `describe`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
