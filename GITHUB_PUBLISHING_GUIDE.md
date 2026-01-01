# Publishing Tracker to GitHub - Step-by-Step Guide

## Prerequisites

- GitHub account (create at https://github.com/signup)
- Git installed locally (`git --version` to verify)
- SSH key configured (recommended) or personal access token

## Step 1: Create GitHub Repository

### Option A: Using GitHub Web Interface

1. Go to https://github.com/new
2. Fill in repository details:
   - **Repository name**: `habit-tracker`
   - **Description**: "Personal operating system combining habit tracking and financial management"
   - **Visibility**: Choose `Public` (for open source) or `Private` (for personal use)
   - **Initialize**: Leave unchecked (we have existing code)
3. Click "Create repository"

### Option B: Using GitHub CLI

```bash
gh repo create habit-tracker \
  --public \
  --description "Personal operating system combining habit tracking and financial management" \
  --source=. \
  --remote=origin \
  --push
```

## Step 2: Add GitHub Remote (if not using CLI)

```bash
cd /opt/habit-tracker

# Add remote (replace YOUR-USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR-USERNAME/habit-tracker.git

# Verify remote added
git remote -v
# Should show:
# origin  https://github.com/YOUR-USERNAME/habit-tracker.git (fetch)
# origin  https://github.com/YOUR-USERNAME/habit-tracker.git (push)
```

## Step 3: Push Code to GitHub

### First-time Push:

```bash
cd /opt/habit-tracker

# Push main branch with tags
git push -u origin main
git push origin v3.1.0

# Or push all tags
git push origin --tags
```

### Verify Push:

```bash
# Check remote tracking
git branch -v

# Should show:
# * main   0b0b806 [origin/main] feat: transaction mutations...
```

## Step 4: Set Up GitHub Release

### Option A: Using GitHub Web Interface

1. Go to your repository
2. Click "Releases" (or "Tags" then "Releases")
3. Click "Draft a new release"
4. Select tag: `v3.1.0`
5. Copy release notes from [RELEASE_NOTES_TEMPLATE.md](./RELEASE_NOTES_TEMPLATE.md):
   ```markdown
   # Transaction Mutations & Audit Trail System

   **Release Date:** January 1, 2026

   ## What's New

   This release brings complete transaction management with full audit trail support.

   ### Features
   - Edit transactions with automatic balance recalculation
   - Soft delete transactions to trash (recoverable)
   - Restore deleted transactions from trash
   - Immutable audit trail logging all mutations
   ...
   ```
6. Click "Publish release"

### Option B: Using GitHub CLI

```bash
# Create release from tag
gh release create v3.1.0 \
  --title "v3.1.0 - Transaction Mutations & Audit Trail" \
  --notes-file RELEASE_NOTES_TEMPLATE.md \
  --draft  # Add --draft to review before publishing
```

## Step 5: Configure Repository Settings

### Branch Protection (Recommended)

1. Go to Settings → Branches
2. Click "Add rule" under "Branch protection rules"
3. Pattern: `main`
4. Check:
   - ✓ Require pull request reviews before merging (1 reviewer)
   - ✓ Require status checks to pass before merging
   - ✓ Require branches to be up to date before merging
   - ✓ Dismiss stale pull request approvals
5. Save

### GitHub Pages (Optional - for Documentation)

1. Go to Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main`, Folder: `/docs`
4. Your docs will be at: `https://YOUR-USERNAME.github.io/habit-tracker/`

### Code Security (Recommended)

1. Go to Settings → Code security and analysis
2. Enable:
   - ✓ Dependabot alerts
   - ✓ Dependabot security updates
   - ✓ Secret scanning

### Topics (for Discoverability)

1. Go to Settings → General (scroll to bottom)
2. Add topics:
   - `habit-tracking`
   - `finance`
   - `personal-productivity`
   - `self-hosted`
   - `privacy`

## Step 6: Update GitHub Profile Links

In your GitHub profile (https://github.com/YOUR-USERNAME):

1. Update bio to mention the project
2. Add repository to your pinned repositories
3. Link from your website/portfolio if you have one

---

## Typical Workflow After Publishing

### Creating Feature Branches

```bash
# Create and checkout feature branch
git checkout -b feature/my-feature develop

# Make changes...

# Commit with conventional message
git commit -m "feat: add my feature

This adds functionality to..."

# Push feature branch
git push origin feature/my-feature
```

### Creating Pull Requests

1. Go to your repository
2. Click "Compare & pull request" (GitHub will suggest this)
3. Or click "Pull requests" → "New pull request"
4. Select:
   - Base: `main`
   - Compare: `feature/my-feature`
5. Add PR description
6. Click "Create pull request"

### Merging and Releasing

```bash
# After PR is merged to main
git checkout main
git pull origin main

# Create new version
npm version minor  # or major/patch

# Tag the release
git tag -a v3.2.0 -m "v3.2.0 - My new release"

# Push
git push origin main v3.2.0

# Then create GitHub release (see Step 4)
```

---

## Authentication Setup

### Using HTTPS with Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token"
3. Select scopes:
   - `repo` (full control of repositories)
   - `workflow` (GitHub Actions)
4. Copy token and store securely
5. Use as password when pushing:
   ```bash
   git push origin main
   # When prompted for password, paste token
   ```

### Using SSH (Recommended)

1. Generate SSH key:
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   ```
2. Go to GitHub Settings → SSH and GPG keys
3. Click "New SSH key"
4. Add your public key from `~/.ssh/id_ed25519.pub`
5. Test connection:
   ```bash
   ssh -T git@github.com
   ```

### Store Credentials Locally

```bash
# Cache credentials for 1 hour
git config credential.helper 'cache --timeout=3600'

# Or permanently (OSX)
git config --global credential.helper osxkeychain

# Or permanently (Linux)
git config --global credential.helper store
```

---

## Continuous Integration/Deployment (Optional)

### GitHub Actions Workflow

The repository already has `.github/workflows/ci-cd.yml`. To activate:

1. Go to Actions tab
2. Workflows are automatically enabled
3. Workflows run on every push to `main` or pull request

### Example Workflow

The existing CI runs:
- ✓ Syntax validation (`node -c server.js`)
- ✓ Test suite (`npm test`)
- ✓ Linting (if configured)
- ✓ Security checks

---

## Managing Collaborators

### Adding Collaborators

1. Go to Settings → Collaborators
2. Click "Add people"
3. Search for GitHub username
4. Select permission level:
   - **Pull only**: Can view and clone
   - **Triage**: Can read, clone, and open issues/PRs
   - **Write**: Can push to branches
   - **Maintain**: Can manage settings
   - **Admin**: Full access
5. Send invitation

### Teams (For Organizations)

If you create an organization:
1. Go to Organization Settings → Teams
2. Create teams with different permissions
3. Assign members and repositories

---

## Monitoring & Maintenance

### Watch for Updates

1. Go to Settings → Code security and analysis
2. Dependabot will alert about security updates
3. Review and merge security PRs promptly

### Monitor Releases & Issues

1. **Releases**: Track version releases and downloads
2. **Issues**: Monitor bug reports and feature requests
3. **Discussions**: Enable for community conversations
4. **Insights**: View traffic, forks, stars over time

---

## Publishing Checklist

- [ ] Local repo has clean status (`git status` shows nothing)
- [ ] All tests passing (`npm test`)
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated
- [ ] Commit message follows convention
- [ ] Tag created with descriptive message
- [ ] GitHub repository created
- [ ] Remote added (`git remote -v`)
- [ ] Code pushed to GitHub
- [ ] Tags pushed to GitHub
- [ ] GitHub release created with notes
- [ ] Repository settings configured
- [ ] Branch protection rules set up
- [ ] README visible and correct
- [ ] LICENSE file present
- [ ] Topics added
- [ ] Collaborators invited (if applicable)

---

## Troubleshooting

### Remote Already Exists

```bash
# Remove old remote
git remote remove origin

# Add new remote
git remote add origin https://github.com/YOUR-USERNAME/habit-tracker.git
```

### Authentication Fails

```bash
# Test SSH connection
ssh -T git@github.com

# Or use HTTPS with token
git remote set-url origin https://YOUR-USERNAME:TOKEN@github.com/YOUR-USERNAME/habit-tracker.git
```

### Tag Push Fails

```bash
# Push specific tag
git push origin v3.1.0

# Or push all tags
git push origin --tags
```

### Force Push (Use Carefully!)

```bash
# Only if you need to overwrite remote history
git push origin main --force-with-lease

# More conservative than --force
```

---

## Next Steps

1. **Promote your project:**
   - Add to awesome lists (https://github.com/awesome-selfhosted/awesome-selfhosted)
   - Share in communities (Reddit, HackerNews, dev.to)
   - Write blog post about the project

2. **Set up documentation site:**
   - Enable GitHub Pages
   - Create docs in `/docs` folder
   - Link from README

3. **Build community:**
   - Respond to issues promptly
   - Thank contributors
   - Consider adding CONTRIBUTORS.md

4. **Plan roadmap:**
   - Create GitHub Projects
   - Track v3.2.0 and future features
   - Engage community in planning

---

## Key GitHub Features to Explore

- **Discussions**: Community forum for questions
- **Projects**: Kanban board for tracking work
- **Milestones**: Group issues/PRs by version
- **Labels**: Organize issues (bug, enhancement, documentation, etc.)
- **Templates**: Issue and PR templates for consistency
- **Actions**: Automate workflows
- **Releases**: Publish downloadable artifacts
- **Wiki**: Host project documentation

---

**You're ready to publish!** Follow the steps above to get Tracker on GitHub. Good luck! 🚀
