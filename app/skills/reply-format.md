# The reply you give back

Reply with **one fenced `json` block** holding one object, a
`domain-map-suggestions`. You may write a sentence or two before it; anything
after it is ignored. The owner pastes your reply into the map, where every
suggestion becomes a card to read, apply or dismiss — so nothing you write
changes the map by itself, and a suggestion that cannot be checked is refused.

```json
{
  "format": "domain-map-suggestions",
  "version": 1,
  "skill": "grill-the-boundaries",
  "summary": "Two or three sentences: what you looked at, and the headline finding.",
  "suggestions": [
    {
      "title": "Move Fraud Detection into Credit & Risk Assessment",
      "why": "It shares no line with anything in Checkout, and three with the Underwriting Engine. It is a risk decision that checkout merely waits for.",
      "about": ["capability:fraud-detection", "domain:credit-risk-assessment"],
      "operations": [
        { "op": "move-capability", "capability": "capability:fraud-detection", "domain": "domain:credit-risk-assessment" }
      ]
    }
  ]
}
```

## A suggestion

| Field | What it holds |
| --- | --- |
| `title` | The suggestion in one line, as an instruction: "Move…", "Rename…", "Connect…", or a question for a note. |
| `why` | The reasoning, in plain sentences, from what is on the map. This is what the owner decides on, so it matters more than the operation. |
| `about` | The refs of the shapes it concerns, so the card can point at them on the map. A line is `{ "from": "<ref>", "to": "<ref>" }`. |
| `source` | Only when you lean on a published standard: `{ "framework": "BIAN", "item": "Fraud Detection" }`. Name a framework and an item only if you are confident both exist; the owner is told to check it either way. Never invent a citation to strengthen a point. |
| `operations` | What applying the card does, in order. All of them are applied together as one step, or none are. **Leave it empty for a note**: a finding, a question, or something to remove — the owner does removals by hand. |

One suggestion is one decision. A split, say, is a single suggestion holding an
add, a rename and a move — not three suggestions the owner might half apply.
Put the suggestions that matter most first.

## The operations

These are all there are. There is no operation that removes, deletes, merges or
disconnects anything, and none that touches position, colour, size or layers.

| Operation | Shape |
| --- | --- |
| `describe` | `{ "op": "describe", "target": "<ref>", "description": "…" }` — for a line, the target is `{ "from": "<ref>", "to": "<ref>" }`; for the map's own description, the brief's `about`, it is `"map"`. At most 2000 characters; one or two sentences is what a shape wants. |
| `rename` | `{ "op": "rename", "target": "<ref>", "title": "…" }` — not for a line, which has no title. |
| `set-type` | `{ "op": "set-type", "target": "<ref>", "type": "…" }` — one of the brief's `types` for that kind, exactly. |
| `add-domain` | `{ "op": "add-domain", "as": "new:…", "title": "…", "description": "…" }` |
| `add-capability` | `{ "op": "add-capability", "as": "new:…", "domain": "<ref>", "title": "…", "description": "…" }` — leave `domain` out to add it loose. |
| `add-touchpoint` | `{ "op": "add-touchpoint", "as": "new:…", "title": "…", "description": "…" }` |
| `add-actor` | `{ "op": "add-actor", "as": "new:…", "title": "…", "description": "…" }` |
| `move-capability` | `{ "op": "move-capability", "capability": "<ref>", "domain": "<ref>" }` |
| `connect` | `{ "op": "connect", "from": "<ref>", "to": "<ref>", "description": "…" }` — only the pairs the map can draw: actor–touchpoint, touchpoint–capability, capability–capability. Two shapes already joined cannot be joined again. |

`as` is optional. It names a shape the suggestion makes — `"new:fraud-scoring"`
— so that a later operation **in the same suggestion** can use it where a ref
would go: a capability added to a domain the suggestion has just added, a line
to a capability it has just added. A `new:` name means nothing outside the
suggestion that made it.

Titles are 1 to 200 characters, on one line.
