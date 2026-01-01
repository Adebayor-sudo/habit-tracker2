# Transaction Edit, Deletion, and Audit Integrity System

**Status:** ✅ **FULLY IMPLEMENTED AND TESTED** (21/21 tests passing)

## Overview

Complete transaction mutability system allowing users to edit and delete transactions while maintaining perfect balance integrity and audit trail preservation.

## Core Principles

1. **Users are allowed to correct mistakes**
2. **The system is not allowed to forget**
3. **Balances must always be mathematically consistent**
4. **Audit trails must always be preserved**

---

## Architecture

### Database Schema (v3.4+)

#### Extended `transactions` table:
- `deleted_at DATETIME` - Soft delete timestamp (NULL = active, NOT NULL = deleted)
- `deleted_reason TEXT` - User-provided deletion reason for audit trail

#### New `transaction_history` table:
Records every mutation (create/edit/delete/restore):
- `transaction_id` - Links to transactions.id
- `user_id` - Who made the change
- `account_id`, `to_account_id` - Account references (for transfers)
- `date`, `type`, `category`, `amount`, `currency` - Full transaction snapshot
- `converted_amount`, `exchange_rate` - Multi-currency tracking
- `description` - Transaction description
- `action` - Mutation type: 'create', 'edit', 'delete', 'restore'
- `changed_at` - Timestamp of mutation

### Balance Recalculation System

Three core helper functions in `server.js`:

#### 1. `reverseTransactionEffect(transaction, userId)`
Reverses the balance effects of a transaction:
- **Income**: Debit the account (undo credit)
- **Expense**: Credit the account (undo debit)
- **Transfer**: Credit source, debit destination (undo both sides)
- **Conversion**: Same as transfer with multi-currency amounts

#### 2. `applyTransactionEffect(transaction, userId)`
Applies the balance effects of a transaction:
- **Income**: Credit the account
- **Expense**: Debit the account
- **Transfer**: Debit source, credit destination
- **Conversion**: Same as transfer with exchange rate calculation

#### 3. `recordTransactionHistory(transaction, action, userId)`
Inserts an immutable audit trail record capturing:
- Full transaction state snapshot
- Action type (create/edit/delete/restore)
- Timestamp of mutation

---

## API Endpoints

### Edit Transaction: `PUT /api/transactions/:id`

**Flow:**
1. Retrieve existing transaction from database
2. Start database transaction (`BEGIN`)
3. **Reverse** old balance effect using `reverseTransactionEffect()`
4. **Validate** new transaction won't cause negative balance
5. **Update** transaction record in database
6. **Apply** new balance effect using `applyTransactionEffect()`
7. **Record** mutation in `transaction_history` with action='edit'
8. Commit or rollback on error

**Validation:**
- Checks sufficient balance for debit transactions (expense/transfer)
- Returns error with shortfall details if insufficient funds
- Atomic operation - all or nothing

**Example Request:**
```json
PUT /api/transactions/123
{
  "date": "2026-01-01",
  "type": "expense",
  "category": "Groceries",
  "amount": 150,
  "description": "Edited amount",
  "account_id": 5,
  "currency": "USD"
}
```

**Example Error (Insufficient Funds):**
```json
{
  "error": "Insufficient funds",
  "availableBalance": 200.00,
  "attemptedAmount": 350.00,
  "shortfall": 150.00
}
```

---

### Delete Transaction: `DELETE /api/transactions/:id`

**Flow:**
1. Retrieve transaction to delete
2. Start database transaction (`BEGIN`)
3. **Reverse** balance effect (undoes the transaction)
4. **Mark** as deleted (SET deleted_at = NOW(), deleted_reason = 'User deleted')
5. **Record** mutation in history with action='delete'
6. Commit or rollback on error

**Behavior:**
- **Soft delete** - transaction still exists in database
- Excluded from `GET /api/transactions` by default
- Appears in `GET /api/transactions/trash`
- Balance immediately restored when deleted

**Example Request:**
```json
DELETE /api/transactions/123
{
  "reason": "Duplicate entry"
}
```

---

### Restore Transaction: `POST /api/transactions/:id/restore`

**Flow:**
1. Retrieve deleted transaction
2. Start database transaction (`BEGIN`)
3. **Validate** current balance can support restoration
4. **Apply** balance effect (re-applies the transaction)
5. **Clear** deleted flags (SET deleted_at = NULL, deleted_reason = NULL)
6. **Record** mutation in history with action='restore'
7. Commit or rollback on error

