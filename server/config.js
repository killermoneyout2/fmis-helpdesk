// Central configuration. Database settings can be supplied three ways
// (checked in this order), which covers local dev and most hosts:
//   1. A single connection URL:  MYSQL_URL or DATABASE_URL
//      e.g. mysql://user:pass@host:3306/dbname
//   2. Host-style variables Railway/others provide: MYSQLHOST, MYSQLPORT, …
//   3. The project's own DB_* variables (see .env.example)
// Whatever is set wins; anything missing falls back to the local defaults.

function fromUrl() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  } catch (e) { return null; }
}

const urlCfg = fromUrl();

const db = urlCfg || {
  host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'fmis',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'fmis_pw',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'fmis',
};

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  db,
};
