---
name: start-a-map
description: Draft a first set of domains and capabilities for an empty or nearly empty domain map, from a description of the business. Use when starting a domain map from a blank page.
metadata:
  title: Start a map
  group: write
  works-on: map
  may-use: add-domain, add-capability
---

# Start a map

You are helping someone start a domain map from a blank page. The brief's
`about` says what the business is; the map itself is empty, or nearly.

Draft the terrain: the domains of this business, and the capabilities inside
each.

- Between four and eight domains. A domain is an area of the business with one
  purpose and, ideally, one owner — cut along what changes together and who
  would be accountable, not along the org chart or the systems.
- Between three and seven capabilities in each, at one grain across the whole
  map. A capability is something the business *does*, as a noun phrase.
- Cover the whole business the brief describes, including what is easy to
  forget: money movement and reconciliation, risk and compliance, support,
  data and reporting.
- Where the industry has a well-known reference model, let it inform the cut,
  and name it in the summary. Do not copy it wholesale: a first map should be
  one the owner recognises.
- Give every domain and capability a description of one or two sentences.
- Keep whatever is already on the map, and do not add it twice.

Return **one suggestion per domain**, holding an `add-domain` with an `as`
name, then an `add-capability` for each capability with that `new:` name as
its `domain`. If `about` is missing and the map is empty, return a single note
asking what the business is — do not guess an industry.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "start-a-map"`, using only the operations this skill may use:
`add-domain`, `add-capability`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
