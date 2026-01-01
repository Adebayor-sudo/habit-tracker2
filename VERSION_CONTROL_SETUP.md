# Version Control & Release Management - Complete Setup

**Last Updated:** January 1, 2026  
**Current Version:** v3.1.0  
**Status:** ✅ Ready for GitHub Publishing

---

## 📊 Current State

### Git Repository Status
```
Branch: main
Commits: 4 (plus v3.1.0 tag)
Latest: 9cb88b2 - docs: add comprehensive GitHub publishing guide
Tags: v3.1.0 (current release)
Remote: Not yet configured (ready for GitHub)
```

### Version Releases
| Version | Date | Changes | Status |
|---------|------|---------|--------|
| v3.1.0 | 2026-01-01 | Transaction mutations, audit trail | ✅ Tagged |
| v3.0.0 | 2025-12-15 | Initial release | ✓ Historical |

---

## 🎯 What's Been Set Up

### 1. Semantic Versioning Strategy

**Format:** `v{MAJOR}.{MINOR}.{PATCH}`

- **MAJOR** (3.0.0 → 4.0.0): Breaking changes, architecture overhauls
- **MINOR** (3.0.0 → 3.1.0): New features (backward compatible)
- **PATCH** (3.0.0 → 3.0.1): Bug fixes only

**Bump Commands:**
```bash
npm version major   # v3.1.0 → v4.0.0
npm version minor   # v3.0.0 → v3.1.0
npm version patch   # v3.0.0 → v3.0.1
```

### 2. Branching Strategy

**Main Branches:**
- **main**: Production-ready code (tagged releases only)
- **develop**: Integration branch for new features

**Feature Branches:**
- Format: `feature/{feature-name}`
- Example: `feature/recurring-transactions`
- Create from: `develop`

**Release Branches:**
- Format: `release/{version}`
- Example: `release/v3.2.0`
- Create from: `develop`
- Merge to: `main` (tag), then back to `develop`

**Hotfix Branches:**
- Format: `hotfix/{issue}`
- Example: `hotfix/negative-balance`
- Create from: `main`
- Merge to: `main` and `develop`

### 3. Release Infrastructure

**Documentation Files Created:**

| File | Purpose |
|------|---------|
| `README.md` | Project overview, installation, usage |
| `CHANGELOG.md` | Version history and changes |
| `CONTRIBUTING.md` | Development guidelines |
| `LICENSE` | AGPL-3.0 open source license |
| `GITHUB_PUBLISHING_GUIDE.md` | Step-by-step GitHub setup |
| `RELEASE_NOTES_TEMPLATE.md` | Template for GitHub releases |

**Documentation Structure:**
```
/opt/habit-tracker/
├── README.md                         # Main project documentation
├── CHANGELOG.md                      # Version history
├── CONTRIBUTING.md                   # Contribution guidelines
├── LICENSE                           # AGPL-3.0 license
├── GITHUB_PUBLISHING_GUIDE.md        # Publishing instructions
├── RELEASE_NOTES_TEMPLATE.md         # Release template
├── TRANSACTION_MUTATIONS.md          # Feature documentation
├── FINANCE_V3.1_CHANGES.md           # Finance system docs
├── OPERATIONS.md                     # Operations guide
├── docs/
│   └── BALANCE_VALIDATION.md         # Technical docs
└── .github/
    ├── copilot-instructions.md
    └── workflows/
        └── ci-cd.yml                 # GitHub Actions
```

### 4. Commit Message Convention

**Format:**
```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `perf:` - Performance improvement
- `chore:` - Maintenance

**Examples:**
```bash
git commit -m "feat: add transaction edit endpoint"
git commit -m "fix: prevent negative balance in edit"
git commit -m "docs: update README API documentation"
git commit -m "test: add 6 new transaction mutation tests"
```

### 5. Git Tags & Releases

**Current Tags:**
```bash
git tag -l
# v3.1.0
```

**Tag Creation:**
```bash
# Annotated tag (recommended for releases)
git tag -a v3.1.0 -m "Release message"

# Lightweight tag (for bookmarks)
git tag v3.1.0-alpha
```

**Push Tags:**
```bash
# Single tag
git push origin v3.1.0

# All tags
git push origin --tags

