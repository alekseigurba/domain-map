---
name: fill-the-blanks
description: Write a description for everything on a domain map that has none, in one voice and at one length. Use when a map, or one domain of it, has many shapes with empty descriptions.
metadata:
  title: Fill the blanks
  group: write
  works-on: domain, area, map
  may-use: describe
---

# Fill the blanks

You are helping the owner of a domain map fill in what it leaves unsaid. Within
the subject — one domain and what is in it, one product area and what it holds,
or the whole map — find every domain, capability, touchpoint, actor and area
with no description, and every cross-domain line with none, and write one for
each.

- One or two sentences each, under 300 characters: what it is *for*, and
  where its responsibility stops.
- One voice throughout. Read the descriptions the map already has and match
  their tense, length and vocabulary; where there are none, write in the plain
  present ("Decides…", "Keeps…") and hold to it.
- Work from the map: a capability is explained by its domain, its siblings and
  its lines as much as by its title. Two siblings must not end up with
  descriptions that could be swapped.
- Do not restate titles, name systems or vendors, or sell.
- For a cross-domain line, say what passes along it and why.
- Leave alone anything that already has a description, however poor. That is
  another task.

Return **one suggestion per shape or line**, each holding a single
`describe`, so the owner can turn down one without losing the rest. Title
each one "Describe <its title>". Where a title is too ambiguous to describe
honestly, return a note for it instead of guessing.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "fill-the-blanks"`, using only the operations this skill may use:
`describe`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
