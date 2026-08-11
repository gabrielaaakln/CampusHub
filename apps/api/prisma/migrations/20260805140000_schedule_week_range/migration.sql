-- part of the semester the real workbook writes as s>7 or s<8
-- null on both sides means the whole term which is the common case

ALTER TABLE schedule_entries
    ADD COLUMN starts_week SMALLINT,
    ADD COLUMN ends_week   SMALLINT;

ALTER TABLE schedule_entries
    ADD CONSTRAINT chk_schedule_week_range CHECK (
            (starts_week IS NULL OR starts_week BETWEEN 1 AND 30)
        AND (ends_week   IS NULL OR ends_week   BETWEEN 1 AND 30)
        AND (starts_week IS NULL OR ends_week IS NULL OR ends_week >= starts_week)
    );
