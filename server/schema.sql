-- =====================================================================
-- Facilities Management Information System (FMIS)
-- Lancaster University Ghana
-- Database schema (DDL) — MySQL 8+ / InnoDB
-- Generated from Database Design v1
--
-- PostgreSQL notes:
--   * Replace ENUM(...) with VARCHAR + CHECK, e.g.
--       priority VARCHAR(10) NOT NULL DEFAULT 'medium'
--         CHECK (priority IN ('low','medium','high'))
--   * Replace INT AUTO_INCREMENT PRIMARY KEY with
--       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY  (or SERIAL)
--   * Drop the ENGINE / CHARSET clauses.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS work_history, complaint_status_history, complaint,
                     asset, app_user, status, problem_category, trade;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Lookup / reference tables
-- ---------------------------------------------------------------------
CREATE TABLE trade (
  trade_id    INT AUTO_INCREMENT PRIMARY KEY,
  trade_name  VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE problem_category (
  category_id   INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE status (
  status_id   INT AUTO_INCREMENT PRIMARY KEY,
  status_name VARCHAR(20) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- People
-- (named app_user because USER is a reserved word in MySQL)
-- trade_id is populated only for technicians; NULL for everyone else.
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
  user_id    INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  user_type  ENUM('staff','student') NOT NULL,
  role       ENUM('requester','coordinator','technician','executive')
               NOT NULL DEFAULT 'requester',
  trade_id   INT NULL,
  phone      VARCHAR(20) NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_user_trade FOREIGN KEY (trade_id)
    REFERENCES trade(trade_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Asset register (Phase 2)
-- ---------------------------------------------------------------------
CREATE TABLE asset (
  asset_id      INT AUTO_INCREMENT PRIMARY KEY,
  asset_name    VARCHAR(100) NOT NULL,
  asset_type    ENUM('AC','electrical','plumbing','housekeeping','other')
                  NOT NULL DEFAULT 'other',
  location      VARCHAR(100) NULL,
  status        ENUM('operational','faulty','decommissioned')
                  NOT NULL DEFAULT 'operational',
  date_acquired DATE NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Complaint (core entity)
-- reference_code holds the human-facing ID (e.g. FM-2026-0001);
-- complaint_id is the internal surrogate key.
-- ---------------------------------------------------------------------
CREATE TABLE complaint (
  complaint_id   INT AUTO_INCREMENT PRIMARY KEY,
  reference_code VARCHAR(20) NOT NULL UNIQUE,
  date_submitted DATE NOT NULL,
  description    TEXT NOT NULL,
  category_id    INT NOT NULL,
  submitted_by   INT NOT NULL,
  assigned_to    INT NULL,
  asset_id       INT NULL,
  location       VARCHAR(100) NULL,
  priority       ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  current_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  CONSTRAINT fk_comp_category  FOREIGN KEY (category_id)  REFERENCES problem_category(category_id),
  CONSTRAINT fk_comp_submitter FOREIGN KEY (submitted_by) REFERENCES app_user(user_id),
  CONSTRAINT fk_comp_assignee  FOREIGN KEY (assigned_to)  REFERENCES app_user(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_comp_asset     FOREIGN KEY (asset_id)     REFERENCES asset(asset_id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_comp_status    ON complaint(current_status);
CREATE INDEX idx_comp_category  ON complaint(category_id);
CREATE INDEX idx_comp_assignee  ON complaint(assigned_to);
CREATE INDEX idx_comp_submitter ON complaint(submitted_by);

-- ---------------------------------------------------------------------
-- Complaint status history (audit trail)
-- One row per status change: satisfies "show what is pending / ongoing /
-- outstanding AND the reasons why", retained for long-term retrieval.
-- ---------------------------------------------------------------------
CREATE TABLE complaint_status_history (
  history_id   INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  status_id    INT NOT NULL,
  changed_by   INT NOT NULL,
  changed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason       VARCHAR(255) NULL,
  CONSTRAINT fk_hist_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE,
  CONSTRAINT fk_hist_status    FOREIGN KEY (status_id)    REFERENCES status(status_id),
  CONSTRAINT fk_hist_user      FOREIGN KEY (changed_by)   REFERENCES app_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_hist_complaint ON complaint_status_history(complaint_id);

-- ---------------------------------------------------------------------
-- Work history (Phase 2)
-- The retrievable "history of works carried out on an asset".
-- ---------------------------------------------------------------------
CREATE TABLE work_history (
  record_id        INT AUTO_INCREMENT PRIMARY KEY,
  asset_id         INT NOT NULL,
  complaint_id     INT NULL,
  work_description TEXT NOT NULL,
  performed_by     INT NULL,
  date_performed   DATE NOT NULL,
  outcome          VARCHAR(255) NULL,
  CONSTRAINT fk_work_asset     FOREIGN KEY (asset_id)     REFERENCES asset(asset_id)     ON DELETE CASCADE,
  CONSTRAINT fk_work_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE SET NULL,
  CONSTRAINT fk_work_user      FOREIGN KEY (performed_by) REFERENCES app_user(user_id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_work_asset ON work_history(asset_id);

-- =====================================================================
-- Seed data for lookup tables
-- =====================================================================
INSERT INTO trade (trade_name) VALUES
  ('Plumber'), ('Carpenter'), ('Painter'), ('Mason'),
  ('Electrician'), ('HVAC Technician'), ('Housekeeper');

INSERT INTO problem_category (category_name) VALUES
  ('Electrical'), ('Plumbing'), ('Air-conditioning'), ('Carpentry'),
  ('Painting'), ('Masonry'), ('Housekeeping'), ('Other');

INSERT INTO status (status_name) VALUES
  ('Pending'), ('Ongoing'), ('Completed'), ('Outstanding');

-- =====================================================================
-- Example queries (demonstrating the design against the requirements)
-- =====================================================================

-- 1) Dashboard: complaint counts by status
-- SELECT current_status, COUNT(*) AS total
-- FROM complaint
-- GROUP BY current_status;

-- 2) All outstanding complaints with the latest reason recorded
-- SELECT c.reference_code, c.description, c.location,
--        h.reason AS latest_reason, h.changed_at
-- FROM complaint c
-- JOIN complaint_status_history h ON h.complaint_id = c.complaint_id
-- WHERE c.current_status = 'Outstanding'
--   AND h.changed_at = (
--       SELECT MAX(h2.changed_at)
--       FROM complaint_status_history h2
--       WHERE h2.complaint_id = c.complaint_id);

-- 3) Full history of works carried out on a given asset (Phase 2)
-- SELECT a.asset_name, w.date_performed, w.work_description,
--        u.full_name AS performed_by, w.outcome
-- FROM work_history w
-- JOIN asset a    ON a.asset_id = w.asset_id
-- LEFT JOIN app_user u ON u.user_id = w.performed_by
-- WHERE a.asset_id = 1
-- ORDER BY w.date_performed;
