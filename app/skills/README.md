# Skills

What the map's **Assistant** can be asked to do. Each folder is one skill, in the
agent-skills form: a `SKILL.md` whose front matter carries a `name` and a
`description`, and whose body is the task itself. The app reads this folder to
build its prompts, and an agent pointed at it can load the same files directly —
there is one copy of every prompt, and this is it.

## The loop

1. **Out.** A prompt is the skill's task, then the map as a *brief*, then the
   reply format. [brief-format.md](brief-format.md) says how to read a brief: it
   is the map with its geometry left out. Where the server has a model
   connected, **Send** posts it there, with the two formats as the system prompt
   and the task and the brief as the turn, after the last few turns if there
   were any; where it has none, **Copy prompt**
   writes all three into one text for a chat of the owner's own.
2. **Back.** The answer is one fenced JSON block, a `domain-map-suggestions`,
   described in [reply-format.md](reply-format.md). It comes back from the
   connected model by itself, or the owner pastes it into the Assistant.
3. **Review.** Every suggestion is checked against the map's own rules and shown
   as a card. Nothing changes until an owner applies a card, and each card is one
   undo step.

An agent working from files does the same thing: read the skill, read the brief
it is handed, write a reply file in that format.

## What a skill file says

Under `metadata`, all as plain strings:

| Key | What it holds |
| --- | --- |
| `title` | What the chip in the Assistant says. |
| `group` | `write`, `grill` or `ask`: which row of chips it sits in. |
| `works-on` | What it can be pointed at: any of `domain`, `capability`, `touchpoint`, `actor`, `line`, and `map` for the whole map. |
| `may-use` | The operations its reply may hold. Anything else is refused on import, so **Describe** can never move a capability. |
| `asks`, `asks-label`, `asks-hint` | One thing to ask the owner for first — a standard, a flow, a question — written into the task wherever `{{that name}}` stands. |

The body ends on a `## Given and returned` section that points at the two format
files. It is there for an agent reading the folder; a pasted prompt writes the
formats in where that section stood.

[index.json](index.json) lists the skills in the order the chips are shown. The
browser cannot list a folder, so a skill that is not in it is not offered.

## What is not here

A skill is a prompt and a list of operations it may use. The operations
themselves — what a reply may do to a map, and how each is checked — are the
app's, in `app/js/suggestions.js`, and there is none that removes anything or
moves a shape about. A skill may ask for fewer of them; it cannot add one.
