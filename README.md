# Prompt Pond

A four-page full-stack student project for exploring AI chat activity. The frontend is plain HTML, CSS and JavaScript. The API is a Cloudflare Worker using D1 (a SQLite-compatible database). Wrangler is only a command-line deployment tool.

## Folder structure

project/
├── README.md
├── docs/                   # GitHub Pages publishes this folder
│   ├── .nojekyll
│   ├── index.html          # Home
│   ├── import.html         # JSON upload or manual entry
│   ├── dashboard.html      # Stats, SVG chart, badges, estimate
│   ├── about.html          # Method, privacy and references
│   ├── style.css
│   ├── config.js           # Put your deployed Worker URL here
│   ├── logic.js            # Parsing and statistics
│   └── app.js              # Page interactions and API calls
├── worker/
│   ├── package.json
│   ├── wrangler.toml       # Put your D1 ID and Pages origin here
│   ├── migrations/
│   │   └── 0001_init.sql
│   └── src/
│       └── index.js        # GET, PUT and DELETE summary API
└── tests/
    ├── logic.test.cjs
    └── worker.test.mjs
```

## What it does

1. Parses a ChatGPT `conversations.json` export locally in the browser.
2. Supports manual prompt counts.
3. Counts total user messages, active days, busiest day and longest streak.
4. Filters the chart to all days, 30 days or 7 days.
5. Awards activity badges.
6. Recalculates a clearly marked illustrative water number with a slider.
7. Compares the water volume with a glass and bottle.
8. Saves, restores and deletes a summary through a real API and D1 database.

Only the total, mode and dated counts are sent to the API when the visitor explicitly presses **Save summary**. Conversation text is not uploaded. The browser holds a random key in local storage; this is an anonymous demo, not a full account system.

## Requirements

- A GitHub account for the repository and Pages site.
- A Cloudflare account for the Worker and D1 database.
- Node.js and npm for the `npx wrangler` deployment command. No `npm install` or application package dependencies are required.
- Python 3 (optional) for a simple local frontend server. VS Code Live Server can also serve `docs/` on port 5500.

GitHub Pages serves static files and **cannot execute PHP or a backend**. The site lives on Pages; the Worker and database run on Cloudflare. Both deployments are needed for cloud save/restore/delete. The home page, sample dashboard, manual entry and local file analysis can be explored before backend setup.

## Run locally

From the `project` directory, run:

```sh
python -m http.server 5500 -d docs
```

Open `http://localhost:5500`. For local API development, complete the D1 setup below, apply the migration with `--local`, run `npx wrangler dev` inside `worker/`, and set `window.PROMPT_POND_API = "http://localhost:8787";` in `docs/config.js`. Open the frontend at `http://localhost:5500` (or `127.0.0.1:5500`).

## Deploy the backend

Run these from the `worker/` directory in a terminal after signing into Cloudflare:

```sh
npx wrangler login
npx wrangler d1 create prompt-pond-db
```

Copy the returned database UUID into `worker/wrangler.toml`, replacing the all-zero `database_id`. In `[vars]`, append your **GitHub Pages origin** to `ALLOWED_ORIGINS`, separated by a comma. For example:

```toml
ALLOWED_ORIGINS = "http://localhost:5500,http://127.0.0.1:5500,https://YOUR_USERNAME.github.io"
```

Use just the origin; do not include `/prompt-pond` or another repository path. Then create the remote table and deploy:

```sh
npx wrangler d1 migrations apply prompt-pond-db --remote
npx wrangler deploy
```

Wrangler prints a URL like `https://prompt-pond-api.YOUR_SUBDOMAIN.workers.dev`. Put that URL, with no trailing slash, into `docs/config.js`:

```js
window.PROMPT_POND_API = "https://prompt-pond-api.YOUR_SUBDOMAIN.workers.dev";
```

For local Worker development, create a separate local table once:

```sh
npx wrangler d1 migrations apply prompt-pond-db --local
npx wrangler dev
```

The local database is separate from the remote database. The endpoint `/api/health` should return `{"ok":true}`. Test saving from the website after both origins and the API URL are configured.

## Publish the website on GitHub Pages

1. Create a GitHub repository, for example `prompt-pond`.
2. Copy **the entire folder contents** into that repository, preserving the `docs/`, `worker/` and `tests/` directories. Do not commit an actual chat export or personal data.
3. Commit and push to the `main` branch.
4. In the repository, open **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, `main`, and `/docs`, then save.
5. Open the URL shown by GitHub, usually `https://YOUR_USERNAME.github.io/prompt-pond/`. If you edited `docs/config.js` after pushing, commit and push that change too.

If you use a repository named `YOUR_USERNAME.github.io`, the website URL is the origin itself. The `ALLOWED_ORIGINS` value is still `https://YOUR_USERNAME.github.io`.

## Test

From the project root, with Node.js installed:

```sh
node --test
```

Manual checks: try the sample dashboard; import a valid `conversations.json`; import invalid JSON and verify the text error; enter a manual count; try the date filter and water slider; save, refresh and delete the summary. Test keyboard navigation and mobile width. You can create a small local JSON fixture with a conversation `mapping` and user messages; never commit a real export.

## Limitations and calculation

- Only ChatGPT conversation JSON with a `mapping` and user message `author.role` is supported. The parser accepts a top-level array and limits individual files to 20 MB. Numbered exports can be selected one at a time; each new import replaces the current browser summary.
- Timestamps are grouped by UTC day. Undated user messages count toward the total but not daily charts.
- Water shown = prompt count × adjustable mL per prompt. The initial 0.32 mL is approximately 0.000085 US gallons, cited in the About page. It is an illustrative assumption, not an individual measurement. A range of 0–5 mL is a slider for exploring assumptions, not a scientifically established confidence interval.
- Glasses use 250 mL and bottles use 500 mL as reference volumes. No agricultural water-footprint equivalence is claimed.
- The API stores one summary per browser key. Clearing local storage loses access to that saved record. This project has no login, cross-device sync, or automatic data retention policy.

## Suggested report work split for two students

| Student | Two pages | Backend or shared responsibility |
| --- | --- | --- |
| Student 1 | Home and Import | Browser JSON parsing, file validation, responsive layout |
| Student 2 | Dashboard and About | Chart, estimate and badges, Worker API and D1 |

Both students should describe actual contributions rather than copying this suggestion blindly. In the report template, include the site map, validation, `fetch`/JSON communication, database schema, screenshots of each working module, accessibility checks, references and the final GitHub repository URL. Replace names and registration numbers with the real team details.

## Accessibility notes

Pages use landmarks and heading order, visible form labels and text errors, keyboard focus outlines, a skip link, descriptive chart text, and no motion-dependent interaction. Check the final deployed pages with a keyboard and a contrast checker; update any colors or content you change.
