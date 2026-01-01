const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database('/opt/habit-tracker/data/tracker.db');

// ============================================================================
// DATABASE SCHEMA v3.0
// ============================================================================

db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    default_currency TEXT DEFAULT 'USD',
    theme TEXT DEFAULT 'light',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sessions table
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Domains table (Health, Fitness, Work, Bible, Personal Development)
  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Commitments table (replaces habits)
  CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain_key TEXT NOT NULL,
    text TEXT NOT NULL,
    frequency TEXT DEFAULT 'daily',
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Weekly plans table
  CREATE TABLE IF NOT EXISTS weekly_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, week_start),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Weekly plan commitments (which commitments are active for a given week)
  CREATE TABLE IF NOT EXISTS weekly_plan_commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekly_plan_id INTEGER NOT NULL,
    commitment_id INTEGER NOT NULL,
    target_count INTEGER DEFAULT 7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(weekly_plan_id, commitment_id),
    FOREIGN KEY (weekly_plan_id) REFERENCES weekly_plans(id),
    FOREIGN KEY (commitment_id) REFERENCES commitments(id)
  );

  -- Daily check-ins table
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    commitment_id INTEGER NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('done', 'skip', 'miss')),
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, commitment_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (commitment_id) REFERENCES commitments(id)
  );

  -- Financial accounts table
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'checking',
    currency TEXT DEFAULT 'USD',
    balance REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Transactions table
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  -- Budgets table
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    allocated REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    period TEXT DEFAULT 'monthly',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category, period),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Financial goals table
  CREATE TABLE IF NOT EXISTS financial_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    target_date DATE,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- User settings/preferences
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_commitments_user_domain ON commitments(user_id, domain_key);
`);

// Add columns if they don't exist (for migration from v2.x)
try { db.exec('ALTER TABLE users ADD COLUMN default_currency TEXT DEFAULT "USD"'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN theme TEXT DEFAULT "light"'); } catch(e) {}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const session = db.prepare(`
    SELECT s.*, u.id as user_id, u.username, u.display_name, u.default_currency, u.theme
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    default_currency: session.default_currency || 'USD',
    theme: session.theme || 'light'
  };
  next();
}

// Get Monday of the week for a given date
function getWeekStart(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Get Sunday of the week
function getWeekEnd(weekStart) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 6);
  return date.toISOString().split('T')[0];
}

