---
name: find-missing-connections
description: Find the lines a domain map should have and does not - capabilities joined to nothing, touchpoints that reach no capability, actors with no channel, and routes that stop halfway. Use when a domain map looks under-connected.
metadata:
  title: Find missing connections
  group: grill
  works-on: capability, touchpoint, actor, domain, map
  may-use: connect
---

# Find missing connections

You are reviewing a domain map for the lines it should have and does not.
Within the subject — one shape, one domain, or the whole map — find the
connections that are missing.

A line on this map is a real dependency or handoff between two things: one
cannot do its work without the other, or passes its result to it. It is not
"these are related".

Look for:

- **Islands.** A capability with no lines at all. Either lines are missing,
  or it does not belong on the map — say which you think it is.
- **Dead ends on the presentation layer.** A touchpoint that reaches no
  capability; an actor that reaches no touchpoint.
- **Routes that stop halfway.** An order is taken and nothing reaches the
  ledger; a loan is opened and nothing collects on it. Follow the two or three
  flows this business lives by, end to end, and see where the lines give out.
- **A dependency the descriptions state and no line shows.** "Scores every
  order" with no line from wherever orders are.

Only the pairs the map can draw: actor–touchpoint, touchpoint–capability,
capability–capability. Never join two shapes that are already joined. Do not
connect everything to a hub because everything "uses" it.

Return one suggestion per line, holding one `connect` whose `description` says
what passes along it. In `why`, say what breaks, or cannot be explained,
without it. Where a capability looks like it should not be on the map at all,
return a note.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "find-missing-connections"`, using only the operations this skill may use:
`connect`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