**Validation:**
- Checks current account balance before restoration
- Fails if insufficient funds (balance may have changed since deletion)
- Returns error with shortfall details if cannot restore

**Example Request:**
```json
POST /api/transactions/123/restore
```

**Example Error (Cannot Restore):**
```json
{
  "error": "Cannot restore: Insufficient funds",
  "availableBalance": 50.00,
  "attemptedAmount": 200.00,
  "shortfall": 150.00
}
```

---

### View Trash: `GET /api/transactions/trash`

Returns all deleted transactions (where `deleted_at IS NOT NULL`).

**Behavior:**
- Shows deleted transactions with full details
- Includes `deleted_at` timestamp and `deleted_reason`
- Enriched with account names for display
- Supports pagination with `limit` and `offset` query params

**Example Response:**
```json
{
  "transactions": [
    {
      "id": 123,
      "date": "2026-01-01",
      "type": "expense",
      "category": "Groceries",
      "amount": 150,
      "description": "Deleted expense",
      "account_name": "Checking",
      "account_bank": "Test Bank",
      "deleted_at": "2026-01-01T18:30:00.000Z",
      "deleted_reason": "User deleted"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

### Audit Trail Report: `GET /api/reports/audit-trail`

Provides transparency into user corrections and deletions.

**Query Parameters:**
- `start_date` (optional) - Filter deleted transactions by deletion date
- `end_date` (optional) - Filter deleted transactions by deletion date

**Response:**
```json
{
  "deletedCount": 12,
  "deletionReasons": [
    { "deleted_reason": "User deleted", "count": 8 },
    { "deleted_reason": "Duplicate entry", "count": 3 },
    { "deleted_reason": "Wrong amount", "count": 1 }
  ],
  "editCount": 47,
  "mostEdited": [
    {
      "transaction_id": 456,
      "edit_count": 5,
      "description": "Recurring subscription",
      "category": "Subscriptions"
    }
  ],
  "period": {
    "start": "all",
    "end": "now"
  }
}
```

**Insights Provided:**
- Total deleted transaction count
- Breakdown of deletion reasons (helps identify patterns)
- Total edit count (frequency of corrections)
- Most-edited transactions (may indicate data entry issues)

---

## Frontend Implementation

### Transaction Table View

Each transaction row includes:
- **Edit button** - Opens edit modal pre-filled with transaction data
- **Delete button** - Shows confirmation dialog before deletion

**Edit Modal:**
- Pre-fills all transaction fields
- Shows available balance for debit transactions
- Displays post-transaction balance preview
- Shows currency conversion info if applicable
- Form validation before submission
- Error handling with user-friendly messages

**Delete Confirmation:**
- Explains transaction will move to trash
- Can be restored later from Trash view
- Balance will be immediately adjusted

### Trash View

Accessible via Finance section view toggle: `accounts | table | calendar | chart | trash`

**Features:**
- Lists all deleted transactions
- Shows deletion timestamp and reason
- Each item has **Restore** button
- Grayed-out styling to indicate deleted state
- Cannot edit deleted transactions (only restore)

**Restore Behavior:**
- Click Restore button
- API validates current balance
- If successful: transaction moves back to main list, balance updated
- If failed: shows error with shortfall details

---

## Transfer Atomicity

When editing or deleting transfers:

1. **Both sides are always handled together** via `account_id` and `to_account_id`
2. **Source account** effect is always reversed/applied first
3. **Destination account** effect follows immediately after
4. **Database transaction** ensures both succeed or both fail
5. **Audit trail** records the complete transfer state

**Example: Edit Transfer**
```
Original: $100 from Account A to Account B
Edit to:  $150 from Account A to Account B

Steps:
1. Credit Account A +$100 (reverse original)
2. Debit Account B -$100 (reverse original)
3. Validate Account A has $150 available
4. Debit Account A -$150 (apply new)
5. Credit Account B +$150 (apply new)
6. Update transaction record
7. Record in history
8. Commit

