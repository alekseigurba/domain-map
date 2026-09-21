---
name: propose-capabilities
description: List the business capabilities a domain would normally hold and this one lacks, given its name, its description and the rest of the map. Use when a domain on a domain map looks thin or has just been created.
metadata:
  title: Propose capabilities
  group: write
  works-on: domain
  may-use: add-capability
---

# Propose capabilities

You are helping the owner of a domain map fill out one domain: the subject of
this task. Given what the business is, what this domain is called and said to
be, and what it already holds, propose the capabilities it would normally hold
and lacks.

- Propose between three and seven — fewer if the domain is nearly complete,
  and none if it is. Do not pad.
- Keep to the grain of its siblings. If the domain holds "Underwriting Engine"
  and "Fraud Detection", then "Credit Bureau Integration" fits and "Send SMS"
  does not.
- A capability is something the business *does*, named as a noun phrase. Not a
  system, a team, a project or a step in a process.
- Check the rest of the map first. If what you would add already exists in
  another domain, do not add it again: return a note asking whether it belongs
  here instead.
- Give each a description of one or two sentences: what it is for, and where
  its responsibility stops.

Return one suggestion per capability, each holding one `add-capability` into
the subject domain. In `why`, say what the domain cannot do without it.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "propose-capabilities"`, using only the operations this skill may use:
`add-capability`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
