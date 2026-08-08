-- campushub initial schema
-- hand written because triggers ro_unaccent trigram and partial indexes
-- cannot be expressed in schema prisma

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;

-- search configuration that ignores diacritics
CREATE TEXT SEARCH CONFIGURATION ro_unaccent ( COPY = romanian );
ALTER TEXT SEARCH CONFIGURATION ro_unaccent
    ALTER MAPPING FOR hword, hword_part, word
    WITH unaccent, romanian_stem;

-- generic keeps a tsvector column in sync with other columns
CREATE OR REPLACE FUNCTION tsv_update() RETURNS TRIGGER AS $$
DECLARE
    target TEXT := TG_ARGV[0];
    parts  TEXT := '';
    i      INT;
    val    TEXT;
BEGIN
    FOR i IN 1 .. array_length(TG_ARGV, 1) - 1 LOOP
        EXECUTE format('SELECT ($1).%I::text', TG_ARGV[i]) INTO val USING NEW;
        parts := parts || ' ' || COALESCE(val, '');
    END LOOP;
    NEW := jsonb_populate_record(NEW,
        to_jsonb(NEW) || jsonb_build_object(target, to_tsvector('ro_unaccent', parts)));
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- generic updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ---- faculties groups subjects ----
CREATE TABLE faculties (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    short_name   VARCHAR(50),
    university   VARCHAR(200),
    timezone     VARCHAR(50) NOT NULL DEFAULT 'Europe/Bucharest',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE study_groups (
    id          SERIAL PRIMARY KEY,
    faculty_id  INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,
    name_norm   VARCHAR(50) NOT NULL,
    study_year  SMALLINT NOT NULL,
    subgroups   SMALLINT NOT NULL DEFAULT 2 CHECK (subgroups BETWEEN 1 AND 4),
    UNIQUE (faculty_id, name_norm)
);

CREATE TABLE subjects (
    id          SERIAL PRIMARY KEY,
    faculty_id  INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    name_norm   VARCHAR(200) NOT NULL,
    short_name  VARCHAR(50),
    study_year  SMALLINT,
    UNIQUE (faculty_id, name_norm)
);

-- subject aliases pc maps to programarea calculatoarelor
CREATE TABLE subject_aliases (
    id          SERIAL PRIMARY KEY,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    alias_norm  VARCHAR(200) NOT NULL,
    UNIQUE (subject_id, alias_norm)
);
CREATE INDEX idx_subject_aliases_norm ON subject_aliases (alias_norm);
CREATE INDEX idx_subject_aliases_trgm ON subject_aliases USING gin (alias_norm gin_trgm_ops);
CREATE INDEX idx_subjects_trgm ON subjects USING gin (name_norm gin_trgm_ops);

-- ---- academic calendar ----
CREATE TYPE week_parity AS ENUM ('par','impar','ambele');

CREATE TABLE academic_terms (
    id                 SERIAL PRIMARY KEY,
    faculty_id         INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    academic_year      VARCHAR(9) NOT NULL,
    semester           SMALLINT NOT NULL CHECK (semester IN (1,2)),
    starts_on          DATE NOT NULL,
    ends_on            DATE NOT NULL,
    first_week_parity  week_parity NOT NULL DEFAULT 'impar',
    is_current         BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (faculty_id, academic_year, semester),
    CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX uq_term_current ON academic_terms (faculty_id) WHERE is_current;

CREATE TYPE break_kind AS ENUM ('vacanta','sesiune','practica','zi_libera');

CREATE TABLE academic_breaks (
    id         SERIAL PRIMARY KEY,
    term_id    INTEGER NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
    kind       break_kind NOT NULL DEFAULT 'vacanta',
    label      VARCHAR(100),
    starts_on  DATE NOT NULL,
    ends_on    DATE NOT NULL,
    CHECK (ends_on >= starts_on)
);
CREATE INDEX idx_breaks_term ON academic_breaks (term_id, starts_on);

-- ---- users ----
CREATE TYPE user_role     AS ENUM ('student','moderator','admin');
CREATE TYPE auth_provider AS ENUM ('local','sso','mock');

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    display_name   VARCHAR(80) NOT NULL,
    email          CITEXT UNIQUE NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    password_hash  VARCHAR(255),
    auth_provider  auth_provider NOT NULL DEFAULT 'local',
    faculty_id     INTEGER REFERENCES faculties(id),
    group_id       INTEGER REFERENCES study_groups(id),
    subgroup       SMALLINT CHECK (subgroup BETWEEN 1 AND 4),
    role           user_role NOT NULL DEFAULT 'student',
    avatar_url     VARCHAR(255),
    is_banned      BOOLEAN NOT NULL DEFAULT false,
    anonymized_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (auth_provider <> 'local' OR password_hash IS NOT NULL OR anonymized_at IS NOT NULL)
);
CREATE INDEX idx_users_faculty ON users (faculty_id);
CREATE INDEX idx_users_group   ON users (group_id);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE email_tokens (
    token       VARCHAR(64) PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     VARCHAR(30) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_tokens_user ON email_tokens (user_id);

-- required by connect pg simple
CREATE TABLE user_sessions (
    sid    VARCHAR NOT NULL PRIMARY KEY,
    sess   JSON NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expire ON user_sessions (expire);

-- ---- map ----
CREATE TABLE buildings (
    id           SERIAL PRIMARY KEY,
    faculty_id   INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    code         VARCHAR(10),
    address      VARCHAR(200),
    latitude     DECIMAL(9,6),
    longitude    DECIMAL(9,6),
    entrance_lat DECIMAL(9,6),
    entrance_lng DECIMAL(9,6),
    UNIQUE (faculty_id, name)
);

CREATE TABLE floors (
    id          SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    level       SMALLINT NOT NULL,
    label       VARCHAR(30),
    svg_url     VARCHAR(255),
    width_px    INTEGER,
    height_px   INTEGER,
    UNIQUE (building_id, level)
);

CREATE TYPE room_type AS ENUM ('curs','seminar','laborator','birou','altele');

CREATE TABLE rooms (
    id             SERIAL PRIMARY KEY,
    floor_id       INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    room_number    VARCHAR(20) NOT NULL,
    room_number_norm VARCHAR(20) NOT NULL,
    room_type      room_type NOT NULL DEFAULT 'curs',
    capacity       INTEGER,
    svg_element_id VARCHAR(50),
    directions     VARCHAR(255),
    notes          VARCHAR(255),
    UNIQUE (floor_id, room_number)
);
CREATE INDEX idx_rooms_floor  ON rooms (floor_id);
CREATE INDEX idx_rooms_trgm   ON rooms USING gin (room_number_norm gin_trgm_ops);

CREATE TABLE room_aliases (
    id         SERIAL PRIMARY KEY,
    room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    alias      VARCHAR(120) NOT NULL,
    alias_norm VARCHAR(120) NOT NULL,
    UNIQUE (room_id, alias_norm)
);
CREATE INDEX idx_room_aliases_room ON room_aliases (room_id);
CREATE INDEX idx_room_aliases_trgm ON room_aliases USING gin (alias_norm gin_trgm_ops);

-- ---- schedule ----
CREATE TYPE day_of_week   AS ENUM ('luni','marti','miercuri','joi','vineri','sambata','duminica');
CREATE TYPE class_type    AS ENUM ('curs','seminar','laborator','proiect');
CREATE TYPE schedule_source AS ENUM ('manual','import','scraper');

CREATE TABLE schedule_entries (
    id             SERIAL PRIMARY KEY,
    term_id        INTEGER NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
    group_id       INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    subgroup       SMALLINT NOT NULL DEFAULT 0 CHECK (subgroup BETWEEN 0 AND 4),
    day_of_week    day_of_week NOT NULL,
    start_time     TIME NOT NULL,
    end_time       TIME NOT NULL,
    class_type     class_type NOT NULL DEFAULT 'curs',
    parity         week_parity NOT NULL DEFAULT 'ambele',
    -- attributes can change without creating a new row
    subject_id     INTEGER REFERENCES subjects(id),
    subject_raw    VARCHAR(200) NOT NULL,
    room_id        INTEGER REFERENCES rooms(id),
    room_raw       VARCHAR(50),
    professor      VARCHAR(150),
    -- audit
    source         schedule_source NOT NULL DEFAULT 'manual',
    content_hash   VARCHAR(64) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    CHECK (end_time > start_time)
);

-- the key is the slot not its content
CREATE UNIQUE INDEX uq_schedule_slot ON schedule_entries
    (term_id, group_id, subgroup, day_of_week, start_time, class_type, parity);

CREATE INDEX idx_schedule_group   ON schedule_entries (group_id, day_of_week) WHERE is_active;
CREATE INDEX idx_schedule_room    ON schedule_entries (room_id);
CREATE INDEX idx_schedule_subject ON schedule_entries (subject_id);
CREATE INDEX idx_schedule_term    ON schedule_entries (term_id);

CREATE TYPE scrape_status AS ENUM ('success','partial','failed');

CREATE TABLE scrape_runs (
    id              SERIAL PRIMARY KEY,
    faculty_id      INTEGER REFERENCES faculties(id) ON DELETE SET NULL,
    term_id         INTEGER REFERENCES academic_terms(id) ON DELETE SET NULL,
    source          schedule_source NOT NULL DEFAULT 'scraper',
    adapter         VARCHAR(50),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    status          scrape_status,
    entries_found   INTEGER NOT NULL DEFAULT 0,
    entries_added   INTEGER NOT NULL DEFAULT 0,
    entries_changed INTEGER NOT NULL DEFAULT 0,
    entries_removed INTEGER NOT NULL DEFAULT 0,
    raw_snapshot_path VARCHAR(255),
    error_message   TEXT
);
CREATE INDEX idx_scrape_runs_faculty ON scrape_runs (faculty_id, started_at DESC);

CREATE TYPE schedule_change_kind AS ENUM ('added','changed','removed');

CREATE TABLE schedule_changes (
    id         SERIAL PRIMARY KEY,
    run_id     INTEGER NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
    entry_id   INTEGER REFERENCES schedule_entries(id) ON DELETE SET NULL,
    group_id   INTEGER REFERENCES study_groups(id) ON DELETE CASCADE,
    kind       schedule_change_kind NOT NULL,
    before     JSONB,
    after      JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_schedule_changes_run   ON schedule_changes (run_id);
CREATE INDEX idx_schedule_changes_group ON schedule_changes (group_id, created_at DESC);

-- ---- deadlines ----
CREATE TYPE deadline_type AS ENUM ('tema','examen','proiect','altele');

CREATE TABLE deadlines (
    id         SERIAL PRIMARY KEY,
    faculty_id INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    group_id   INTEGER REFERENCES study_groups(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title      VARCHAR(200) NOT NULL,
    type       deadline_type NOT NULL DEFAULT 'tema',
    due_at     TIMESTAMPTZ NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deadlines_faculty ON deadlines (faculty_id, due_at) WHERE NOT is_deleted;
CREATE INDEX idx_deadlines_group   ON deadlines (group_id, due_at) WHERE NOT is_deleted;
CREATE INDEX idx_deadlines_subject ON deadlines (subject_id);
CREATE INDEX idx_deadlines_author  ON deadlines (created_by);
CREATE TRIGGER trg_deadlines_updated BEFORE UPDATE ON deadlines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- forum ----
CREATE TABLE forum_categories (
    id          SERIAL PRIMARY KEY,
    faculty_id  INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    position    SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (faculty_id, slug)
);

CREATE TABLE forum_posts (
    id             SERIAL PRIMARY KEY,
    category_id    INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
    author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subject_id     INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    title          VARCHAR(200) NOT NULL,
    content        TEXT,
    score          INTEGER NOT NULL DEFAULT 0,
    comment_count  INTEGER NOT NULL DEFAULT 0,
    is_deleted     BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector  tsvector
);
CREATE INDEX idx_posts_cat_new    ON forum_posts (category_id, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_posts_cat_top    ON forum_posts (category_id, score DESC, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_posts_author     ON forum_posts (author_id);
CREATE INDEX idx_posts_subject    ON forum_posts (subject_id);
CREATE INDEX idx_posts_search     ON forum_posts USING gin (search_vector);
CREATE TRIGGER trg_posts_tsv BEFORE INSERT OR UPDATE OF title, content ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION tsv_update('search_vector','title','content');
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON forum_posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE forum_comments (
    id                SERIAL PRIMARY KEY,
    post_id           INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES forum_comments(id) ON DELETE CASCADE,
    author_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content           TEXT NOT NULL,
    depth             SMALLINT NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 5),
    score             INTEGER NOT NULL DEFAULT 0,
    is_deleted        BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comments_post   ON forum_comments (post_id, created_at);
CREATE INDEX idx_comments_parent ON forum_comments (parent_comment_id);
CREATE INDEX idx_comments_author ON forum_comments (author_id);

CREATE TABLE post_votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    value   SMALLINT NOT NULL CHECK (value IN (-1,1)),
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX idx_post_votes_post ON post_votes (post_id);

CREATE TABLE comment_votes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
    value      SMALLINT NOT NULL CHECK (value IN (-1,1)),
    PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX idx_comment_votes_comment ON comment_votes (comment_id);

CREATE OR REPLACE FUNCTION refresh_post_score() RETURNS TRIGGER AS $$
DECLARE pid INTEGER := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
    UPDATE forum_posts SET score =
        (SELECT COALESCE(SUM(value),0) FROM post_votes WHERE post_id = pid)
    WHERE id = pid;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_score AFTER INSERT OR UPDATE OR DELETE ON post_votes
    FOR EACH ROW EXECUTE FUNCTION refresh_post_score();

CREATE OR REPLACE FUNCTION refresh_comment_score() RETURNS TRIGGER AS $$
DECLARE cid INTEGER := COALESCE(NEW.comment_id, OLD.comment_id);
BEGIN
    UPDATE forum_comments SET score =
        (SELECT COALESCE(SUM(value),0) FROM comment_votes WHERE comment_id = cid)
    WHERE id = cid;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_score AFTER INSERT OR UPDATE OR DELETE ON comment_votes
    FOR EACH ROW EXECUTE FUNCTION refresh_comment_score();

CREATE OR REPLACE FUNCTION refresh_comment_count() RETURNS TRIGGER AS $$
DECLARE pid INTEGER := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
    UPDATE forum_posts SET comment_count =
        (SELECT COUNT(*) FROM forum_comments WHERE post_id = pid AND NOT is_deleted)
    WHERE id = pid;
    RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_count AFTER INSERT OR UPDATE OF is_deleted OR DELETE ON forum_comments
    FOR EACH ROW EXECUTE FUNCTION refresh_comment_count();

-- ---- marketplace ----
CREATE TYPE listing_kind   AS ENUM ('produs','serviciu');
CREATE TYPE listing_status AS ENUM ('activ','rezervat','inchis');

CREATE TABLE listings (
    id            SERIAL PRIMARY KEY,
    faculty_id    INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    author_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          listing_kind NOT NULL,
    subject_id    INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    price         DECIMAL(10,2) CHECK (price IS NULL OR price >= 0),
    currency      CHAR(3) NOT NULL DEFAULT 'RON',
    price_unit    VARCHAR(20),
    status        listing_status NOT NULL DEFAULT 'activ',
    is_deleted    BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector tsvector
);
CREATE INDEX idx_listings_browse  ON listings (faculty_id, status, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_listings_author  ON listings (author_id);
CREATE INDEX idx_listings_subject ON listings (subject_id);
CREATE INDEX idx_listings_search  ON listings USING gin (search_vector);
CREATE TRIGGER trg_listings_tsv BEFORE INSERT OR UPDATE OF title, description ON listings
    FOR EACH ROW EXECUTE FUNCTION tsv_update('search_vector','title','description');
CREATE TRIGGER trg_listings_updated BEFORE UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE listing_images (
    id         SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    path       VARCHAR(255) NOT NULL,
    width      INTEGER,
    height     INTEGER,
    position   SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_listing_images_listing ON listing_images (listing_id, position);

CREATE TYPE request_status AS ENUM ('pending','accepted','declined','completed');

CREATE TABLE listing_requests (
    id           SERIAL PRIMARY KEY,
    listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message      TEXT,
    status       request_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (listing_id, requester_id)
);
CREATE INDEX idx_requests_requester ON listing_requests (requester_id, created_at DESC);
CREATE TRIGGER trg_requests_updated BEFORE UPDATE ON listing_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- events ----
CREATE TABLE events (
    id           SERIAL PRIMARY KEY,
    faculty_id   INTEGER NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    location     VARCHAR(200),
    room_id      INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    starts_at    TIMESTAMPTZ NOT NULL,
    ends_at      TIMESTAMPTZ,
    external_url VARCHAR(255),
    cover_path   VARCHAR(255),
    is_deleted   BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX idx_events_upcoming ON events (faculty_id, starts_at) WHERE NOT is_deleted;
CREATE INDEX idx_events_room     ON events (room_id);
CREATE INDEX idx_events_author   ON events (created_by);

CREATE TABLE event_attendees (
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_attendees_user ON event_attendees (user_id);

-- ---- student rights ----
CREATE TABLE rights_articles (
    id            SERIAL PRIMARY KEY,
    faculty_id    INTEGER REFERENCES faculties(id) ON DELETE CASCADE,
    category      VARCHAR(80) NOT NULL,
    title         VARCHAR(200) NOT NULL,
    summary       TEXT NOT NULL,
    official_url  VARCHAR(255),
    position      SMALLINT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector tsvector
);
CREATE INDEX idx_rights_faculty ON rights_articles (faculty_id, category);
CREATE INDEX idx_rights_search  ON rights_articles USING gin (search_vector);
CREATE TRIGGER trg_rights_tsv BEFORE INSERT OR UPDATE OF title, summary ON rights_articles
    FOR EACH ROW EXECUTE FUNCTION tsv_update('search_vector','title','summary','category');

-- ---- moderation and notifications ----
CREATE TYPE report_target AS ENUM ('post','comment','listing','user');
CREATE TYPE report_status AS ENUM ('open','resolved','dismissed');

CREATE TABLE reports (
    id          SERIAL PRIMARY KEY,
    reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_type report_target NOT NULL,
    target_id   INTEGER NOT NULL,
    reason      VARCHAR(255),
    status      report_status NOT NULL DEFAULT 'open',
    handled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    handled_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX idx_reports_open    ON reports (created_at DESC) WHERE status = 'open';
CREATE INDEX idx_reports_handler ON reports (handled_by);

CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,
    title      VARCHAR(200) NOT NULL,
    body       TEXT,
    link       VARCHAR(255),
    is_read    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_unread ON notifications (user_id, created_at DESC) WHERE NOT is_read;
CREATE INDEX idx_notif_all    ON notifications (user_id, created_at DESC);
CREATE INDEX idx_scrape_runs_term       ON scrape_runs (term_id);
CREATE INDEX idx_schedule_changes_entry ON schedule_changes (entry_id);
