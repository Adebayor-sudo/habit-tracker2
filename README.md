# Tracker v3.0 - Personal Operating System

> A self-hosted, privacy-first personal operating system combining habit tracking, financial management, and weekly planning.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Version](https://img.shields.io/badge/version-3.0.0-green)
![Status](https://img.shields.io/badge/status-stable-brightgreen)

## Features

### 🎯 Habit Tracking
- **Domain-based organization** (Health, Fitness, Work, Bible, Personal Development)
- **Three frequency types**: Daily, 3x/week, 1x/week
- **Weekly alignment tracking** with percentage completion
- **Check-in system**: Mark commitments as done/skip/miss
- **Monthly heatmap** visualizing activity patterns

### 💰 Financial Management
- **Multi-bank account tracking** (Sterling, Kuda, Zenith, etc.)
- **Account-centric finance** - track net worth across institutions
- **Transaction types**: Income, Expense, Transfer, Conversion
- **Multi-currency support** with real-time exchange rates
- **Soft delete with trash** - recover deleted transactions anytime
- **Transaction editing** with atomic balance recalculation
- **Daily income tracking** for freelancers
- **Budgets & financial goals**

### 📊 Reports & Analytics
- **Weekly alignment summary** showing domain completion percentages
- **Monthly summary** with income/expense/savings analysis
- **Activity heatmap** showing consistency patterns
- **Net worth tracking** normalized to user's default currency
- **Audit trail** showing transaction corrections and deletions
- **Streak tracking** for habit consistency

### 🔒 Security & Privacy
- **Self-hosted** - complete data ownership
- **Token-based authentication** - JWT with 30-day expiration
- **Account isolation** - users can only see their own data
- **Immutable audit trail** - all mutations recorded
- **No third-party tracking** - zero telemetry

## Technology Stack

**Backend:**
- Node.js + Express.js
- SQLite with better-sqlite3
- Prometheus metrics
- Nodemon for development

**Frontend:**
- React 18 (via CDN)
- Tailwind CSS
- Babel for JSX transpilation
- No build step required

**Infrastructure:**
- Docker-ready
- Tailscale-only access (self-hosted)
- Single database file at `/opt/habit-tracker/data/tracker.db`

## Installation

### Prerequisites
- Node.js 16+ 
- npm

### Local Setup
```bash
git clone https://github.com/YOUR-USERNAME/habit-tracker.git
cd habit-tracker

# Install dependencies
npm install

# Create data directory
mkdir -p data

# Start server
npm start
# Server runs on http://localhost:3000
```

### Docker Setup
```bash
docker build -t tracker:latest .
docker run -p 3000:3000 -v tracker-data:/opt/habit-tracker/data tracker:latest
```

### Environment Variables
```bash
PORT=3000                              # Server port (default: 3000)
NODE_ENV=production                    # production/development
DB_PATH=/opt/habit-tracker/data/tracker.db  # Database location
JSON_LIMIT=1mb                         # JSON body size limit
CORS_ORIGINS=http://localhost:3000     # Comma-separated CORS origins
```

## Usage

### Register & Login
1. Open http://localhost:3000
2. Click "Register" to create account
3. Enter username, password, display name
4. Log in and start tracking

### Adding Commitments
1. Click "Commitments" tab
2. Expand a domain (e.g., "Health")
3. Click "+ Add commitment"
4. Enter text, select frequency (daily/3x/week/1x/week)
5. Check in daily with Done/Skip/Miss buttons

### Managing Finances
1. Click "Finance" tab
2. Create accounts for each bank
3. Add transactions (income/expense/transfer)
4. Edit or delete transactions with automatic balance recalculation
5. View trash to recover deleted transactions

### Viewing Reports
1. Click "Reports" tab
2. See weekly alignment, monthly summary, heatmaps
3. Track streaks and correction patterns via audit trail

## Architecture

### Database Schema
- **users**: User accounts with credentials
- **sessions**: JWT token sessions (30-day expiration)
- **domains**: 5 default habit categories
- **commitments**: User habits with frequency
- **checkins**: Daily check-in records
- **accounts**: Bank accounts with balances
- **transactions**: Income/expense/transfer records
- **transaction_history**: Immutable audit trail
- **budgets**: Budget allocations by category
- **financial_goals**: Target savings goals

### API Endpoints

**Authentication:**
- `POST /api/register` - Create account
- `POST /api/login` - Get JWT token
- `POST /api/logout` - Invalidate session
- `GET /api/me` - Current user info

**Commitments:**
- `GET /api/commitments` - List active commitments
- `POST /api/commitments` - Create commitment
- `PUT /api/commitments/:id` - Update commitment
- `DELETE /api/commitments/:id` - Soft delete

**Check-ins:**
- `GET /api/checkins` - List check-ins for date range
- `POST /api/checkins` - Record check-in
- `DELETE /api/checkins` - Remove check-in

**Accounts:**
- `GET /api/accounts` - List user's accounts
- `POST /api/accounts` - Create account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Soft delete account

**Transactions:**
- `GET /api/transactions` - List active transactions
- `POST /api/transactions` - Create transaction
- `PUT /api/transactions/:id` - Edit transaction (with balance recalculation)
- `DELETE /api/transactions/:id` - Soft delete to trash
- `POST /api/transactions/:id/restore` - Restore from trash
- `GET /api/transactions/trash` - View deleted transactions

**Reports:**
- `GET /api/reports/weekly-alignment` - Weekly completion %
- `GET /api/reports/monthly-summary` - Monthly stats & heatmap
- `GET /api/reports/net-worth` - Total net worth normalized
- `GET /api/reports/audit-trail` - Correction & deletion statistics
- `GET /api/reports/streak` - Longest habit streak

## Development

### Start Server
```bash
npm start
# Runs on http://0.0.0.0:3000 with nodemon watching for changes
```

### Run Tests
```bash
npm test
# Runs comprehensive test suite
npm test -- --runInBand  # Sequential testing
```

### Database Debugging
```bash
# Access SQLite CLI
sqlite3 data/tracker.db

# Check database schema
.schema

# View tables
.tables

# Run query
SELECT * FROM users;
```

### Code Structure
```
/opt/habit-tracker/
├── server.js              # Express API + database logic
├── public/index.html      # React SPA (no build step)
├── data/
│   └── tracker.db         # SQLite database
├── tests/
│   └── *.test.js          # Test suites
├── docs/                  # Architecture documentation
└── .github/workflows/     # CI/CD pipelines
```

## Versioning & Releases

This project follows **Semantic Versioning** (SemVer):
- **MAJOR** (v3.0.0 → v4.0.0): Breaking changes
- **MINOR** (v3.0.0 → v3.1.0): New features (backward compatible)
- **PATCH** (v3.0.0 → v3.0.1): Bug fixes

See [CHANGELOG.md](./CHANGELOG.md) for version history and [releases](https://github.com/YOUR-USERNAME/habit-tracker/releases) for detailed release notes.

## Contributing

We welcome contributions! Please:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make changes** and commit with clear messages
4. **Push to fork**: `git push origin feature/your-feature`
5. **Open a Pull Request** describing your changes

### Commit Message Convention
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Add/update tests
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Maintenance tasks

Example: `feat: add transfer reversal on transaction delete`

## Roadmap

### v3.1.0 (Planned)
- [ ] Recurring transaction templates
- [ ] Investment portfolio tracking
- [ ] Transaction categorization AI
- [ ] Weekly digest email
- [ ] Mobile app (React Native)

### v3.2.0 (Future)
- [ ] Collaborative accounts
- [ ] Budget forecasting
- [ ] Tax report generation
- [ ] Dark mode improvements
- [ ] API rate limiting

## Security

- **No passwords sent to client** - only token-based auth
- **HTTPS recommended** for production deployment
- **CORS enforced** - only trusted origins allowed
- **SQL injection prevention** - prepared statements throughout
- **XSS protection** - React auto-escapes content
- **CSRF protection** - Helmet security headers

## Performance

- **Single-page app** - no page reloads
- **Optimized queries** - indexed database columns
- **Connection pooling** - efficient database access
- **Lazy loading** - domains loaded on demand
- **Client-side filtering** - instant search/filter

Typical response times:
- Commitments fetch: <100ms
- Transaction create: <150ms
- Report generation: <300ms

## Troubleshooting

### Server won't start
```bash
# Check port conflicts
lsof -i :3000

# Check database permissions
ls -la data/tracker.db

# View server logs
tail -f /tmp/tracker.log
```

### Balance inconsistency
```bash
# Verify balance calculation
sqlite3 data/tracker.db
SELECT account_id, SUM(amount) FROM transactions 
WHERE type = 'income' AND deleted_at IS NULL 
GROUP BY account_id;
```

### Transaction history not recording
```bash
# Check transaction_history table
sqlite3 data/tracker.db
SELECT COUNT(*) FROM transaction_history;
```

## License

AGPL-3.0 - See [LICENSE](./LICENSE) file for details

## Support

- **Issues**: Report bugs on [GitHub Issues](https://github.com/YOUR-USERNAME/habit-tracker/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/YOUR-USERNAME/habit-tracker/discussions)
- **Docs**: Read [architecture docs](./docs)

## Authors

- **Your Name** - Creator & Maintainer

## Acknowledgments

- React & Tailwind CSS for amazing developer experience
- better-sqlite3 for reliable database layer
- Prometheus for metrics instrumentation
- Self-hosted community for inspiring privacy-first development

---

**Built with ❤️ for personal productivity and financial freedom.**

Made self-hosted on Proxmox with Tailscale access.
