-- Migration: Add bank field to accounts and to_account_id to transactions
-- Version: 1
-- Date: 2026-01-01

-- Add bank field to accounts table
ALTER TABLE accounts ADD COLUMN bank TEXT DEFAULT '';

-- Add to_account_id for transfers
ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id);