Net result:
- Account A: -$50 compared to before edit
- Account B: +$50 compared to before edit
- Total unchanged (transfer is internal)
```

---

## Multi-Currency Support

The system handles currency conversions during editing:

1. **Edit with different currency:**
   - Fetches current exchange rate from API
   - Converts amount to user's default currency
   - Stores both original and converted amounts
   - Records exchange rate for audit trail

2. **Conversion transactions:**
   - Special transaction type for bureau de change operations
   - Source account debited in original currency
   - Destination account credited in target currency
   - Exchange rate stored explicitly
   - Both amounts tracked separately

3. **Preview during edit:**
   - Frontend displays conversion preview as user types
   - Debounced API call (500ms) to fetch exchange rate
   - Shows: `150 USD ≈ $165.00 (NGN) @ 1.1000`

---

## Test Coverage

Comprehensive test suite in `/opt/habit-tracker/tests/transaction-mutations.test.js`:

### ✅ 21 Tests Passing (100%)

1. **Edit Expense Transaction**
   - Create expense, verify balance reduction
   - Edit amount, verify balance recalculated correctly

2. **Edit Validation (Insufficient Balance)**
   - Try to edit expense to exceed available balance
   - Verify edit rejected with error
   - Verify balance unchanged after failed edit

3. **Delete and Restore Transaction**
   - Create expense, verify in transaction list
   - Delete expense, verify balance restored
   - Verify not in regular list, but in trash
   - Restore transaction, verify balance reduced again
   - Verify back in regular list

4. **Restore Validation (Insufficient Balance)**
   - Delete transaction, spend most of balance
   - Try to restore original transaction
   - Verify restore rejected (insufficient funds)
   - Verify transaction still in trash

5. **Transfer Edit Atomicity**
   - Create transfer between two accounts
   - Edit transfer amount
   - Verify both source and destination updated correctly
   - Net total remains unchanged

6. **Audit Trail Recording**
   - Create, edit, delete, restore transaction
   - Verify audit trail captured all mutations
   - Check deletion count and edit frequency

**Test Results:**
```
✅ Tests Passed: 21
❌ Tests Failed: 0
📊 Total: 21

🎉 All tests passed! Transaction mutation system is working correctly.
```

---

## Balance Integrity Guarantees

The system maintains these invariants:

1. **No negative balances**: All edits and restores validated before application
2. **Atomic operations**: Database transactions ensure all-or-nothing updates
3. **Deterministic recalculation**: Balance = Initial + Sum(all active transactions)
4. **Transfer conservation**: Money moved between accounts, net total unchanged
5. **Audit completeness**: Every mutation recorded in immutable history

**Mathematical Proof:**

For any account with initial balance `B₀`:

```
Current Balance = B₀ + Σ(income) - Σ(expense) - Σ(transfer_out) + Σ(transfer_in)

