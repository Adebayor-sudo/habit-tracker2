# Changelog

All notable changes to Tracker are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Recurring transaction templates
- Investment portfolio tracking
- Transaction categorization with AI
- Weekly digest email reports
- Mobile app (React Native)
- Collaborative accounts
- Budget forecasting
- Tax report generation

---

## [3.1.0] - 2026-01-01

### Added
- **Transaction Mutations**: Complete edit/delete/restore system for transactions
  - Edit any transaction with automatic balance recalculation
  - Soft delete moves transactions to trash (recoverable)
  - Restore transactions from trash with validation
  - Atomic balance updates for all transaction types
  - Support for income, expense, transfer, and conversion transactions

- **Audit Trail System**: Immutable transaction history tracking
  - `transaction_history` table records every mutation
  - Tracks create, edit, delete, restore actions
  - Full transaction snapshots stored with each change
  - `GET /api/reports/audit-trail` endpoint for transparency

- **Trash Management**: Secure deletion with recovery
  - Deleted transactions moved to trash (not permanent)
  - View trash via `GET /api/transactions/trash`
  - Restore transactions with balance validation
  - Excluded from all calculations and reports while in trash

- **Frontend Edit/Delete UI**:
  - Edit modal with pre-filled transaction form
  - Delete confirmation dialog
  - Trash view with restore buttons
  - Real-time balance preview during edits
  - Currency conversion display for multi-currency transactions

- **Balance Integrity Guarantees**:
  - Negative balance prevention enforced on all edits
  - Atomic database transactions (BEGIN/COMMIT/ROLLBACK)
  - Deterministic balance recalculation
  - Transfer conservation (money never lost)
  - Immutable audit trail

### Changed
- Transactions now exclude `deleted_at IS NOT NULL` by default
- Balance recalculation now supports edit scenarios
- Error responses include detailed balance information (shortfall, available balance)

### Fixed
- Balance consistency during transaction edits
- Transfer atomicity during deletions
- Audit trail preservation on all mutations

### Technical
- Added `deleted_at` and `deleted_reason` columns to `transactions` table
- Created `transaction_history` table for versioning
- Implemented `reverseTransactionEffect()` and `applyTransactionEffect()` helpers
- Atomic database transactions for edit/delete/restore operations
- Comprehensive test suite (21/21 tests passing)

---

## [3.0.0] - 2025-12-15

### Added
- **Initial Release**: Complete habit tracking + financial management system
- **Habit Tracking**:
  - 5 default domains (Health, Fitness, Work, Bible, Personal Development)
  - 3 frequency types (daily, 3x/week, 1x/week)
  - Weekly alignment tracking with percentage completion
  - Daily check-in system (done/skip/miss)
  - Monthly activity heatmap

- **Financial Management**:
  - Multi-bank account tracking
  - Account-centric finance (track net worth across institutions)
  - Transaction types: income, expense, transfer, conversion
  - Multi-currency support with real-time exchange rates
  - Daily income tracking for freelancers
  - Budgets & financial goals

- **Reports & Analytics**:
  - Weekly alignment summary
  - Monthly summary with income/expense/savings
  - Activity heatmap showing consistency
  - Net worth normalization by currency
  - Streak tracking for habits

- **Security & Privacy**:
  - Self-hosted architecture
  - Token-based authentication (JWT)
  - Account isolation per user
  - No third-party tracking

- **Frontend**:
  - Single-page app (React 18 via CDN)
  - Tailwind CSS styling
  - No build step required
  - Light/dark theme toggle
  - Responsive design

- **Backend**:
  - Node.js + Express.js
  - SQLite database (better-sqlite3)
  - Prometheus metrics
  - Comprehensive API (40+ endpoints)

- **Documentation**:
  - Copilot instructions for AI assistance
  - Architecture documentation
  - Database schema documentation

### Architecture
- Database schema with 13 core tables
- Soft delete pattern for data retention
- Account-centric balance tracking
- Weekly plan auto-creation
- Domain-based organization system

---

## Version History

| Version | Date | Type | Key Changes |
|---------|------|------|-------------|
| 3.1.0 | 2026-01-01 | Minor | Transaction mutations, audit trail, trash system |
| 3.0.0 | 2025-12-15 | Major | Initial public release |

---

## Upgrade Guide

### From v3.0.0 to v3.1.0

**Database Migration:**
```bash
# Backup your database first
cp data/tracker.db data/tracker.db.backup

# Run server - migrations apply automatically
npm start
```

**New Database Columns:**
- `transactions.deleted_at` - NULL for active, timestamp for deleted
- `transactions.deleted_reason` - Why transaction was deleted
- New table: `transaction_history` - Audit trail

**API Changes:**
- `PUT /api/transactions/:id` - Now available (edit transactions)
- `POST /api/transactions/:id/restore` - New (restore from trash)
- `GET /api/transactions/trash` - New (view deleted transactions)
- `GET /api/reports/audit-trail` - New (deletion statistics)

**No Breaking Changes** - Full backward compatibility maintained.

---

## Development

### Local Testing
```bash
# Install dependencies
npm install

# Run server with auto-reload
npm start

# Run tests
npm test

# Run specific test file
npm test transaction-mutations.test.js
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: add my feature"

# Push to remote
git push origin feature/my-feature

# Create pull request on GitHub
```

---

## Release Process

### Creating a New Release

1. **Update version numbers:**
   ```bash
   npm version minor  # or major/patch
   ```

2. **Update CHANGELOG.md:**
   - Add new section with date
   - List all changes under Added/Changed/Fixed
   - Link commits and pull requests

3. **Create git tag:**
   ```bash
   git tag -a v3.1.0 -m "Release version 3.1.0"
   git push origin v3.1.0
   ```

4. **Create GitHub Release:**
   - Go to Releases page
   - Click "Draft a new release"
   - Select tag
   - Add release notes (from CHANGELOG)
   - Attach artifacts if needed
   - Mark as latest/prerelease

---

## Support & Contributing

- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Join GitHub Discussions for feature requests
- **Contributing**: See CONTRIBUTING.md for guidelines
- **License**: AGPL-3.0 (see LICENSE file)

---

For detailed information about each release, visit the [Releases](https://github.com/YOUR-USERNAME/habit-tracker/releases) page.
