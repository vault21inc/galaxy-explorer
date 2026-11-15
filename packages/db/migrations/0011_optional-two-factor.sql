-- Two-factor codes are optional per account (D-47): no secret means they are off, and the
-- account signs in with its password alone. After a rollback to a release from before this,
-- accounts with codes work as before; one without codes can't sign in until it's moved again.
ALTER TABLE "users" ALTER COLUMN "totp_secret_enc" DROP NOT NULL;