Where:
- Σ(income)       = Sum of all active income transactions
- Σ(expense)      = Sum of all active expense transactions  
- Σ(transfer_out) = Sum of all active outgoing transfers
- Σ(transfer_in)  = Sum of all active incoming transfers
- "active"        = deleted_at IS NULL
```

When editing transaction from amount `A₁` to `A₂`:
1. Reverse: Balance += A₁ (undo original effect)
2. Apply:   Balance -= A₂ (apply new effect)
3. Net change: Balance += (A₁ - A₂)

Result: Balance remains mathematically consistent with active transactions.

---

## Security Considerations

1. **Authentication Required**: All mutation endpoints require valid JWT token
2. **User Isolation**: Users can only edit/delete their own transactions
3. **Account Ownership**: Validates user owns both source and destination accounts (transfers)
4. **Immutable History**: transaction_history table records cannot be edited or deleted
5. **Soft Deletes**: Original data preserved even after deletion
6. **Audit Trail**: Complete mutation history for forensic analysis

---

## Performance Characteristics

- **Edit Operation**: O(1) - Single transaction with 3-4 database updates
- **Delete Operation**: O(1) - Single UPDATE with balance recalculation
- **Restore Operation**: O(1) - Single UPDATE with validation
- **Trash Query**: O(n) - Filtered query on deleted_at index
- **Audit Trail**: O(n) - Aggregation queries on transaction_history

**Optimization:**
- Database indexes on `deleted_at` for fast trash queries
- Atomic BEGIN/COMMIT/ROLLBACK for consistency
- No N+1 queries - all operations use single prepared statements

---

## User Experience Flow

### Editing a Transaction

1. User navigates to Finance → Transactions
2. Clicks "Edit" button on transaction row
3. Modal opens with pre-filled form:
   - Date picker with current date
   - Account selector showing current account
   - Category dropdown with current category
   - Amount input with current amount (supports comma/period separators)
   - Description text field
   - Currency selector (shows conversion preview if different from default)
4. User modifies fields
5. Available balance shown (for debit transactions)
6. Post-transaction balance preview displayed
7. User clicks "Save Changes"
8. **Success**: Modal closes, transaction list refreshes, account balance updates
9. **Error**: Inline error message shown (e.g., "Insufficient funds. Shortfall: $150.00")

### Deleting a Transaction

1. User clicks "Delete" button on transaction
2. Confirmation dialog appears:
   - "This will move the transaction to trash and reverse its balance effects."
   - "You can restore it later from the Trash view."
3. User confirms deletion
4. Transaction removed from list
5. Account balance immediately updated
6. Toast notification: "Transaction moved to trash"

### Restoring from Trash

1. User switches to Trash view (Finance → trash tab)
2. Sees list of deleted transactions with timestamps
3. Clicks "Restore" button on transaction
4. **Success**: Transaction moves back to main list, balance updated
5. **Error**: Alert shown: "Cannot restore: Insufficient funds (shortfall $X.XX)"

---

## Future Enhancements

### Potential Improvements

1. **Bulk Operations**
   - Select multiple transactions for bulk delete/restore
   - Batch edit for recurring transactions

2. **Advanced Audit Views**
   - Timeline view of transaction edits
   - Diff view showing before/after changes
   - User activity heatmap

3. **Undo/Redo**
   - Quick undo recent edit (within 5 minutes)
   - Transaction version history browser

4. **Smart Restoration**
   - Suggest alternate accounts if primary lacks balance
   - Option to split restoration across multiple accounts

5. **Export Capabilities**
   - Export transaction history as CSV
   - Export audit trail for accounting purposes

6. **Trash Management**
   - Permanent delete from trash (hard delete)
   - Auto-purge trash older than 90 days
   - Trash size statistics

---

## Troubleshooting

### Common Issues

**Issue:** Edit button not working
- **Check:** Server restarted after code changes?
- **Fix:** `pkill -f "node server.js" && cd /opt/habit-tracker && nohup node server.js &`

**Issue:** Balance not updating after edit
- **Check:** Browser console for API errors
- **Check:** Server logs: `tail -f /tmp/tracker.log`
- **Verify:** Database transaction committed: `sqlite3 data/tracker.db "SELECT * FROM transactions WHERE id = X"`

**Issue:** Cannot restore transaction
- **Cause:** Insufficient balance in current account state
- **Solution:** Free up balance or wait until account has sufficient funds
- **Check:** Compare current balance vs transaction amount

**Issue:** Audit trail not recording
- **Check:** transaction_history table exists: `sqlite3 data/tracker.db ".schema transaction_history"`
- **Check:** Server logs for SQL errors
- **Verify:** `SELECT COUNT(*) FROM transaction_history WHERE user_id = X`

---

## Database Queries for Debugging

```sql
-- Check deleted transactions
SELECT id, date, amount, category, deleted_at, deleted_reason 
FROM transactions 
WHERE user_id = ? AND deleted_at IS NOT NULL;

-- Check transaction history for specific transaction
SELECT action, amount, description, changed_at 
FROM transaction_history 
WHERE transaction_id = ? 
ORDER BY changed_at DESC;

-- Verify balance consistency
SELECT 
  a.id,
  a.name,
  a.balance as current_balance,
  (
    COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'income' AND deleted_at IS NULL), 0) -
    COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'expense' AND deleted_at IS NULL), 0) -
    COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND (type = 'transfer' OR type = 'conversion') AND deleted_at IS NULL), 0) +
    COALESCE((SELECT SUM(amount) FROM transactions WHERE to_account_id = a.id AND (type = 'transfer' OR type = 'conversion') AND deleted_at IS NULL), 0)
  ) as calculated_balance
FROM accounts a
WHERE user_id = ?;

-- Count mutations by action type
SELECT action, COUNT(*) as count 
FROM transaction_history 
WHERE user_id = ? 
GROUP BY action;
```

---

## Conclusion

This transaction mutation system achieves the core requirements:

✅ **User Empowerment**: Full control to correct mistakes through editing
✅ **Balance Integrity**: Mathematical consistency guaranteed at all times
✅ **Audit Preservation**: Complete immutable history of all changes
✅ **Transparency**: Reporting on corrections and deletions for insights
✅ **Atomicity**: Transfers edited/deleted as single units
✅ **Validation**: Negative balance prevention enforced during all mutations

**System Status:** Production-ready with comprehensive test coverage (21/21 tests passing).

**Deployment:** Live on Tracker v3.0 at http://localhost:3000 (Tailscale-only access).
