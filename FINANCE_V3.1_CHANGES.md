# Finance System v3.1 - Account-Centric Architecture

## Overview

Reimagined finance system to support multi-bank account tracking with internal transfers. The system is now organized around **real bank accounts** rather than abstract categories, accurately reflecting how money moves between accounts.

## Key Features

### 1. Multi-Bank Account Tracking
- Support for multiple banks (e.g., Sterling, Kuda, Zenith)
- Each bank can have multiple accounts (e.g., Salary Account, Current Account)
- Accounts store their current balance
- Total net worth = sum of all account balances

### 2. Internal Transfers
- Transfer money between accounts without affecting total net worth
- Example: Moving ₦3,000 from Kuda (₦5,000) to Zenith (₦1,000) results in:
  - Kuda: ₦2,000
  - Zenith: ₦4,000
  - Net: Still ₦6,000 (unchanged)

### 3. View Modes
- **Accounts**: Overview of all accounts grouped by bank with balances
- **Transactions**: Detailed table view with income/expense/transfer history
- **Calendar**: (Coming soon) Activity visualization by day
- **Chart**: (Coming soon) Distribution across accounts and categories

## Database Changes

### Schema Updates (v3.0 → v3.1)

```sql
-- Added to accounts table
ALTER TABLE accounts ADD COLUMN bank TEXT DEFAULT "";

-- Added to transactions table
ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id);
```

### Migration Strategy
- Used `ALTER TABLE` with `DEFAULT ""` for existing data
- Bank field now required for new accounts (enforced in API)
- Backward compatible - existing accounts get empty string for bank

## API Changes

### Accounts API

**GET /api/accounts**
- Returns: `{ accounts: [...], grouped: { 'Sterling': [...], 'Kuda': [...] } }`
- Groups accounts by bank for easy display

**POST /api/accounts** (Updated)
- Required fields: `name`, `bank`, `type`, `currency`, `balance`
- Validates that `bank` is provided (400 error if missing)

**PUT /api/accounts/:id** (Updated)
- Now accepts `bank` field for updates

### Transactions API

**GET /api/transactions** (Enhanced)
- Now returns enriched data with account information:
  - `account_name`, `account_bank` (source account)
  - `to_account_name`, `to_account_bank` (destination account for transfers)
- Supports filtering by `account_id` query parameter

**POST /api/transactions** (Rewritten)
- Now uses atomic database transactions (BEGIN/COMMIT/ROLLBACK)
- Handles three transaction types:
  - **Income**: Adds to `account_id` balance
  - **Expense**: Subtracts from `account_id` balance
  - **Transfer**: Atomically moves money between `account_id` and `to_account_id`
- Automatic rollback on errors

## Frontend Changes

### State Management
```javascript
// Added accounts state with grouped structure
const [accounts, setAccounts] = useState({ accounts: [], grouped: {} });
```

### Finance Section Redesign

**New Components:**
1. **Total Net Amount Card**: Shows sum of all account balances
2. **Quick Actions**: Add Account, Transfer, Transaction buttons
3. **Account Modals**: Forms for creating accounts and transferring funds
4. **Transaction Modal**: Enhanced with account selector
5. **Accounts by Bank**: Expandable cards showing accounts grouped by bank

**View Modes:**
- Accounts: Full overview with net worth and bank-grouped accounts
- Transactions: Table view with enhanced transaction details
- Calendar: Placeholder for future implementation
- Chart: Placeholder for future pie chart visualization

### Transfer UI
```javascript
// Transfer between accounts
{
  from_account_id: number,
  to_account_id: number,
  amount: number,
  description: string
}
```

### Transaction UI
- Account selector dropdown (required)
- Shows bank and account name in options
- Supports income/expense types
- Transfer option available via Transfer button

## User Experience

### Example: Sterling Bank User
1. User creates two accounts:
   - Sterling - Salary Account (₦150,000)
   - Sterling - Current Account (₦75,000)
2. Both appear under "Sterling" group with subtotal: ₦225,000
3. User transfers ₦50,000 from Salary to Current
4. Updated balances:
   - Salary: ₦100,000
   - Current: ₦125,000
   - Total Net: ₦225,000 (unchanged)

### Transaction Display
- **Income**: Green arrow up ↑ with + prefix
- **Expense**: Red arrow down ↓ with - prefix  
- **Transfer**: Blue arrow → with ↔ symbol
- Shows source → destination for transfers

## Technical Details

### Balance Updates (Atomic)
```javascript
try {
  db.prepare('BEGIN').run();
  
  // Insert transaction
  const result = db.prepare('INSERT INTO transactions ...').run(...);
  
  // Update account balances
  if (type === 'transfer' && account_id && to_account_id) {
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
      .run(amount, account_id);
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
      .run(amount, to_account_id);
  }
  
  db.prepare('COMMIT').run();
} catch (err) {
  db.prepare('ROLLBACK').run();
  throw err;
}
```

### Data Loading
- Parallel API calls for accounts and transactions
- Accounts pre-grouped by backend for efficient rendering
- Transactions enriched with account names via SQL JOINs

## Testing

### Manual Test Scenarios
1. **Create Account**: Verify bank field is required
2. **Add Transaction**: Check balance updates correctly
3. **Transfer Funds**: Confirm both accounts update and net stays same
4. **View Transactions**: Ensure transfer shows both account names
5. **Multiple Banks**: Create accounts in different banks and verify grouping

### Edge Cases Handled
- Empty accounts list → Shows helpful empty state
- Missing bank field → Returns 400 error with message
- Transfer to same account → Possible (not blocked, user responsibility)
- Negative balance → Not prevented (overdraft allowed)

## Future Enhancements

### Calendar View
- Heatmap of transaction activity
- Daily spending visualization
- Month-over-month comparison

### Chart View
- Pie chart: Distribution across accounts
- Bar chart: Spending by category
- Line chart: Balance trends over time

### Additional Features
- Account archiving (soft delete)
- Transaction editing/deletion
- Recurring transactions
- Budget allocation by account
- Export to CSV

## Migration Guide

### For Existing Users
1. Database automatically adds `bank` field to accounts table
2. Existing accounts get empty string for bank (valid but not ideal)
3. Users should edit existing accounts to add bank names
4. New accounts require bank field

### For Developers
1. Update API calls to include `bank` when creating accounts
2. Use new `accounts.grouped` structure for UI display
3. Handle transfer type in transaction display
4. Use atomic transaction pattern for balance updates

## Version History

- **v3.0**: Initial finance system with basic transactions
- **v3.1**: Account-centric architecture with multi-bank support and transfers

## Documentation

See updated documentation in:
- [.github/copilot-instructions.md](../.github/copilot-instructions.md)
- [server.js](../server.js) - Lines 16-195 (schema and API)
- [public/index.html](../public/index.html) - Finance Section component

## Questions?

This is a self-hosted system for personal use. The architecture prioritizes simplicity and directness over enterprise features. All data stays local in SQLite.
