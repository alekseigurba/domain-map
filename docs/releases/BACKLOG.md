# Backlog

Reviewed on 2026-11-23, after [2.6.1](2.6.1.md), and put in a suggested order: what is small and felt every day first, what needs a
model of its own or somebody else's consent last. The order is a suggestion; the
items are the owner's. [2.7.0](2.7.0.md), the map over MCP, is planned on its
own page and is not repeated here.

## Small, and felt every day

- Versions carry no note or description. A version can be named now, but there is nowhere to say what it was for. With sandboxes and shared versions there are more of them than names can tell apart.
- A viewer who follows a `?version=` link is turned away rather than shown the published map. They are told the version is not open to them and offered a link to the published one; landing on it directly is the part worth revisiting.
- Enhance connector snap points (larger on hover, etc). They light up under the pointer and are no larger for it; round a big domain they are also far apart.

## The map as the place things are looked up

- Extend metadata.
- Metadata external links/labels.
- Apply labels (and contents?) from metadata (e.g., title, team, etc.).

## Who can see and do what

- Share file versions with selected people rather than the entire org. Local groups will do, with no Entra security groups behind them: a group is a name and its members, kept in Postgres beside the people list and managed in Users & access, and a version is shared with people or with groups. Everyone it could name is already a row there — whoever has signed in, or was added by email ahead of it.
- A directory behind the people list, per provider. For Entra, the users and groups assigned to the app over Microsoft Graph (`Application.Read.All`, `GroupMember.ReadBasic.All`, `User.ReadBasic.All`, with a tenant administrator's consent), so the Owner box offers people who have not signed in yet and the list says who has lost access. Finding people on the list, and clearing out whoever has not been back, are done; this is the half that needs the tenant, and sharing with selected people does not wait on it.

## People on the map

- Teams (owners, maintainers, enablers?). Areas say which team holds what, and an owner is picked from the people list; the roles a person has towards a shape are what is missing.
- People overlays (by function? e.g. product, engineering).

## Showing the map

- Slideshow mode - domain/capability postcards with metadata.
- Collapsed view of domains. This is essentially achieved with the D level of the lines: every line leaves from a domain, lines between two domains are one, and a domain carries connection points of its own. Not sure it is still needed. To consider: a checkbox next to the level slider to "collapse domains" — a smaller blob with the title at the centre, the blob's proportions kept, and a position of its own in the collapsed view.

## Carried over from the last batch

Not the owner's words: things 2.6.1 left behind it, as its page says under
*What it does not do* and *Known issues*.

- The example map's own lines are worded as steps in a flow — "reaches into … to fetch", "checks the merchant's contract" — which is what *Word the lines* now rewrites. The seed is the owner's to change.
- The brief the Assistant is given lists neither features nor the lines that end on a domain or a feature, and `brief-format.md` still says nothing joins a domain. 2.6.0 said so under *What it does not do*; the two new skills read the same brief.
- A feature stood up or made round keeps the seat its row gave it, and lies across its neighbours until it is dragged clear. Rows that make room for a lean are the next step.
- The Assistant's model is switched and keyed in the app; where it is and what it is called are still the deployment's, `ASSISTANT_API_URL` and `ASSISTANT_MODEL`.
