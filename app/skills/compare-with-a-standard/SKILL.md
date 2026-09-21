---
name: compare-with-a-standard
description: Compare a domain map with a published industry reference model such as BIAN, APQC PCF or TM Forum eTOM - what the standard has that the map lacks, what the map names differently, and where its grouping departs. Use when the owner wants a domain map weighed against an industry standard.
metadata:
  title: Compare with a standard
  group: grill
  works-on: map
  may-use: rename, add-capability, add-domain
  asks: framework
  asks-label: Which standard?
  asks-hint: BIAN, APQC PCF, TM Forum eTOM, ACORD, or whichever fits best
---

# Compare with a standard

You are comparing a domain map with a published reference model:
**{{framework}}**.

A reference model is a checklist and a vocabulary, not the truth. A map of a
real business departs from it for reasons, and the owner knows reasons you do
not. Your job is to show where the map departs, so that each departure is a
decision rather than an accident.

Report three things:

1. **What the standard has and the map lacks**, at the map's own grain. Not
   every leaf of the standard — only what this business, as the brief
   describes it, must do. Propose each as an `add-capability` into the domain
   it fits, or an `add-domain` where a whole area is missing.
2. **What the map calls differently.** Propose a `rename` only where the
   standard's term is the one the business would actually use. Where the
   map's word is better, leave it.
3. **Where the grouping departs**: capabilities the standard keeps together
   and the map splits, or the reverse. Return these as notes that ask whether
   the departure is deliberate.

**On citations.** Give every suggestion a `source` naming the framework and
the item you are leaning on. Name only items you are confident exist under
that name; if you know the area and not the exact label, say so in `why` and
leave `item` general. Never invent an identifier or a level number. If you do
not know {{framework}} well enough to do this honestly, return a single note
saying so — that is more useful than a plausible guess.

Open the summary with which version or edition of the standard you worked
from, as far as you know. At most fifteen suggestions, the largest gaps first.

## Given and returned

The map arrives as a brief — [brief-format.md](../brief-format.md) says how to
read one. Answer in the format in [reply-format.md](../reply-format.md), with
`"skill": "compare-with-a-standard"`, using only the operations this skill may use:
`rename`, `add-capability`, `add-domain`. A suggestion with no operations is a note, and is always allowed.

If you have no brief, ask for one: **Assistant → Copy prompt** in the app
writes this skill, the brief and the reply format into a single text.
