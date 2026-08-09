# Deploying the class demo (free)

This puts the app online at a public HTTPS URL for a demo. It uses **Railway**,
which can host the Node app and a MySQL database together. Railway gives a
one-time **$5 trial credit with no credit card** — plenty for a short class
demo (a tiny app + database runs for weeks on it).

> Sign-in uses passwords (hashed with scrypt). Set a `COORDINATOR_PASSWORD`
> environment variable so the seeded coordinator account isn't the documented
> default, and set a strong `SESSION_SECRET` (both covered below).

## One-time preparation

1. **Put the project on GitHub.** Create a new repository and push this folder
   to it. (Do not commit `node_modules` — the included `.gitignore` already
   excludes it.)

## Deploy on Railway

2. Go to **railway.app**, sign up (GitHub sign-in is easiest), and click
   **New Project → Deploy from GitHub repo**, then pick your repository.
   Railway auto-detects Node, runs `npm install`, and starts it with `npm start`.

3. In the same project, click **New → Database → Add MySQL**. Railway creates a
   managed MySQL instance.

4. Connect the app to the database. Open your **app service → Variables**, and
   add one variable:
   - **Name:** `MYSQL_URL`
   - **Value:** reference the database's URL. Type `${{` and Railway will let you
     pick it — choose the MySQL service's `MYSQL_URL` (it looks like
     `mysql://root:...@...railway.app:PORT/railway`).

   Also add:
   - **Name:** `SESSION_SECRET` **Value:** any long random string.
   - **Name:** `COORDINATOR_PASSWORD` **Value:** a password for the coordinator account
     (used when the database is first seeded).

5. Railway redeploys. The app **creates its own tables and demo data on first
   start** — no extra command needed. When the deploy finishes, open the
   app service → **Settings → Networking → Generate Domain** to get your public
   URL (HTTPS is automatic).

6. Visit the URL. Sign in as **Coordinator** with `ellen@lancaster.edu.gh` and the
   `COORDINATOR_PASSWORD` you set (or `coordinator123` if you left it unset). Students
   and staff can create their own accounts from the sign-in screen.

That's it — share the URL for your demo.

## Fully-free alternative (no trial credit)

If you'd rather not use Railway's trial: deploy the app on **Render** (free web
service) and use a free MySQL-compatible database such as **TiDB Cloud** (free
tier). Create the TiDB database, then on Render set the same `MYSQL_URL`
(or the individual `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`
variables) and `SESSION_SECRET`. The app self-initialises the same way. Note the
Render free tier sleeps when idle, so the first visit after a pause is slow.

## Before real use (beyond a demo)

Sign-in now uses hashed passwords, so the app is safe to expose for a demo. For a full
institutional rollout you'd still want to: set strong `SESSION_SECRET` and
`COORDINATOR_PASSWORD` values, optionally integrate the university's single sign-on in
`server/routes/auth.js`, add password-reset, and serve strictly over HTTPS (the hosts
above do this automatically).
