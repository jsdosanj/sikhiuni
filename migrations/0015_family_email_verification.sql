-- Legacy email ownership is not inferred. Code registration/reset proves it.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
