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
- `tournaments/` — public tournament page: live games, standings and bracket
- `admin/` — organiser app for running tournaments
- `assets/js/` — tournament logic (`tournament-core.js`), data store (`store.js`) and the two apps
- `firestore.rules` — who's allowed to edit tournaments

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

## Tournaments

- **Public page:** `rally4relief.com/tournaments/` lists every published tournament. Each one has live games, group standings and the bracket. Visitors can pick a team to follow, and the page updates by itself, with no refresh needed.
- **Organiser app:** `rally4relief.com/admin/` (also linked as "Organiser login" in the footer). Create a tournament, add teams, pick a format (groups, a bracket, or groups then a bracket) and enter scores from your phone during games.

Scores count as goals, points or sets, whatever suits the sport. For volleyball, enter the sets each team won, e.g. 2–1. Win, draw and loss points can be changed per tournament under **Settings**.

Until Firebase is connected, both pages run in **demo mode**: everything is saved only in the browser you're using, which is handy for trying things out.

### Connecting Firebase (one-time, free)

1. Go to <https://console.firebase.google.com>, click **Create a project** and name it e.g. `rally4relief`. Google Analytics isn't needed.
2. **Firestore:** **Build → Firestore Database → Create database**. Pick a location near you and start in **production mode**.
3. **Rules:** in Firestore, open the **Rules** tab, paste in the contents of `firestore.rules`, add every organiser's Google email to the list, then click **Publish**.
4. **Sign-in:** **Build → Authentication → Get started → Google → Enable**, then save.
5. **Allowed domains:** under **Authentication → Settings → Authorized domains**, add `rally4relief.com` and `www.rally4relief.com`.
6. **Web app config:** **Project settings** (gear icon) **→ Your apps → Web (</>)**. Register an app, copy the `firebaseConfig` object, and paste it into `assets/js/firebase-config.js` in place of `null`.
7. Push the change. Sign in at `/admin/` with an organiser Google account.

The Firebase config isn't a secret; it's meant to be public. Who can edit is controlled by the rules in step 3. To add or remove an organiser later, edit the email list in the Firestore rules and publish again.

The free Spark plan easily covers a tournament: it allows 50,000 reads and 20,000 writes per day.

## Deploying

The site is hosted on GitHub Pages at **rally4relief.com**. The `CNAME` file tells GitHub which domain to serve it on.

DNS records at the domain registrar:

| Type  | Name  | Value                   |
|-------|-------|-------------------------|
| A     | `@`   | `185.199.108.153`       |
| A     | `@`   | `185.199.109.153`       |
| A     | `@`   | `185.199.110.153`       |
| A     | `@`   | `185.199.111.153`       |
| CNAME | `www` | `mahadmyonis.github.io` |

Contact: [@rally4relief](https://instagram.com/rally4relief) · rally4relief.team@gmail.com