// Initialize default domains for a new user
function initializeDefaultDomains(userId) {
  const defaultDomains = [
    { key: 'health', name: 'Health', icon: 'Heart', description: 'Physical & mental wellbeing', sort_order: 1 },
    { key: 'fitness', name: 'Fitness', icon: 'Dumbbell', description: 'Exercise & movement', sort_order: 2 },
    { key: 'work', name: 'Work', icon: 'Briefcase', description: 'Career & productivity', sort_order: 3 },
    { key: 'bible', name: 'Bible', icon: 'Book', description: 'Scripture & spiritual growth', sort_order: 4 },
    { key: 'growth', name: 'Personal Development', icon: 'Sparkles', description: 'Learning & self-improvement', sort_order: 5 },
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO domains (user_id, key, name, icon, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  defaultDomains.forEach(d => {
    stmt.run(userId, d.key, d.name, d.icon, d.description, d.sort_order);
  });
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================

app.post('/api/register', (req, res) => {
  const { username, password, display_name } = req.body;

  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const password_hash = hashPassword(password);
  const result = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)').run(username, password_hash, display_name);
  
  // Initialize default domains for new user
  initializeDefaultDomains(result.lastInsertRowid);

  const token = generateToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, token, expires);

  res.json({ 
    success: true, 
    token, 
    user: { 
      id: result.lastInsertRowid, 
      username, 
      display_name,
      default_currency: 'USD',
      theme: 'light'
    } 
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Clean up old sessions
  db.prepare('DELETE FROM sessions WHERE user_id = ? OR expires_at < datetime("now")').run(user.id);

  const token = generateToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);

  // Ensure user has domains initialized
  initializeDefaultDomains(user.id);

  res.json({ 
    success: true, 
    token, 
    user: { 
      id: user.id, 
      username: user.username, 
      display_name: user.display_name,
      default_currency: user.default_currency || 'USD',
      theme: user.theme || 'light'
    } 
  });
});

app.post('/api/logout', authenticateToken, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ============================================================================
// USER SETTINGS ENDPOINTS
// ============================================================================

app.put('/api/settings', authenticateToken, (req, res) => {
  const { default_currency, theme, display_name } = req.body;
  
  const updates = [];
  const params = [];
  
  if (default_currency) {
    updates.push('default_currency = ?');
    params.push(default_currency);
  }
  if (theme) {
    updates.push('theme = ?');
    params.push(theme);
  }
  if (display_name) {
    updates.push('display_name = ?');
    params.push(display_name);
  }
  
  if (updates.length > 0) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  
  const user = db.prepare('SELECT id, username, display_name, default_currency, theme FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, user });
});

app.get('/api/settings/:key', authenticateToken, (req, res) => {
  const setting = db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(req.user.id, req.params.key);
  res.json({ key: req.params.key, value: setting?.value || null });
});

app.put('/api/settings/:key', authenticateToken, (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)').run(req.user.id, req.params.key, value);
  res.json({ success: true });
});

// ============================================================================
// DOMAINS ENDPOINTS
// ============================================================================

app.get('/api/domains', authenticateToken, (req, res) => {
  const domains = db.prepare('SELECT * FROM domains WHERE user_id = ? AND active = 1 ORDER BY sort_order').all(req.user.id);
  res.json(domains);
});

app.post('/api/domains', authenticateToken, (req, res) => {
  const { key, name, icon, description } = req.body;
  
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM domains WHERE user_id = ?').get(req.user.id);
  const sort_order = (maxOrder.max || 0) + 1;
  
  const result = db.prepare('INSERT INTO domains (user_id, key, name, icon, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, key, name, icon, description, sort_order);
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/domains/:id', authenticateToken, (req, res) => {
  const { name, icon, description, sort_order } = req.body;
  
  db.prepare('UPDATE domains SET name = ?, icon = ?, description = ?, sort_order = ? WHERE id = ? AND user_id = ?')
    .run(name, icon, description, sort_order, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/domains/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE domains SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// COMMITMENTS ENDPOINTS
// ============================================================================

app.get('/api/commitments', authenticateToken, (req, res) => {
  const { domain_key } = req.query;
  
  let query = 'SELECT * FROM commitments WHERE user_id = ? AND active = 1';
  const params = [req.user.id];
  
  if (domain_key) {
    query += ' AND domain_key = ?';
    params.push(domain_key);
  }
  
  query += ' ORDER BY domain_key, sort_order';
  
  const commitments = db.prepare(query).all(...params);
  
  // Group by domain
  const grouped = {};
  commitments.forEach(c => {
    if (!grouped[c.domain_key]) grouped[c.domain_key] = [];
    grouped[c.domain_key].push(c);
  });
  
  res.json({ commitments, grouped });
});

app.post('/api/commitments', authenticateToken, (req, res) => {
  const { domain_key, text, frequency } = req.body;
  
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM commitments WHERE user_id = ? AND domain_key = ?').get(req.user.id, domain_key);
  const sort_order = (maxOrder.max || 0) + 1;
  
  const result = db.prepare('INSERT INTO commitments (user_id, domain_key, text, frequency, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, domain_key, text, frequency || 'daily', sort_order);
  
  const commitment = db.prepare('SELECT * FROM commitments WHERE id = ?').get(result.lastInsertRowid);
  res.json({ success: true, commitment });
});

app.put('/api/commitments/:id', authenticateToken, (req, res) => {
  const { text, frequency, sort_order } = req.body;
  
  db.prepare('UPDATE commitments SET text = ?, frequency = ?, sort_order = ? WHERE id = ? AND user_id = ?')
    .run(text, frequency, sort_order, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/commitments/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE commitments SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// WEEKLY PLANS ENDPOINTS
// ============================================================================

app.get('/api/weekly-plans', authenticateToken, (req, res) => {
  const { week_start } = req.query;
  
  let query = 'SELECT * FROM weekly_plans WHERE user_id = ?';
  const params = [req.user.id];
  
  if (week_start) {
    query += ' AND week_start = ?';
    params.push(week_start);
  }
  
  query += ' ORDER BY week_start DESC LIMIT 10';
  
  const plans = db.prepare(query).all(...params);
  res.json(plans);
});

app.get('/api/weekly-plans/current', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart(today);
  const weekEnd = getWeekEnd(weekStart);
  
  let plan = db.prepare('SELECT * FROM weekly_plans WHERE user_id = ? AND week_start = ?').get(req.user.id, weekStart);
  
  // Auto-create plan if it doesn't exist
  if (!plan) {
    const result = db.prepare('INSERT INTO weekly_plans (user_id, week_start, week_end) VALUES (?, ?, ?)').run(req.user.id, weekStart, weekEnd);
    plan = { id: result.lastInsertRowid, user_id: req.user.id, week_start: weekStart, week_end: weekEnd };
    
    // Copy active commitments to this week's plan
    const commitments = db.prepare('SELECT id FROM commitments WHERE user_id = ? AND active = 1').all(req.user.id);
    const insertPlanCommitment = db.prepare('INSERT INTO weekly_plan_commitments (weekly_plan_id, commitment_id, target_count) VALUES (?, ?, ?)');
    
    commitments.forEach(c => {
      const commitment = db.prepare('SELECT frequency FROM commitments WHERE id = ?').get(c.id);
      let targetCount = 7;
      if (commitment.frequency === '3x/week') targetCount = 3;
      if (commitment.frequency === '1x/week') targetCount = 1;
      insertPlanCommitment.run(plan.id, c.id, targetCount);
    });
  }
  
  // Get commitments for this plan
  const planCommitments = db.prepare(`
    SELECT c.*, wpc.target_count 
    FROM weekly_plan_commitments wpc
    JOIN commitments c ON wpc.commitment_id = c.id
    WHERE wpc.weekly_plan_id = ? AND c.active = 1
    ORDER BY c.domain_key, c.sort_order
  `).all(plan.id);
  
  // Group by domain
  const grouped = {};
  planCommitments.forEach(c => {
    if (!grouped[c.domain_key]) grouped[c.domain_key] = [];
    grouped[c.domain_key].push(c);
  });
  
  res.json({ plan, commitments: planCommitments, grouped });
});

// ============================================================================
// CHECK-INS ENDPOINTS
// ============================================================================

app.get('/api/checkins', authenticateToken, (req, res) => {
  const { date, start_date, end_date } = req.query;
  
  let query = 'SELECT * FROM checkins WHERE user_id = ?';
  const params = [req.user.id];
  
  if (date) {
    query += ' AND date = ?';
    params.push(date);
  } else if (start_date && end_date) {
    query += ' AND date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }
  
  const checkins = db.prepare(query).all(...params);
  
  // Group by date
  const byDate = {};
  checkins.forEach(c => {
    if (!byDate[c.date]) byDate[c.date] = {};
    byDate[c.date][c.commitment_id] = c.status;
  });
  
  res.json({ checkins, byDate });
});

app.post('/api/checkins', authenticateToken, (req, res) => {
  const { commitment_id, date, status, note } = req.body;
  
  if (!['done', 'skip', 'miss'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  db.prepare(`
    INSERT INTO checkins (user_id, commitment_id, date, status, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, commitment_id, date) DO UPDATE SET status = ?, note = ?
  `).run(req.user.id, commitment_id, date, status, note, status, note);
  
  res.json({ success: true });
});

app.delete('/api/checkins', authenticateToken, (req, res) => {
  const { commitment_id, date } = req.body;
  
  db.prepare('DELETE FROM checkins WHERE user_id = ? AND commitment_id = ? AND date = ?')
    .run(req.user.id, commitment_id, date);
  
  res.json({ success: true });
});

// ============================================================================
// FINANCE: ACCOUNTS ENDPOINTS
// ============================================================================

app.get('/api/accounts', authenticateToken, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND active = 1 ORDER BY name').all(req.user.id);
  res.json(accounts);
});

app.post('/api/accounts', authenticateToken, (req, res) => {
  const { name, type, currency, balance } = req.body;
  
  const result = db.prepare('INSERT INTO accounts (user_id, name, type, currency, balance) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, name, type || 'checking', currency || req.user.default_currency, balance || 0);
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/accounts/:id', authenticateToken, (req, res) => {
  const { name, type, currency, balance } = req.body;
  
  db.prepare('UPDATE accounts SET name = ?, type = ?, currency = ?, balance = ? WHERE id = ? AND user_id = ?')
    .run(name, type, currency, balance, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/accounts/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE accounts SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// FINANCE: TRANSACTIONS ENDPOINTS
// ============================================================================

app.get('/api/transactions', authenticateToken, (req, res) => {
  const { start_date, end_date, type, category, limit, offset } = req.query;
  
  let query = 'SELECT * FROM transactions WHERE user_id = ?';
  let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?';
  const params = [req.user.id];
  const countParams = [req.user.id];
  
  if (start_date && end_date) {
    query += ' AND date BETWEEN ? AND ?';
    countQuery += ' AND date BETWEEN ? AND ?';
    params.push(start_date, end_date);
    countParams.push(start_date, end_date);
  }
  
  if (type) {
    query += ' AND type = ?';
    countQuery += ' AND type = ?';
    params.push(type);
    countParams.push(type);
  }
  
  if (category) {
    query += ' AND category = ?';
    countQuery += ' AND category = ?';
    params.push(category);
    countParams.push(category);
  }
  
  query += ' ORDER BY date DESC, id DESC';
  
  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
    if (offset) {
      query += ' OFFSET ?';
      params.push(parseInt(offset));
    }
  }
  
  const transactions = db.prepare(query).all(...params);
  const { total } = db.prepare(countQuery).get(...countParams);
  
  res.json({ transactions, total, limit: parseInt(limit) || null, offset: parseInt(offset) || 0 });
});

app.post('/api/transactions', authenticateToken, (req, res) => {
  const { account_id, date, type, category, amount, currency, description } = req.body;
  
  const result = db.prepare('INSERT INTO transactions (user_id, account_id, date, type, category, amount, currency, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, account_id || null, date, type, category, amount, currency || req.user.default_currency, description || '');
  
  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.json({ success: true, transaction });
});

app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  const { account_id, date, type, category, amount, currency, description } = req.body;
  
  db.prepare('UPDATE transactions SET account_id = ?, date = ?, type = ?, category = ?, amount = ?, currency = ?, description = ? WHERE id = ? AND user_id = ?')
    .run(account_id, date, type, category, amount, currency, description, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// FINANCE: BUDGETS ENDPOINTS
// ============================================================================

app.get('/api/budgets', authenticateToken, (req, res) => {
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND active = 1 ORDER BY category').all(req.user.id);
  
  // Calculate spent amounts for current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const budgetsWithSpent = budgets.map(budget => {
    const spent = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE user_id = ? AND category = ? AND type = 'expense' AND date BETWEEN ? AND ?
    `).get(req.user.id, budget.category, monthStart, monthEnd);
    
    return { ...budget, spent: spent.total };
  });
  
  res.json(budgetsWithSpent);
});

app.post('/api/budgets', authenticateToken, (req, res) => {
  const { category, allocated, currency, period } = req.body;
  
  const result = db.prepare('INSERT INTO budgets (user_id, category, allocated, currency, period) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, category, allocated, currency || req.user.default_currency, period || 'monthly');
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/budgets/:id', authenticateToken, (req, res) => {
  const { category, allocated, currency } = req.body;
  
  db.prepare('UPDATE budgets SET category = ?, allocated = ?, currency = ? WHERE id = ? AND user_id = ?')
    .run(category, allocated, currency, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/budgets/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE budgets SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// FINANCE: FINANCIAL GOALS ENDPOINTS
// ============================================================================

app.get('/api/financial-goals', authenticateToken, (req, res) => {
  const goals = db.prepare('SELECT * FROM financial_goals WHERE user_id = ? AND active = 1 ORDER BY target_date').all(req.user.id);
  res.json(goals);
});

app.post('/api/financial-goals', authenticateToken, (req, res) => {
  const { name, target_amount, current_amount, currency, target_date } = req.body;
  
  const result = db.prepare('INSERT INTO financial_goals (user_id, name, target_amount, current_amount, currency, target_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, target_amount, current_amount || 0, currency || req.user.default_currency, target_date || null);
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/financial-goals/:id', authenticateToken, (req, res) => {
  const { name, target_amount, current_amount, currency, target_date } = req.body;
  
  db.prepare('UPDATE financial_goals SET name = ?, target_amount = ?, current_amount = ?, currency = ?, target_date = ? WHERE id = ? AND user_id = ?')
    .run(name, target_amount, current_amount, currency, target_date, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/financial-goals/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE financial_goals SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// REPORTS/ANALYTICS ENDPOINTS
// ============================================================================

app.get('/api/reports/weekly-alignment', authenticateToken, (req, res) => {
  const { week_start } = req.query;
  const start = week_start || getWeekStart(new Date().toISOString().split('T')[0]);
  const end = getWeekEnd(start);
  
  // Get all commitments
  const commitments = db.prepare('SELECT * FROM commitments WHERE user_id = ? AND active = 1').all(req.user.id);
  
  // Get check-ins for the week
  const checkins = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ?').all(req.user.id, start, end);
  
  // Calculate alignment per domain
  const domains = db.prepare('SELECT * FROM domains WHERE user_id = ? AND active = 1').all(req.user.id);
  
  const alignment = {};
  domains.forEach(domain => {
    const domainCommitments = commitments.filter(c => c.domain_key === domain.key);
    let totalPossible = 0;
    let totalDone = 0;
    
    domainCommitments.forEach(c => {
      const freq = c.frequency === 'daily' ? 7 : c.frequency === '3x/week' ? 3 : 1;
      totalPossible += freq;
      
      const doneCount = checkins.filter(ch => ch.commitment_id === c.id && ch.status === 'done').length;
      totalDone += Math.min(doneCount, freq);
    });
    
    alignment[domain.key] = {
      domain: domain.name,
      percentage: totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0,
      completed: totalDone,
      total: totalPossible
    };
  });
  
  res.json({ week_start: start, week_end: end, alignment });
});

app.get('/api/reports/monthly-summary', authenticateToken, (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const m = parseInt(month) || new Date().getMonth() + 1;
  
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd = new Date(y, m, 0).toISOString().split('T')[0];
  
  // Commitment stats
  const checkins = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ?').all(req.user.id, monthStart, monthEnd);
  const doneCount = checkins.filter(c => c.status === 'done').length;
  const skipCount = checkins.filter(c => c.status === 'skip').length;
  const missCount = checkins.filter(c => c.status === 'miss').length;
  
  // Finance stats
  const income = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = ? AND date BETWEEN ? AND ?')
    .get(req.user.id, 'income', monthStart, monthEnd).total;
  const expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = ? AND date BETWEEN ? AND ?')
    .get(req.user.id, 'expense', monthStart, monthEnd).total;
  
  // Daily completion data for heatmap
  const dailyData = {};
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayCheckins = checkins.filter(c => c.date === dateStr);
    dailyData[dateStr] = {
      done: dayCheckins.filter(c => c.status === 'done').length,
      skip: dayCheckins.filter(c => c.status === 'skip').length,
      miss: dayCheckins.filter(c => c.status === 'miss').length
    };
  }
  
  res.json({
    period: { year: y, month: m, start: monthStart, end: monthEnd },
    commitments: { done: doneCount, skip: skipCount, miss: missCount, total: checkins.length },
    finance: { income, expenses, net: income - expenses, savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0 },
    daily: dailyData
  });
});

app.get('/api/reports/streak', authenticateToken, (req, res) => {
  const checkins = db.prepare('SELECT DISTINCT date FROM checkins WHERE user_id = ? AND status = ? ORDER BY date DESC').all(req.user.id, 'done');
  
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    if (checkins.some(c => c.date === dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  
  res.json({ streak });
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '3.0.0' });
});

// ============================================================================
// SERVE FRONTEND
// ============================================================================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎯 Tracker v3.0.0 running on port ${PORT}`);
  console.log(`   Navigation: Commitments | Finance | Reports | Profile`);
  console.log(`   Database: /opt/habit-tracker/data/tracker.db`);
});