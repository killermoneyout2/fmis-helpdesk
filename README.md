# Facilities Management Information System (FMIS) — Phase 1

A complaint help desk for the Facilities department at Lancaster University Ghana.
Staff and students log maintenance requests; the coordinator assigns technicians and
tracks each request through a full status history. Built as **Node.js + Express + MySQL**,
implementing the database design from the project report.

## What it does

- **Password sign-in.** Students and staff create an account (email + password) and
  sign in; the coordinator account is pre-provisioned. Passwords are hashed with scrypt.
- **Log requests.** Each new complaint gets a unique reference code (e.g. `FM-2026-0006`),
  a category, location, priority, and a starting status of *Pending*.
- **Coordinator dashboard.** Status counts, filters (status / category / search),
  technician assignment (which moves *Pending → Ongoing*), and status updates with a reason.
- **Status history.** Every change is recorded with who, when, and why — an auditable trail.
- **Access control.** Requesters see only their own requests; assignment and status
  changes are coordinator-only.

## Requirements

- Node.js 18 or newer
- MySQL 8 (or MariaDB 10.4+)

## Setup

1. **Create the database and a user** (adjust names/passwords as you like):

   ```sql
   CREATE DATABASE fmis CHARACTER SET utf8mb4;
   CREATE USER 'fmis'@'127.0.0.1' IDENTIFIED BY 'fmis_pw';
   GRANT ALL PRIVILEGES ON fmis.* TO 'fmis'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

2. **Configure** (optional). Copy `.env.example` to `.env` and edit if your database
   settings differ from the defaults. The app runs on the defaults with no `.env` file.

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Start the server:**

   ```bash
   npm start
   ```

   On first start the app **initialises its own database** — it creates all tables and
   seeds a coordinator, technicians, and five sample complaints automatically. (You can
   also run this step explicitly with `npm run setup-db` if you prefer.)

   Then open **http://localhost:3000**.

## Signing in

Demo accounts created by the seed:

| Role | Email | Password |
|---|---|---|
| Coordinator | `ellen@lancaster.edu.gh` | `coordinator123` |
| Student | `ama.danso@student.lancaster.edu.gh` | `student123` |
| Staff | `k.asante@lancaster.edu.gh` | `staff123` |

New students and staff can also **create their own account** from the sign-in screen
("Create an account"). Change the coordinator's seed password by setting the
`COORDINATOR_PASSWORD` environment variable before first start.

### A note on authentication

Passwords are hashed with scrypt (Node's built-in `crypto`) — no plaintext is stored and
there is no external dependency. Self-registration always creates a *requester*; the
`coordinator` role is only assigned by the seed, never through sign-up. For an
institutional deployment you could additionally integrate the university's single sign-on
in `server/routes/auth.js`.

## Project structure

```
server/
  index.js         Express app (sessions, routes, static hosting)
  config.js        Configuration from environment variables
  db.js            MySQL connection pool
  schema.sql       Table definitions + lookup seed data (MySQL DDL)
  setup-db.js      Applies the schema and seeds demo data
  routes/
    auth.js        Sign in / out, session
    api.js         Complaints, assignment, status history, stats
public/
  index.html       Front-end shell and styling
  app.js           Front-end logic (talks to the API)
test/
  smoke.js         End-to-end API test (node test/smoke.js while the server runs)
```

## API summary

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | anyone | Sign in |
| POST | `/api/auth/logout` | signed-in | Sign out |
| GET | `/api/auth/me` | anyone | Current session |
| GET | `/api/meta` | signed-in | Categories, statuses, technicians |
| GET | `/api/stats` | coordinator | Dashboard counts |
| GET | `/api/complaints` | signed-in | List (requesters: own only) |
| POST | `/api/complaints` | requester | Create a complaint |
| POST | `/api/complaints/:id/assign` | coordinator | Assign a technician |
| POST | `/api/complaints/:id/status` | coordinator | Update status + reason |
| GET | `/api/complaints/:id/history` | signed-in | Status history |

## Scope

This is **Phase 1** (the complaint help desk). The database schema also includes the
**Phase 2** asset register and per-asset work-history tables from the design, ready to
build on later.
