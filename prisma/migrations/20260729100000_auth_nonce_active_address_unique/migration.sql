-- CreateIndex
CREATE INDEX "AuthNonce_address_idx" ON "AuthNonce"("address");

-- Enforce at most one unused (active) nonce per wallet address.
CREATE UNIQUE INDEX "AuthNonce_address_active_key" ON "AuthNonce"("address") WHERE "usedAt" IS NULL;
