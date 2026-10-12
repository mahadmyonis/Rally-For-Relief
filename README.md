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

## Brand

| Token      | Hex       | Use                                  |
|------------|-----------|--------------------------------------|
| Black      | `#0B0B0B` | Main background                      |
| Gold       | `#D4A63A` | Accent, highlights, CTA — sparingly  |
| Cream      | `#F5F2EA` | Main text                            |
| Muted grey | `#9C9585` | Labels, small text                   |

Fonts: **Barlow Condensed** (Black Italic headlines, letter-spaced labels) and **DM Serif Display** (supporting lines), loaded from Google Fonts.

The logo is being redesigned — until it's final, the header and footer use the "RALLY FOR RELIEF" letter-spaced wordmark.

## Deploying

Any static host works. For GitHub Pages: repo **Settings → Pages → Deploy from a branch**, pick `main` and `/ (root)`.

Contact: [@rally4relief](https://instagram.com/rally4relief) · rally4relief.team@gmail.com
