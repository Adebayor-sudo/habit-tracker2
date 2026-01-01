# Habit Tracker v3.0 - AI Coding Agent Instructions

## Architecture Overview

**Single-page application** combining habit tracking and personal finance. Architecture:
- **Backend**: Express.js REST API with better-sqlite3 database ([server.js](../server.js))
- **Frontend**: React 18 (via CDN) + Tailwind CSS in single HTML file ([public/index.html](../public/index.html))
- **Data**: SQLite database at `/opt/habit-tracker/data/tracker.db`

Key architectural decisions:
- No build step - all frontend dependencies loaded via CDN
- Inline React via Babel JSX transpilation in browser
- Single-file frontend keeps deployment simple
- Domain-driven habit organization (Health, Fitness, Work, Bible, Personal Development)
- **Account-centric finance system** with multi-bank tracking and internal transfers

## Database Schema (v3.1)

All schema is defined in [server.js](../server.js#L16-L185). Key tables:
- `commitments`: User habits with domain categorization (`domain_key`)
- `checkins`: Daily habit tracking with status (`done`, `skip`, `miss`)
- `weekly_plans`: Auto-created Monday-Sunday planning periods
- `accounts`: Multi-bank account tracking with `bank` field (e.g., Sterling, Kuda, Zenith)
- `transactions`: Financial tracking (income/expense/transfer) with `to_account_id` for transfers
- `domains`: Categories for organizing commitments (user-customizable)

**Migration pattern**: Schema changes use try-catch `ALTER TABLE` blocks (see [server.js](../server.js#L189-L193))

### Account-Centric Finance System

The finance system is organized around **bank accounts** rather than abstract budgets:
- Each account has a `bank` (e.g., "Sterling", "Kuda") and `name` (e.g., "Salary", "Current")
- Accounts store current `balance` which is automatically updated by transactions
- Internal transfers use `to_account_id` to move money between accounts **without affecting net total**
- The sum of all account balances represents total net worth

Example user setup:
- Sterling Bank: Salary Account (₦150,000), Current Account (₦75,000)
- Kuda Bank: Main Account (₦50,000)
- Zenith Bank: Savings Account (₦100,000)
- **Total Net Worth**: ₦375,000

## Authentication Pattern

Token-based auth stored in `sessions` table:
1. Login/register generates 32-byte hex token, expires in 30 days
2. All protected routes use `authenticateToken` middleware ([server.js](../server.js#L204-L222))
3. Frontend stores token in state, passes as `Authorization: Bearer <token>` header
4. API client factory at [public/index.html](../public/index.html#L36-L98)

## Critical API Conventions

**Date format**: Always `YYYY-MM-DD` strings (ISO split on 'T')
**Week boundaries**: Monday=start, Sunday=end via `getWeekStart()` helper ([server.js](../server.js#L225-L236))
**Soft deletes**: `active` boolean flag, not hard deletes
**Response structure**: `{ success: true, ... }` on success, `{ error: "message" }` on failure

### Weekly Plan Auto-Creation

When `/api/weekly-plans/current` is called ([server.js](../server.js#L506-L544)):
1. Calculates current week's Monday
2. Auto-creates plan if missing
3. Copies all active commitments to plan with target counts based on frequency
4. Returns plan + grouped commitments

## Frontend State Management

React useState hooks manage all state - no Redux/Context:
- `token`, `user`: Authentication state
- `commitments`, `checkins`, `transactions`: Core data arrays
- `domains`: Fixed 5 categories loaded on mount
- View state: `activeTab`, `financeView`, `expandedDomains`

**Data flow**: API call → setState → React re-render. No caching layer.

## Development Workflow

**Start server**: 
```bash
node server.js
# Runs on http://0.0.0.0:3000
```

**No build step required** - edit HTML/server.js and refresh browser

**Database location**: `/opt/habit-tracker/data/tracker.db` (absolute path hardcoded)

## Domain System

5 default domains initialized for new users ([server.js](../server.js#L239-L252)):
- `health`, `fitness`, `work`, `bible`, `growth`
- Each has icon name (string), description, sort_order
- Commitments grouped by `domain_key` in UI

When adding features, maintain domain-based organization.

## Commitment Frequency Logic

Three frequency types with target counts:
- `daily`: 7 targets per week
- `3x/week`: 3 targets per week  
- `1x/week`: 1 target per week

Alignment calculation: `(completed / target) * 100` capped at target ([server.js](../server.js#L838-L857))

## Finance Tracking

Account-centric system with 4 views: accounts, transactions, calendar, chart
- **Accounts view**: Shows all accounts grouped by bank with individual balances and total net amount
- **Transactions view**: Table format with income/expense/transfer entries, enriched with account names
- **Calendar view**: (Coming soon) Activity visualization by day
- **Chart view**: (Coming soon) Distribution across accounts and categories
- Multi-currency support via `default_currency` user setting (default: USD)

### Transfer Logic

Internal transfers between accounts are tracked specially:
- Use transaction type `transfer` with both `account_id` (source) and `to_account_id` (destination)
- Balance updates are atomic using SQLite transactions (BEGIN/COMMIT/ROLLBACK)
- Source account: `balance = balance - amount`
- Destination account: `balance = balance + amount`
- **Net total remains unchanged** - money only moves between accounts
- Displayed with special icon (↔) and shows both account names

When adding features, maintain account-centric organization and atomic balance updates.

## Styling Conventions

Theme system with light/dark modes using Tailwind classes:
- Theme object stores all color classes: `t.surface`, `t.text`, `t.border`, etc.
- No custom CSS beyond fonts - pure Tailwind utility classes
- Icon system via inline SVG components (see [public/index.html](../public/index.html#L106))

## Testing & Validation

**No automated tests currently exist**. Manual testing workflow:
1. Create user via UI
2. Verify default domains created
3. Test commitment CRUD operations
4. Check weekly alignment calculations

When adding features, maintain consistency with existing patterns rather than introducing new test frameworks.
