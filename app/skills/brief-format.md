# The map you are given

The map arrives as one JSON object, a `domain-map-brief`. It is a domain map with
its drawing left out: what is on it, what each thing is called and said to be,
and what is joined to what. Where a shape sits, its colour and its size are not
in the brief and are not yours to change — on this kind of map position carries
meaning, and that meaning is the owner's.

## What is on a map

- A **domain** is an area of the business with one purpose and, ideally, one
  owner. It holds capabilities and nothing else.
- A **capability** is something the business *does* — "Fraud Detection",
  "Merchant Settlement" — named for the what, not the how: not a system, not a
  team, not a project, not a process step. It sits in one domain, or loose on
  the map in none.
- A **touchpoint** is a channel through which someone reaches the business: a
  web checkout, a merchant portal, a partner API, a call centre.
- An **actor** is a person or an organisation outside the capabilities: a
  consumer, a merchant, a regulator, a support agent.
- A **product area** is who owns what: the part of the organisation — a team, a
  tribe, a product line — that holds a set of domains, touchpoints and loose
  capabilities. A shape is in one area or in none, and a capability inside a
  domain belongs to its domain's area. Areas say how the organisation is cut,
  which is worth holding against how the business is cut: a domain whose
  capabilities talk mostly to another team's is a boundary to ask about. Who
  owns what is the owner's to decide, as position is — no operation adds an
  area or hands a shape to one; say it in a note.
- A **line** joins two of the first four. It has two ends and no direction. Lines run
  strictly down the stack, and nothing else can be drawn:
  - an actor joins a touchpoint,
  - a touchpoint joins a capability,
  - a capability joins a capability.

  An actor never joins a capability directly, two actors or two touchpoints
  never join each other, and nothing joins a domain or an area.

A line between two capabilities in the same domain is `internal`: plumbing
inside one area. One between capabilities in different domains is
`cross-domain`: a public event, something one area of the business promises
another. Many cross-domain lines between the same two domains is a sign that the
boundary between them is in the wrong place.

## The fields

| Field | What it holds |
| --- | --- |
| `title` | What the map is called. |
| `about` | What the business is, in the owner's words: the industry, who the customers are, what is in scope, the standards the map is weighed against. It is the map's own description. It may be missing; then infer it from the map, and open your summary by saying what you inferred. |
| `subject` | What this task is about: `"map"` for the whole map, a reference such as `"capability:fraud-detection"`, or `{ "line": { "from", "to" } }`. The whole map is always given, because a boundary cannot be judged without its neighbours — but keep your suggestions to the subject. |
| `types` | The Type choices this map offers for each kind of shape. A `set-type` may only use one of these. |
| `areas` | Every product area. Missing when the map draws none. |
| `domains` | Every domain, each with the `capabilities` inside it. |
| `looseCapabilities` | Capabilities that sit in no domain. |
| `touchpoints`, `actors` | The presentation layer. Either may be empty. |
| `lines` | Every line: its two ends, its `scope` — `internal`, `cross-domain`, `touchpoint` (a touchpoint to a capability) or `interaction` (an actor to a touchpoint) — and its description if it has one. |

Every shape carries a `ref`, its `title`, and — only where the map has them —
a `description`, a `type` and an `owner`. A domain, a touchpoint and a loose
capability carry an `area` too, the ref of the product area they are in, where
they are in one. A field that is missing is empty on
the map.

## References

A shape is named by its `ref`: `<kind>:<key>`, such as
`domain:credit-risk-assessment` or `capability:fraud-detection`. Copy a ref
exactly as the brief spells it; never make one up, and never build one from a
title yourself. A line has no ref of its own and is named by its two ends.
