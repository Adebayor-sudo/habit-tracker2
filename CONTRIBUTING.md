# Contributing to Tracker

Thank you for your interest in contributing to Tracker! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- No discrimination or harassment
- Focus on what's best for the community
- Help others learn and grow

## Getting Started

### 1. Fork the Repository
```bash
# Click "Fork" on GitHub
# Clone your fork
git clone https://github.com/YOUR-USERNAME/habit-tracker.git
cd habit-tracker
```

### 2. Set Up Development Environment
```bash
# Install dependencies
npm install

# Create feature branch
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes
- **Code style**: Follow existing patterns
- **Tests**: Write tests for new features
- **Documentation**: Update docs for user-facing changes
- **Commits**: Use clear, descriptive commit messages

### 4. Test Your Changes
```bash
# Run full test suite
npm test

# Run specific test
npm test -- --testNamePattern="your test"

# Run server locally
npm start
```

### 5. Submit a Pull Request
1. Push to your fork: `git push origin feature/your-feature-name`
2. Go to GitHub and create a Pull Request
3. Write a clear description of your changes
4. Link any related issues
5. Wait for review and feedback

## Commit Message Convention

Use clear, descriptive commit messages following this pattern:

```
<type>: <subject>

<body>

<footer>
```

### Types:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Add or update tests
- `refactor:` Code refactoring (no logic change)
- `perf:` Performance improvements
- `chore:` Build, dependencies, tooling
- `ci:` CI/CD changes

### Examples:
```bash
git commit -m "feat: add transaction search functionality"
git commit -m "fix: prevent negative balance in edit operation"
git commit -m "docs: update API endpoint documentation"
git commit -m "test: add 10 new test cases for balance validation"
```

## Branch Strategy

### Main Branches:
- **`main`**: Production-ready code (tagged releases)
- **`develop`**: Integration branch (staging)

### Feature Branches:
- Create from `develop`
- Format: `feature/feature-name` or `fix/bug-name`
- Example: `feature/recurring-transactions`

### Release Branches:
- Format: `release/v3.1.0`
- Created from `develop`
- Merged to `main` and tagged
- Merged back to `develop`

### Hotfix Branches:
- Format: `hotfix/critical-bug`
- Created from `main`
- Merged to `main` and `develop`

## Pull Request Process

### Before Submitting:
1. **Rebase on latest develop:**
   ```bash
   git fetch origin
   git rebase origin/develop
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Check for lint errors:**
   ```bash
   npm run lint  # if available
   ```

4. **Update CHANGELOG.md** if your change affects users

### PR Description Template:
```markdown
## Description
Brief description of your changes

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing different behavior)
- [ ] Documentation update

## Related Issues
Closes #123

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests passed
- [ ] Manual testing completed

## Screenshots
(If UI changes)

## Checklist
- [ ] My code follows the project style
- [ ] I've updated documentation
- [ ] Tests pass locally
- [ ] No new warnings generated
```

## Code Style Guidelines

### JavaScript/Node.js:
```javascript
// Use const by default
const message = 'Hello';

// Use arrow functions
const greet = (name) => `Hello ${name}`;

// Use template literals
const greeting = `Welcome, ${name}!`;

// Proper error handling
try {
  await api.call();
} catch (err) {
  console.error('Error:', err.message);
}
```

### React Components:
```javascript
function MyComponent({ prop1, prop2 }) {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Setup
    return () => {
      // Cleanup
    };
  }, []);
  
  return <div>{state}</div>;
}
```

### Database Queries:
```javascript
// Use prepared statements always
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// Avoid string concatenation
// ❌ Bad: db.prepare(`SELECT * FROM users WHERE id = ${id}`)
// ✅ Good: db.prepare('SELECT * FROM users WHERE id = ?').get(id)
```

## Testing Guidelines

### Write Tests For:
- New features
- Bug fixes
- Critical paths
- Error conditions

### Test Structure:
```javascript
async function test(name, fn) {
  console.log(`Testing: ${name}`);
  try {
    await fn();
    console.log(`✓ PASSED`);
  } catch (err) {
    console.error(`✗ FAILED: ${err.message}`);
    throw err;
  }
}

// Usage
await test('feature works correctly', async () => {
  const result = await feature();
  assert(result.success, 'Should succeed');
});
```

