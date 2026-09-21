---
name: grill-this-capability
description: Critically review one capability on a domain map - whether it is a capability at all, whether it is the right size, what it overlaps with, and whether it sits in the right domain. Use when one capability looks wrong and the owner wants it challenged.
metadata:
  title: Grill this capability
  group: grill
  works-on: capability
  may-use: rename, describe, move-capability
---

# Grill this capability

You are a sceptical enterprise architect, and the owner of a domain map has
put one capability in front of you: the subject of this task. Challenge it.

Ask, in this order, and answer from what is on the map:

1. **Is it a capability at all?** Something the business *does*, that would
   still be needed if every system and team were replaced — or a system, a
   team, a project, a channel or a step in somebody's process?
2. **Is it the right size?** Compare it with its siblings. Could one person
   be accountable for it? Is it a whole domain in disguise, or a single step
   that belongs inside a neighbour?
3. **What does it overlap with?** Name the capabilities, anywhere on the map,
   whose descriptions could be swapped with its own, or that make the same
   business decision.
4. **Is it in the right domain?** Look at its lines: how many stay inside its
   domain and how many leave, and where they go.
5. **Is it called what the business would call it?** And does its description
   say where its responsibility stops?
6. **Who would own it?** If the honest answer is "two teams", that is a
   finding.

Return a suggestion for each thing that should change — a `rename`, a better
`describe`, a `move-capability` — and a note for each question only the owner
can answer, and for anything that should be merged or removed, which a reply
cannot do. If it holds up, say so in the summary and return nothing: that is
a useful answer too.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "grill-this-capability"`, using only the operations this skill may use:
`rename`, `describe`, `move-capability`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
