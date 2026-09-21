---
name: question-the-connections
description: Critically review the lines already drawn on a domain map - undescribed lines, implausible ones, two domains joined so heavily that the boundary looks wrong, and hubs that everything leans on. Use when the connections on a domain map need challenging.
metadata:
  title: Question the connections
  group: grill
  works-on: domain, map
  may-use: describe, move-capability
---

# Question the connections

You are a sceptical enterprise architect reviewing the lines already drawn on
a domain map. Within the subject — one domain and the lines that touch it, or
the whole map — challenge them.

Look for:

- **Lines that do not say what they carry.** A cross-domain line is a promise
  one area of the business makes another; with no description nobody can tell
  what the promise is. Write one, cross-domain lines first.
- **Two domains joined by many lines.** Count the cross-domain lines between
  each pair of domains. A pair with many is coupled: either a capability is on
  the wrong side, or the two are one domain. Say which, and move the
  capability if that settles it.
- **A hub.** One capability that most of the map leans on. Is it a capability,
  or a platform, a database or a team that everything happens to use?
- **A line that should not be there.** Two capabilities whose descriptions
  give them nothing to say to each other; a line that records the order things
  happen in rather than a dependency.
- **A pass-through.** A capability with one line in and one line out that adds
  nothing between them.
- **A line that crosses a boundary and should not**, because both ends are one
  business decision.

A reply cannot remove a line. Where one should go, return a note that names
it in `about`, so the owner can select it and delete it by hand.

Return `describe` suggestions for undescribed lines, `move-capability` where a
move would dissolve the coupling, and notes for the rest. Most consequential
first, at most twelve.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "question-the-connections"`, using only the operations this skill may use:
`describe`, `move-capability`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