### Test Coverage Target:
- **Critical paths**: 100%
- **API endpoints**: 80%+
- **UI components**: 70%+
- **Utilities**: 90%+

## Documentation Guidelines

### README Changes:
- Reflect your changes
- Update setup/installation if needed
- Add examples for new features

### Code Comments:
```javascript
// Good: Explains WHY
// We use soft delete instead of hard delete to preserve audit trail
const deleted_at = new Date();

// Bad: Explains WHAT (code already shows this)
// Set deleted_at to current date
```

### API Documentation:
Include in PR description:
- Endpoint path
- HTTP method
- Request/response examples
- Error conditions

## Performance Considerations

### Before Submitting:
- [ ] No unnecessary database queries
- [ ] No N+1 query patterns
- [ ] Efficient algorithms (prefer O(n) over O(n²))
- [ ] Client-side filtering for lists

### Common Issues:
```javascript
// ❌ Bad: N+1 query
const users = db.prepare('SELECT * FROM users').all();
users.forEach(u => {
  const posts = db.prepare('SELECT * FROM posts WHERE user_id = ?').all(u.id);
});

// ✅ Good: Single query
const posts = db.prepare('SELECT * FROM posts JOIN users ON ...').all();
```

## Security Guidelines

### Before Submitting:
- [ ] No hardcoded secrets/passwords
- [ ] SQL injection prevention (use prepared statements)
- [ ] XSS prevention (use React's auto-escaping)
- [ ] CSRF protection maintained
- [ ] Input validation added
- [ ] No sensitive data in logs

### Common Vulnerabilities:
```javascript
// ❌ SQL injection risk
db.prepare(`SELECT * FROM users WHERE id = ${id}`);

// ✅ Safe
db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// ❌ Logging sensitive data
console.log('Password:', user.password);

// ✅ Safe
console.log('User login successful');
```

## Reporting Bugs

### When Reporting:
1. **Search existing issues first** (might already be reported)
2. **Be specific** about the problem
3. **Include reproduction steps**
4. **Provide environment details** (OS, Node version, browser)
5. **Share error messages** (full stack trace if available)

### Bug Report Template:
```markdown
## Describe the Bug
A clear description of what the bug is.

## Reproduction Steps
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happened

## Environment
- OS: [e.g., Linux]
- Node: [e.g., 16.13.0]
- Browser: [e.g., Chrome]

## Screenshots/Logs
If applicable, add screenshots or error messages
```

## Feature Requests

### When Requesting:
1. **Describe the use case** (why do you need this?)
2. **Provide examples** of how it would work
3. **Consider alternatives** you've already tried
4. **Be open** to discussion and feedback

### Feature Request Template:
```markdown
## Description
What problem does this solve?

## Use Case
Why do you need this?

## Proposed Solution
How should it work?

## Alternatives Considered
What else could solve this?

## Additional Context
Anything else relevant?
```

## Release Process

### For Maintainers:
1. **Create release branch:**
   ```bash
   git checkout -b release/v3.1.0 develop
   ```

2. **Update versions:**
   ```bash
   npm version minor
   ```

3. **Update CHANGELOG.md:**
   - Add release notes
   - Link to merged PRs

4. **Merge and tag:**
   ```bash
   git checkout main
   git merge --no-ff release/v3.1.0
   git tag -a v3.1.0 -m "Release v3.1.0"
   git push origin main v3.1.0
   ```

5. **Create GitHub Release:**
   - Copy CHANGELOG notes
   - Include migration instructions if needed
   - Mark as latest release

6. **Merge back to develop:**
   ```bash
   git checkout develop
   git merge --no-ff release/v3.1.0
   git push origin develop
   ```

## Need Help?

- **Questions?** Open a GitHub Discussion
- **Found a bug?** File an issue
- **Have an idea?** Start a discussion first
- **Want to contribute?** Look for "good first issue" labels

## Recognition

Contributors are recognized:
- In release notes
- In CONTRIBUTORS.md (if applicable)
- GitHub contributors page

Thank you for contributing to Tracker! 🙏

---

**Happy coding!** 🚀
