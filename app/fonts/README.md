# Fonts

Self-hosted Poppins for the chrome and the map labels. Nothing here is picked
by default — `app/css/tokens.css` chooses through `--font-heading` and
`--font-text`, and the family is only downloaded by the browser once a token
names it.

| Family | Files | Axis |
| --- | --- | --- |
| Poppins | `poppins-{300,400,600}-*.woff2` | static — no variable cut exists |

It ships two subsets, `latin` and `latin-ext`. The `unicode-range` in
[`../css/fonts.css`](../css/fonts.css) keeps `latin-ext` off the wire until a
page actually needs an accented character.

Poppins comes from Google Fonts under the SIL Open Font License 1.1; the
upstream license text is in [`licenses/`](licenses/). To add or refresh a
family, fetch the `latin`/`latin-ext` `woff2` from the
`fonts.googleapis.com/css2` API and add the matching `@font-face` to
`../css/fonts.css`.
