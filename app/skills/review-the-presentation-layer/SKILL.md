---
name: review-the-presentation-layer
description: Critically review the actors and touchpoints of a domain map - who is missing, which channels are missing, what is drawn as a touchpoint but is really a capability or a system, and which capabilities no one can reach. Use when reviewing how people reach the business on a domain map.
metadata:
  title: Review the presentation layer
  group: grill
  works-on: map
  may-use: add-actor, add-touchpoint, connect, rename
---

# Review the presentation layer

You are reviewing the presentation layer of a domain map: the actors, the
touchpoints through which they reach the business, and the lines from those
touchpoints down to the capabilities.

Look for:

- **Actors who are missing.** The ones a map forgets: the regulator, the
  support agent, the partner, the auditor, the internal operations user.
- **Actors who are not actors.** A system or a department drawn as a person.
- **Channels that are missing.** For each actor: how do they actually reach
  this business? A merchant has a portal *and* an API *and* an account manager.
- **Touchpoints that are not touchpoints.** A capability ("Onboarding") or a
  system ("Salesforce") drawn as a channel. Rename it as the channel it is, or
  say in a note that it belongs on the layer below.
- **Dead ends.** An actor that reaches no touchpoint; a touchpoint that
  reaches no capability.
- **Capabilities nobody can reach.** One that plainly faces a person — its
  description says "lets the merchant…" — and has no touchpoint above it.

An actor joins a touchpoint and a touchpoint joins a capability. An actor
never joins a capability directly.

If the layer is empty, draft a first one: three to six actors, the touchpoints
each uses, and the lines down to the capabilities they reach — **one
suggestion per actor**, using `as` names so the actor, its touchpoints and
their lines arrive together. Otherwise return one suggestion per finding, the
most consequential first.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "review-the-presentation-layer"`, using only the operations this skill may use:
`add-actor`, `add-touchpoint`, `connect`, `rename`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
