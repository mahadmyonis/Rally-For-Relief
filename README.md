# Rally for Relief

Landing page for **Rally for Relief (R4R)** — a community built on giving back.
*Play hard. Give back.*

## Running locally

It's a plain static site — no build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

- `index.html` — page content and structure
- `styles.css` — brand styles (colours, fonts, layout)
- `script.js` — mobile menu, header state, scroll reveal

## Design

Warm paper background with pitch green and tangerine accents. Change the colours in one place: the `:root` variables at the top of `styles.css`.

| Token  | Hex       |
|--------|-----------|
| Paper  | `#F4EFE6` |
| Ink    | `#141414` |
| Green  | `#1E4D3A` |
| Orange | `#FF6B2C` |
| Sand   | `#E9D9B8` |

Fonts (Google Fonts): **Bricolage Grotesque** for headlines, **Instrument Sans** for body text, **Instrument Serif** italic for accent words.

## Deploying

Any static host works. For GitHub Pages: repo **Settings → Pages → Deploy from a branch**, pick `main` and `/ (root)`.

Contact: [@rally4relief](https://instagram.com/rally4relief) · rally4relief.team@gmail.com
