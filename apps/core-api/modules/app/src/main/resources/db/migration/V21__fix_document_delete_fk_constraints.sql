-- Deleting a document was failing with a foreign key violation whenever
-- any notification, QuickBooks transaction, or Square transaction still
-- referenced it — none of these three FKs had an ON DELETE behavior, so
-- Postgres defaulted to RESTRICT. DocumentService.delete() only ever
-- cleaned up extracted_data (which cascades to bank_transactions), never
-- these three, so any document that had triggered a notification (i.e.
-- virtually any reviewed document) could never be deleted at all.

-- A notification about a document that no longer exists isn't meaningful
-- on its own — delete it along with the document.
ALTER TABLE notifications DROP CONSTRAINT notifications_document_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

-- These are real reconciled financial transaction records, not just
-- metadata about the document — SET NULL (unlink) rather than CASCADE,
-- so deleting a receipt/statement never silently destroys transaction
-- history that has value independent of which document was attached.
ALTER TABLE quickbooks_transactions DROP CONSTRAINT quickbooks_transactions_document_id_fkey;
ALTER TABLE quickbooks_transactions ADD CONSTRAINT quickbooks_transactions_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE square_transactions DROP CONSTRAINT square_transactions_document_id_fkey;
ALTER TABLE square_transactions ADD CONSTRAINT square_transactions_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
