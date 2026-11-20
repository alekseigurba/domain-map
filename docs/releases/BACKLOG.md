# Backlog

- Collapsed view of domains (the domain to domain connector itself is in 2.6.0, drawn by zoom from the domain boundary, with the shapes left as they are):
  - Add a "Collapse/expand Domains" control to the diagram screen.
  - Collapsed domain shape should be a smaller blob with the title at the center; the blob shape/proportions should be the same as the expanded ones.
  - Add snap points to domain shapes in collapsed view; when I change the snap point in the collapsed view, do not forget the actual capability (true connector owner).
  - Remember the position of all domain shapes in both collapsed and expanded views independently.
- Slideshow mode - domain/capability postcards with metadata.
- Teams (owners, maintainers, enablers?).
- People overlays (by function? e.g. product, engineering).
- Enhance connector snap points (larger on hover, etc).
- Extend metadata.
- Metadata external links/labels.
- Apply labels (and contents?) from metadata (e.g., title, team, etc.).
- A viewer who follows a `?version=` link is turned away rather than shown the published map. Worth revisiting.
- A directory behind the people list, per provider. For Entra, the users and groups assigned to the app over Microsoft Graph (`Application.Read.All`, `GroupMember.ReadBasic.All`, `User.ReadBasic.All`, with a tenant administrator's consent), so the Owner box offers people who have not signed in yet and the list says who has lost access.
- Versions carry no note or description. A version can be named now, but there is nowhere to say what it was for.
- Share file versions with selected people rather than the entire org.
