-- Sign-in with the Synapse account (the identity service shared by every Synapse Engineering app).
-- Only what the header shows is kept: the account id, its username, and the identity session that
-- opened this one, for back-channel logouts. The token itself is stored as its SHA-256.
CREATE TABLE sessions (
  token_hash text        PRIMARY KEY,
  sub        text        NOT NULL,
  username   text        NOT NULL,
  oidc_sid   text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_sub ON sessions (sub);
CREATE INDEX sessions_oidc_sid ON sessions (oidc_sid);