# Delete remote tag
git push origin --delete v3.1.0
```

---

## 🚀 GitHub Publishing Steps

### Quick Start (Copy & Paste)

```bash
# 1. Create repo on GitHub at https://github.com/new
#    Name: habit-tracker
#    Visibility: Public (or Private)

# 2. Add GitHub remote
cd /opt/habit-tracker
git remote add origin https://github.com/YOUR-USERNAME/habit-tracker.git
git branch -M main

# 3. Push code and tags
git push -u origin main
git push origin v3.1.0

# 4. Create release on GitHub (via web UI or CLI)
gh release create v3.1.0 --title "v3.1.0 - Transaction Mutations" --notes-file RELEASE_NOTES_TEMPLATE.md
```

**See [GITHUB_PUBLISHING_GUIDE.md](./GITHUB_PUBLISHING_GUIDE.md) for detailed steps with screenshots.**

---

## 📝 Workflow Examples

### Creating a Feature

```bash
# 1. Create feature branch
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# 2. Make changes
# ... edit files ...

# 3. Commit with convention
git add .
git commit -m "feat: add my feature

This adds functionality to do X, Y, Z.
Closes #123"

# 4. Push feature branch
git push origin feature/my-feature

# 5. Create pull request on GitHub
# (or use: gh pr create)

# 6. After PR is merged...
git checkout develop
git pull origin develop
```

### Creating a Release

```bash
# 1. Bump version
npm version minor

# 2. Update CHANGELOG.md with new version section

# 3. Commit version bump
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump version to 3.2.0"

# 4. Create and push tag
git tag -a v3.2.0 -m "v3.2.0 - New features

Features:
- Feature 1
- Feature 2

Testing:
- All 25 tests passing"
git push origin main v3.2.0

# 5. Create release on GitHub
gh release create v3.2.0 --title "v3.2.0" --notes-file RELEASE_NOTES_TEMPLATE.md
```

### Fixing a Bug in Production

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 2. Fix the bug
# ... edit files ...

# 3. Commit fix
git commit -m "fix: resolve critical issue

This fixes negative balance bug that affected X users"

# 4. Merge to main
git checkout main
git merge hotfix/critical-bug
git push origin main

# 5. Tag patch release
git tag -a v3.1.1 -m "v3.1.1 - Security fix"
git push origin v3.1.1

# 6. Merge fix back to develop
git checkout develop
git merge hotfix/critical-bug
git push origin develop

# 7. Delete hotfix branch
git branch -d hotfix/critical-bug
git push origin --delete hotfix/critical-bug
```

---

## 📊 Repository Structure

### Project Files
```
/opt/habit-tracker/
├── server.js                    # Express API server
├── public/
│   └── index.html              # React SPA (no build needed)
├── data/
│   └── tracker.db              # SQLite database
├── package.json                # Dependencies & scripts
└── .gitignore                  # Ignored files
```

### Documentation
```
├── README.md                    # Main documentation
├── CHANGELOG.md                 # Version history
├── CONTRIBUTING.md              # Development guide
├── LICENSE                      # AGPL-3.0
├── GITHUB_PUBLISHING_GUIDE.md   # Publishing steps
└── docs/
    └── *.md                     # Technical docs
```

### Testing & CI/CD
```
├── tests/
│   ├── transaction-mutations.test.js
│   ├── balance-validation.test.js
│   └── api.test.js
└── .github/workflows/
    └── ci-cd.yml               # GitHub Actions
```

### Operations & Deployment
```
└── scripts/
    ├── deploy.sh               # Deployment script
    ├── backup.sh               # Database backup
    └── *.service               # systemd services
```

---

## ✅ Release Checklist

Before releasing v3.2.0 (or any version):

- [ ] Feature complete and tested
- [ ] All tests passing (`npm test`)
- [ ] No console errors
- [ ] Code follows style guide
- [ ] Documentation updated
  - [ ] README updated
  - [ ] CHANGELOG.md section added
  - [ ] API endpoints documented
- [ ] Version number bumped (`npm version minor`)
- [ ] Commit message follows convention
- [ ] Tag created with descriptive message
- [ ] Tag pushed to GitHub
- [ ] GitHub release created with notes
- [ ] Release marked as "latest" on GitHub
- [ ] Announcement made (if desired)

---

## 📈 Tracking Progress

