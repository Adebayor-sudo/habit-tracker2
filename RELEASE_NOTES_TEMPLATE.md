# GitHub Release Notes Template

Use this template when creating GitHub releases. Copy the relevant section from CHANGELOG.md.

## v3.1.0 Release Template

**Release Date:** January 1, 2026

### 🎉 What's New in v3.1.0

This release brings complete transaction management with full audit trail support.

### ✨ Major Features

#### Transaction Edit/Delete/Restore
- **Edit any transaction** with automatic balance recalculation
- **Delete to trash** - recoverable soft delete (not permanent)
- **Restore from trash** - bring transactions back with validation
- **Balance integrity** - negative balance prevention enforced

#### Audit Trail System
- **Immutable history** - every transaction mutation recorded
- **Transparency reporting** - view correction patterns and deletion statistics
- **Full snapshots** - transaction_history table captures complete state

#### Trash Management
- **Separate trash view** - deleted transactions hidden from main views
- **Bulk recovery** - restore multiple transactions at once
- **Audit compliance** - all deletions tracked with reasons

### 🔧 Technical Improvements

- Atomic database transactions for consistency
- Multi-type support (income, expense, transfer, conversion)
- Exchange rate caching for performance
- Comprehensive test suite (21/21 tests passing)

### 📊 Testing

All 21 integration tests passing:
- ✅ Transaction editing with balance validation
- ✅ Insufficient balance error handling
- ✅ Delete/restore lifecycle
- ✅ Transfer atomicity
- ✅ Audit trail recording

### 🚀 Performance

- Edit operation: <150ms
- Delete operation: <100ms
- Restore operation: <100ms
- Report generation: <300ms

### 📝 Breaking Changes

**None** - Full backward compatibility maintained.

### 🔄 Migration Guide

Database migrations apply automatically on server start:
```bash
npm start
```

No manual migration steps required.

### 🐛 Bug Fixes

- Fixed balance inconsistency during transaction edits
- Fixed transfer atomicity during deletions
- Fixed audit trail preservation on all mutations

### 📚 Documentation

- New: [TRANSACTION_MUTATIONS.md](./TRANSACTION_MUTATIONS.md) - Complete system documentation
- Updated: [README.md](./README.md) - API endpoint documentation
- Updated: [CHANGELOG.md](./CHANGELOG.md) - Version history

### 👥 Contributors

- @YOUR-USERNAME - Feature implementation and testing

### 🙏 Acknowledgments

Thanks to all users testing and providing feedback on the transaction system.

### 📖 Full Changelog

See [CHANGELOG.md](./CHANGELOG.md) for complete version history.

### 🔗 Links

- [Issues](https://github.com/YOUR-USERNAME/habit-tracker/issues)
- [Discussions](https://github.com/YOUR-USERNAME/habit-tracker/discussions)
- [Documentation](./docs)

---

### Installation & Upgrade

**New Installation:**
```bash
git clone https://github.com/YOUR-USERNAME/habit-tracker.git
cd habit-tracker
npm install
npm start
```

**Upgrade from v3.0.0:**
```bash
git pull origin main
npm install
npm start
# Database migrations apply automatically
```

### Docker

```bash
docker build -t tracker:latest .
docker run -p 3000:3000 -v tracker-data:/opt/habit-tracker/data tracker:latest
```

---

**Download:** [Source code (zip)](https://github.com/YOUR-USERNAME/habit-tracker/archive/refs/tags/v3.1.0.zip) | [Source code (tar.gz)](https://github.com/YOUR-USERNAME/habit-tracker/archive/refs/tags/v3.1.0.tar.gz)

Made with ❤️ for personal productivity and financial freedom.
