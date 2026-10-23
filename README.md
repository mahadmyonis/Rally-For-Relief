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

Scores count as goals, points or sets, whatever suits the sport. Under **Settings → Scoring**, choose "Points or goals" or "Sets: best of 1, 3 or 5". With sets, scorers get one-tap results (2–0, 2–1…) and impossible scores are refused. Win, draw and loss points can also be changed per tournament.

**Schedule:** in **Format → Schedule**, set the first game's time and the minutes per game, then choose **One court per group** or **Share courts**, and tap **Set times & courts**. With one court per group, Group A plays on Court 1 and Group B on Court 2, one game at a time, so game 1 of every group starts together, then game 2, and so on. Nobody plays twice in a row where it can be avoided, and the knockouts follow straight after. Any single game's time or court can still be changed in its scoreboard.

**Scoring on match day:** the **Scores** tab lists every game by round, with a progress bar, filters (To play / Live / Done) and a court filter. Tap a game to open its scoreboard: **Start game**, then use the big **+ / −** buttons or a quick result, then **Save final score**. After that, **Next game** jumps straight to the next game on the same court.

**What visitors see:** the **Games** tab lays the day out side by side like a bracket: each group-stage column is a time slot showing the games played at the same time (one per court), then the knockout rounds, opening on what's being played now. Each group's standings come with a results grid showing who beat whom. Following a team switches to a numbered timeline of their games ("Game 1 of 4", "Game 2 of 4"…) with time, court, opponent and the result from their side. A summary card shows their group position, record and next game, and a final step shows the knockouts they could reach. Every game also has a number (#1, #2…) in play order, the same across the page.

### Sign-ups and donations

- **Team sign-ups:** in a tournament's **Settings**, paste your sign-up form link (e.g. a Google Form) and tick **Sign-ups are open**. A "Sign up your team" button then appears on the home page ticket and on the tournament page. Untick it to close sign-ups. Sign-ups also close automatically when the tournament is set to Finished.
- **Donations:** on the organiser dashboard, fill in **Donations**: the campaign name, the donation link (e.g. LaunchGood), a short description, the amount raised and the goal. Then tick **Show on the website**. The home page gets a donation section with a progress bar, plus "Donate" links in the menu and footer. Update "Raised so far" whenever you like.

### Sharing

Every published tournament page, and the organiser app, has a **Share** button. It opens a short ready-made message saying what the link is for, which changes with the tournament: sign-ups while they're open, the schedule once they close, live scores during games, and results at the end. The message can be edited, then shared through the phone's share menu or WhatsApp, or copied as a message or a link.

### How the standings are worked out

- Only games marked **Final** count. Live games don't change the table until they're finished.
- Each team gets the Win, Draw or Loss points set in **Settings**. The defaults are 3, 1 and 0.
- **+/−** is total scored minus total conceded across a team's group games.
- Teams level on points are ranked by: **score difference**, then **total scored**, then **head-to-head**. Head-to-head is a mini-table of just the games between the tied teams: points, then difference, then scored. If they're still level, it goes by **wins**, then alphabetical order.
- A group's teams go into the bracket only once **every game in that group is final**. Group winners face runners-up, and teams from the same group are kept apart in the first knockout round.
- Knockout games can't end tied. The winner moves on automatically, and byes go through without playing.

The maths is covered by automated tests. Run `node --test tests/tournament-core.test.mjs` after any change to `tournament-core.js`.

Until Firebase is connected, both pages run in **demo mode**: everything is saved only in the browser you're using, which is handy for trying things out.

### Connecting Firebase (one-time, free)

1. Go to <https://console.firebase.google.com>, click **Create a project** and name it e.g. `rally4relief`. Google Analytics isn't needed.
2. **Firestore:** **Build → Firestore Database → Create database**. Pick a location near you and start in **production mode**.
3. **Rules:** in Firestore, open the **Rules** tab, paste in the contents of `firestore.rules`, add every organiser's Google email to the list, then click **Publish**. Paste them in again whenever `firestore.rules` changes.
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
