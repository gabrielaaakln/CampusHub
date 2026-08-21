-- entra object id of the account that signed in
-- stable across email and name changes so it is the identity we key on
-- null for every account that only ever used a password postgres allows many nulls under unique

ALTER TABLE users
    ADD COLUMN sso_subject VARCHAR(64);

CREATE UNIQUE INDEX users_sso_subject_key ON users (sso_subject);
