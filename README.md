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
- `assets/` — logo, favicon and social preview image

## Design

Brand colours on a mostly black page, with gold as the accent. They're defined once in the `:root` variables at the top of `styles.css`.

| Token      | Hex       | Use                         |
|------------|-----------|-----------------------------|
| Black      | `#0B0B0B` | Page background             |
| Gold       | `#D4A63A` | Accent, buttons, highlights |
| Cream      | `#F5F2EA` | Main text                   |
| Muted grey | `#9C9585` | Labels, small text          |

Fonts (Google Fonts): **Bricolage Grotesque** for headlines, **Instrument Sans** for body text, **Instrument Serif** italic for accent words.

Logo files live in `assets/`: `logo.png` (full lockup), `logo-mark.png` (R4R only), `favicon.png` and `og.png` (link preview image). The PNGs have transparent backgrounds.

## Deploying

Any static host works. For GitHub Pages: repo **Settings → Pages → Deploy from a branch**, pick `main` and `/ (root)`.

Contact: [@rally4relief](https://instagram.com/rally4relief) · rally4relief.team@gmail.com
