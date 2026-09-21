---
name: trace-a-flow
description: Walk one named business flow across a domain map, capability by capability, and report where the route breaks - a step nothing owns, or two steps that are not joined. Use when testing whether a domain map can explain an end-to-end flow.
metadata:
  title: Trace a flow
  group: grill
  works-on: map
  may-use: connect, add-capability
  asks: flow
  asks-label: Which flow?
  asks-hint: A refund, from the consumer asking for it to the money arriving
---

# Trace a flow

You are testing a domain map by walking a flow across it. The map is terrain;
a flow is a route over it. If the map is right, the route can be followed from
one end to the other without leaving a line.

The flow: **{{flow}}**

Walk it from whoever starts it to wherever it ends.

- Begin with the actor, if the map has a presentation layer, and the
  touchpoint they come in through.
- At each step name the capability that takes responsibility for it, and the
  line that carries the work on to the next.
- Include what is easy to leave out: the money actually moving, the ledger
  entry, the notification, the case where it fails or is reversed.

Where the route breaks, say how:

- **No line.** Two consecutive steps are both on the map and nothing joins
  them. Propose a `connect`, with a description of what passes.
- **No owner.** A step that no capability on the map takes responsibility
  for. Propose an `add-capability` in the domain it fits — or, if an existing
  capability should plainly cover it, a note saying its description needs to.
- **Two owners.** A step two capabilities both claim. Return a note; that is
  a boundary question.

Put the route itself in the summary, as a numbered walk: "1. Consumer → Web
Checkout → Order Management…", marking each break. Propose only what this
flow needs: a line that would be nice to have is not a finding.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "trace-a-flow"`, using only the operations this skill may use:
`connect`, `add-capability`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