### Commit Statistics
```bash
# Total commits
git log --oneline | wc -l

# Commits by author
git shortlog -sn

# Changes summary
git diff v3.0.0 v3.1.0 --stat
```

### Activity Timeline
```bash
# Recent commits
git log --oneline -10

# Commits for date range
git log --since="2026-01-01" --until="2026-01-31" --oneline

# Contributors
git log --pretty=format:"%an" | sort | uniq -c | sort -rn
```

---

## 🔐 Security Best Practices

### Never Commit
- ❌ Secrets, API keys, passwords
- ❌ Private database backups
- ❌ node_modules/ (use .gitignore)
- ❌ Sensitive configuration files

### Secure Practices
- ✅ Use personal access tokens for HTTPS auth
- ✅ Use SSH keys for all repositories
- ✅ Enable 2FA on GitHub
- ✅ Review PRs carefully
- ✅ Sign commits with GPG (advanced)

### .gitignore (Already Configured)
```
node_modules/
data/tracker.db.backup
.env
.env.local
*.log
.DS_Store
```

---

## 🤝 Collaboration Setup

### For Contributors

1. **Fork the repository** (on GitHub)
2. **Clone fork locally:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/habit-tracker.git
   cd habit-tracker
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/ORIGINAL-OWNER/habit-tracker.git
   ```

4. **Create feature branch:**
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout -b feature/my-feature
   ```

5. **Make changes and push to fork**
6. **Create pull request** against upstream main/develop

### For Maintainers

1. **Review pull requests** carefully
2. **Test changes locally:**
   ```bash
   git fetch origin pull/ID/head:BRANCH_NAME
   git checkout BRANCH_NAME
   npm test
   ```

3. **Merge when ready:**
   ```bash
   git checkout develop
   git merge feature/branch
   git push origin develop
   ```

---

## 🎓 Learning Resources

### Git Basics
- [Pro Git Book](https://git-scm.com/book/en/v2) - Official guide
- [Git Cheat Sheet](https://github.github.com/training-kit/) - Quick reference

### GitHub Features
- [GitHub Guides](https://guides.github.com/) - Official tutorials
- [GitHub Skills](https://skills.github.com/) - Interactive courses

### Semantic Versioning
- [semver.org](https://semver.org/) - Version numbering standard
- [Keep a Changelog](https://keepachangelog.com/) - Changelog format

### Open Source
- [How to Contribute to Open Source](https://github.com/freeCodeCamp/how-to-contribute-to-open-source)
- [Open Source Guide](https://opensource.guide/)

---

## 📞 Support & Questions

### Common Commands Reference

```bash
# Status and info
git status                      # Current state
git log --oneline              # Commit history
git branch -a                  # All branches
git tag -l                     # All tags
git remote -v                  # Remote URLs

# Creating/managing branches
git branch feature/my-feature   # Create branch
git checkout feature/my-feature # Switch branch
git checkout -b fix/bug-fix     # Create and switch
git branch -d feature/my-feature # Delete local branch
git push origin --delete feature/my-feature # Delete remote

# Staging and committing
git add file.js                # Stage file
git add .                      # Stage all
git commit -m "message"        # Commit
git commit --amend             # Fix last commit

# Pushing and pulling
git push origin main           # Push branch
git push origin v3.1.0         # Push tag
git pull origin develop        # Pull branch
git fetch origin               # Fetch without merge

# Undoing changes
git restore file.js            # Discard changes
git reset HEAD file.js         # Unstage file
git revert COMMIT              # Undo commit (creates new commit)
git reset --hard COMMIT        # Discard to commit (dangerous!)
```

---

## 🎉 You're Ready!

**What's been set up:**

✅ Semantic versioning strategy  
✅ Git branching model  
✅ Commit message conventions  
✅ Release infrastructure (README, CHANGELOG, etc.)  
✅ Git tags for v3.0.0 and v3.1.0  
✅ Comprehensive documentation  
✅ GitHub publishing guide  
✅ Contributing guidelines  

**Next step:** Follow [GITHUB_PUBLISHING_GUIDE.md](./GITHUB_PUBLISHING_GUIDE.md) to publish to GitHub!

---

**Project Status:** Production-ready ✅  
**Last Updated:** 2026-01-01  
**Version:** v3.1.0
