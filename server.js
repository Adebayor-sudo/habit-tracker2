const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const JSON_LIMIT = process.env.JSON_LIMIT || '1mb';
const CORS_ORIGINS = process.env.CORS_ORIGINS || '';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

const DB_PATH = process.env.DB_PATH || '/opt/habit-tracker/data/tracker.db';
const db = new Database(DB_PATH);

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const dbRecordCount = new client.Gauge({
  name: 'db_records_total',
  help: 'Total number of records in database',
  labelNames: ['table']
});

const activeSessionsGauge = new client.Gauge({
  name: 'active_sessions_total',
  help: 'Number of active sessions'
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(dbRecordCount);
register.registerMetric(activeSessionsGauge);

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
    bank TEXT NOT NULL,
    type TEXT DEFAULT 'checking',
    currency TEXT DEFAULT 'USD',
    balance REAL DEFAULT 0,
    role TEXT DEFAULT 'spending',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Daily income entries
  CREATE TABLE IF NOT EXISTS income_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    date DATE NOT NULL,
    rate REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  -- Transactions table
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    to_account_id INTEGER,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer', 'conversion')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    converted_amount REAL,
    exchange_rate REAL,
    description TEXT,
    deleted_at DATETIME,
    deleted_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id)
  );

  -- Transaction history table for edit audit trail
  CREATE TABLE IF NOT EXISTS transaction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    to_account_id INTEGER,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT,
    converted_amount REAL,
    exchange_rate REAL,
    description TEXT,
    action TEXT NOT NULL CHECK(action IN ('create', 'edit', 'delete', 'restore')),
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Exchange rates cache table
  CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(base_currency, target_currency)
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

// Add columns for v3.1 finance system
try { db.exec('ALTER TABLE accounts ADD COLUMN bank TEXT DEFAULT ""'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id)'); } catch(e) {}

// Add columns for v3.2 multi-currency conversion
try { db.exec('ALTER TABLE transactions ADD COLUMN converted_amount REAL'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN exchange_rate REAL'); } catch(e) {}

// Add columns for v3.3 account roles
try { db.exec('ALTER TABLE accounts ADD COLUMN role TEXT DEFAULT "spending"'); } catch(e) {}

// Add columns for v3.4 transaction audit
try { db.exec('ALTER TABLE transactions ADD COLUMN deleted_at DATETIME'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN deleted_reason TEXT'); } catch(e) {}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const USERNAME_REGEX = /^[A-Za-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 6;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
};

// App version/build ID - changes on every server restart
const APP_BUILD_ID = Date.now().toString(36);

// Exchange rate cache (memory + DB for persistence)
let exchangeRateCache = {};

// ============================================================================
// EXCHANGE RATE FUNCTIONS
// ============================================================================

async function fetchExchangeRate(baseCurrency, targetCurrency) {
  if (baseCurrency === targetCurrency) return 1;
  
  const cacheKey = `${baseCurrency}_${targetCurrency}`;
  
  // Check memory cache first
  if (exchangeRateCache[cacheKey]) {
    const cached = exchangeRateCache[cacheKey];
    const hourAgo = Date.now() - (60 * 60 * 1000);
    if (cached.timestamp > hourAgo) {
      return cached.rate;
    }
  }
  
  // Check DB cache
  try {
    const dbCached = db.prepare(`
      SELECT rate FROM exchange_rates 
      WHERE base_currency = ? AND target_currency = ? 
      AND fetched_at > datetime('now', '-1 hour')
    `).get(baseCurrency, targetCurrency);
    
    if (dbCached) {
      exchangeRateCache[cacheKey] = { rate: dbCached.rate, timestamp: Date.now() };
      return dbCached.rate;
    }
  } catch (err) {}
  
  // Fetch from API
  try {
    // Using exchangerate.host (completely free, no API key required)
    const response = await fetch(`https://api.exchangerate.host/convert?from=${baseCurrency}&to=${targetCurrency}`);
    
    if (!response.ok) {
      console.error(`Exchange rate fetch failed: ${response.status}`);
      return 1; // Fallback to 1:1 if API fails
    }
    
    const data = await response.json();
    
    if (!data.success || !data.result) {
      console.error('Exchange rate API error:', data);
      return 1;
    }
    
    const rate = data.result;
    
    // Store in DB
    try {
      db.prepare(`
        INSERT OR REPLACE INTO exchange_rates (base_currency, target_currency, rate, fetched_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(baseCurrency, targetCurrency, rate);
    } catch (err) {}
    
    // Store in memory cache
    exchangeRateCache[cacheKey] = { rate, timestamp: Date.now() };
    
    return rate;
  } catch (err) {
    console.error('Exchange rate fetch error:', err.message);
    return 1; // Fallback to 1:1 if network error
  }
}

async function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency || !fromCurrency || !toCurrency) {
    return { converted: amount, rate: 1 };
  }
  
  try {
    const rate = await fetchExchangeRate(fromCurrency, toCurrency);
    return { converted: amount * rate, rate };
  } catch (err) {
    console.error('Currency conversion error:', err);
    return { converted: amount, rate: 1 };
  }
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('$2')) {
    return bcrypt.compareSync(password, storedHash);
  }
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  if (legacy === storedHash) return 'legacy-match';
  return false;
}

function validateRegistrationInput({ username, password, display_name }) {
  if (!username || !USERNAME_REGEX.test(username)) {
    return 'Username must be 3-32 characters (letters, numbers, . _ -).';
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!display_name || display_name.trim().length < 2) {
    return 'Display name must be at least 2 characters.';
  }
  return null;
}

function validateLoginInput({ username, password }) {
  if (!username || !password) {
    return 'Username and password are required.';
  }
  return null;
}

function validateCommitmentInput({ domain_key, text, frequency }) {
  if (!domain_key || typeof domain_key !== 'string') return 'Domain is required.';
  if (!text || typeof text !== 'string' || text.trim().length < 2) return 'Commitment text must be at least 2 characters.';
  const allowed = ['daily', '3x/week', '1x/week'];
  if (frequency && !allowed.includes(frequency)) return 'Invalid frequency.';
  return null;
}

function validateAccountInput({ name, bank, type, balance, role }) {
  if (!name || typeof name !== 'string') return 'Account name is required.';
  if (!bank || typeof bank !== 'string') return 'Bank is required';
  const allowedTypes = ['checking', 'savings'];
  if (type && !allowedTypes.includes(type)) return 'Invalid account type.';
  const allowedRoles = ['income', 'conversion', 'spending'];
  if (role && !allowedRoles.includes(role)) return 'Invalid account role.';
  if (balance !== undefined && isNaN(Number(balance))) return 'Balance must be a number.';
  return null;
}

function validateTransactionInput({ type, amount, date, category, account_id, to_account_id }) {
  const allowedTypes = ['income', 'expense', 'transfer', 'conversion'];
  if (!allowedTypes.includes(type)) return 'Invalid transaction type.';
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) return 'Amount must be a non-negative number.';
  if (!date) return 'Date is required.';
  if (!category) return 'Category is required.';
  if ((type === 'income' || type === 'expense') && !account_id) return 'Account is required for this transaction.';
  if (type === 'transfer' || type === 'conversion') {
    if (!account_id || !to_account_id) return 'Both source and destination accounts are required for transfer.';
    if (account_id === to_account_id) return 'Source and destination accounts must differ.';
  }
  return null;
}

function validateBudgetInput({ category, allocated }) {
  if (!category || typeof category !== 'string' || category.trim().length < 2) return 'Category must be at least 2 characters.';
  if (allocated === undefined || isNaN(Number(allocated)) || Number(allocated) < 0) return 'Allocated amount must be a non-negative number.';
  return null;
}

function validateFinancialGoalInput({ name, target_amount }) {
  if (!name || typeof name !== 'string' || name.trim().length < 2) return 'Goal name must be at least 2 characters.';
  if (target_amount === undefined || isNaN(Number(target_amount)) || Number(target_amount) <= 0) return 'Target amount must be a positive number.';
  return null;
}

function validateSufficientBalance(account, amount) {
  // Check if debit transaction would result in negative balance
  const postTransactionBalance = account.balance - amount;
  if (postTransactionBalance < 0) {
    const shortfall = Math.abs(postTransactionBalance);
    return {
      valid: false,
      error: 'Insufficient funds',
      availableBalance: account.balance,
      attemptedAmount: amount,
      shortfall: shortfall
    };
  }
  return { valid: true };
}

// Reverse the balance effects of a transaction
function reverseTransactionEffect(transaction, userId) {
  const { type, amount, account_id, to_account_id } = transaction;
  
  if (type === 'income' && account_id) {
    // Reverse income: debit the account
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
      .run(amount, account_id, userId);
  } else if (type === 'expense' && account_id) {
    // Reverse expense: credit the account
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
      .run(amount, account_id, userId);
  } else if ((type === 'transfer' || type === 'conversion') && account_id && to_account_id) {
    // Reverse transfer: credit source, debit destination
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
      .run(amount, account_id, userId);
    const destAmount = type === 'conversion' ? (transaction.converted_amount || amount) : amount;
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
      .run(destAmount, to_account_id, userId);
  }
}

// Apply the balance effects of a transaction
function applyTransactionEffect(transaction, userId) {
  const { type, amount, account_id, to_account_id } = transaction;
  
  if (type === 'income' && account_id) {
    // Apply income: credit the account
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
      .run(amount, account_id, userId);
  } else if (type === 'expense' && account_id) {
    // Apply expense: debit the account
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
      .run(amount, account_id, userId);
  } else if ((type === 'transfer' || type === 'conversion') && account_id && to_account_id) {
    // Apply transfer: debit source, credit destination
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
      .run(amount, account_id, userId);
    const destAmount = type === 'conversion' ? (transaction.converted_amount || amount) : amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
      .run(destAmount, to_account_id, userId);
  }
}

// Record transaction history entry
function recordTransactionHistory(transaction, action, userId) {
  db.prepare(`
    INSERT INTO transaction_history 
    (transaction_id, user_id, account_id, to_account_id, date, type, category, amount, currency, converted_amount, exchange_rate, description, action)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transaction.id,
    userId,
    transaction.account_id || null,
    transaction.to_account_id || null,
    transaction.date,
    transaction.type,
    transaction.category,
    transaction.amount,
    transaction.currency || 'USD',
    transaction.converted_amount || null,
    transaction.exchange_rate || null,
    transaction.description || '',
    action
  );
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

// Security headers
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "https://cdn.tailwindcss.com",
      "https://unpkg.com",
      "'unsafe-inline'",
      "'unsafe-eval'"
    ],
    "style-src": [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://cdn.tailwindcss.com"
    ],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'self'"],
  }
}));

// CORS allowlist; require explicit origins (fallback to localhost for dev)
const allowedOrigins = CORS_ORIGINS
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOrigins = allowedOrigins.length > 0
  ? allowedOrigins
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: corsOrigins,
}));

// JSON body size limit
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomBytes(8).toString('hex');
  req.requestId = requestId;
  
  // Log request
  const logEntry = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  };
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;
    const duration = Date.now() - start;
    
    // Log response (only for errors or auth endpoints)
    if (res.statusCode >= 400 || req.path.includes('/auth') || req.path.includes('/login') || req.path.includes('/register')) {
      console.log(JSON.stringify({
        ...logEntry,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        user: req.user?.username || 'anonymous'
      }));
    }
    
    return res.send(data);
  };
  
  next();
});

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================

app.post('/api/register', (req, res) => {
  console.log('Register request:', req.body);
  const { username, password, display_name } = req.body;
  const validationError = validateRegistrationInput({ username, password, display_name });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      console.log('Username exists:', username);
      return res.status(400).json({ error: 'Username already exists' });
    }

    const password_hash = hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)').run(username, password_hash, display_name);
    
    // Initialize default domains for new user
    initializeDefaultDomains(result.lastInsertRowid);

    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, token, expires);

    console.log('User registered successfully:', username);
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
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const validationError = validateLoginInput({ username, password });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const verification = user ? verifyPassword(password, user.password_hash) : false;
    if (!user || verification === false) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If legacy hash matched, upgrade to bcrypt
    if (verification === 'legacy-match') {
      const newHash = hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    }

    // Clean up old sessions before issuing a new one
    db.prepare('DELETE FROM sessions WHERE user_id = ? OR expires_at < datetime(\'now\')').run(user.id);

    const token = generateToken();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);

    // Ensure user has domains initialized
    initializeDefaultDomains(user.id);

    return res.json({ 
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
  } catch (err) {
    console.error('Login error:', err.message, err);
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
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
  let domains = db.prepare('SELECT * FROM domains WHERE user_id = ? AND active = 1 ORDER BY sort_order').all(req.user.id);
  
  // Auto-initialize domains if user has none
  if (domains.length === 0) {
    initializeDefaultDomains(req.user.id);
    domains = db.prepare('SELECT * FROM domains WHERE user_id = ? AND active = 1 ORDER BY sort_order').all(req.user.id);
  }
  
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
  const validationError = validateCommitmentInput({ domain_key, text, frequency });
  if (validationError) return res.status(400).json({ error: validationError });
  
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM commitments WHERE user_id = ? AND domain_key = ?').get(req.user.id, domain_key);
  const sort_order = (maxOrder.max || 0) + 1;
  
  const result = db.prepare('INSERT INTO commitments (user_id, domain_key, text, frequency, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, domain_key, text, frequency || 'daily', sort_order);
  
  const commitment = db.prepare('SELECT * FROM commitments WHERE id = ?').get(result.lastInsertRowid);
  res.json({ success: true, commitment });
});

app.put('/api/commitments/:id', authenticateToken, (req, res) => {
  const { text, frequency, sort_order } = req.body;
  const validationError = validateCommitmentInput({ domain_key: 'noop', text, frequency });
  if (validationError) return res.status(400).json({ error: validationError });
  
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
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND active = 1 ORDER BY bank, name').all(req.user.id);
  
  // Group accounts by bank
  const grouped = {};
  accounts.forEach(acc => {
    if (!grouped[acc.bank]) grouped[acc.bank] = [];
    grouped[acc.bank].push(acc);
  });
  
  res.json({ accounts, grouped });
});

app.post('/api/accounts', authenticateToken, (req, res) => {
  const { name, bank, type, currency, balance, role } = req.body;
  const validationError = validateAccountInput({ name, bank, type, balance, role });
  if (validationError) return res.status(400).json({ error: validationError });
  
  const result = db.prepare('INSERT INTO accounts (user_id, name, bank, type, currency, balance, role) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, bank, type || 'checking', currency || req.user.default_currency, balance || 0, role || 'spending');
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/accounts/:id', authenticateToken, (req, res) => {
  const { name, bank, type, currency, balance, role } = req.body;
  const validationError = validateAccountInput({ name, bank, type, balance, role });
  if (validationError) return res.status(400).json({ error: validationError });
  
  db.prepare('UPDATE accounts SET name = ?, bank = ?, type = ?, currency = ?, balance = ?, role = ? WHERE id = ? AND user_id = ?')
    .run(name, bank, type, currency, balance, role, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/accounts/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE accounts SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// FINANCE: DAILY INCOME ENDPOINTS
// ============================================================================

app.post('/api/income', authenticateToken, (req, res) => {
  const { date, account_id, rate, notes } = req.body;
  
  if (!date) return res.status(400).json({ error: 'Date is required' });
  if (!account_id) return res.status(400).json({ error: 'Account is required' });
  if (isNaN(Number(rate)) || Number(rate) < 0) return res.status(400).json({ error: 'Rate must be a non-negative number' });
  
  // Verify account belongs to user and has income role
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.role !== 'income') return res.status(400).json({ error: 'Account must have income role' });
  
  const result = db.prepare(`
    INSERT INTO income_entries (user_id, account_id, date, rate, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET rate = ?, notes = ?
  `).run(req.user.id, account_id, date, rate, notes || null, rate, notes || null);
  
  // Update account balance (add daily income)
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
    .run(rate, account_id, req.user.id);
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/income', authenticateToken, (req, res) => {
  const { start_date, end_date, account_id } = req.query;
  
  let query = 'SELECT * FROM income_entries WHERE user_id = ?';
  const params = [req.user.id];
  
  if (start_date && end_date) {
    query += ' AND date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }
  
  if (account_id) {
    query += ' AND account_id = ?';
    params.push(account_id);
  }
  
  query += ' ORDER BY date DESC';
  
  const entries = db.prepare(query).all(...params);
  
  // Calculate total income for period
  const total = entries.reduce((sum, e) => sum + e.rate, 0);
  const workDays = entries.length;
  
  res.json({ entries, total, workDays });
});

app.delete('/api/income/:id', authenticateToken, (req, res) => {
  const entry = db.prepare('SELECT * FROM income_entries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Income entry not found' });
  
  // Reverse the balance update
  db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
    .run(entry.rate, entry.account_id, req.user.id);
  
  db.prepare('DELETE FROM income_entries WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// FINANCE: TRANSACTIONS ENDPOINTS
// ============================================================================

app.get('/api/transactions', authenticateToken, (req, res) => {
  const { start_date, end_date, type, category, account_id, limit, offset } = req.query;
  
  let query = `
    SELECT t.*, 
           a.name as account_name, a.bank as account_bank,
           ta.name as to_account_name, ta.bank as to_account_bank
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    WHERE t.user_id = ? AND t.deleted_at IS NULL
  `;
  let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ? AND deleted_at IS NULL';
  const params = [req.user.id];
  const countParams = [req.user.id];
  
  if (start_date && end_date) {
    query += ' AND t.date BETWEEN ? AND ?';
    countQuery += ' AND date BETWEEN ? AND ?';
    params.push(start_date, end_date);
    countParams.push(start_date, end_date);
  }
  
  if (type) {
    query += ' AND t.type = ?';
    countQuery += ' AND type = ?';
    params.push(type);
    countParams.push(type);
  }
  
  if (category) {
    query += ' AND t.category = ?';
    countQuery += ' AND category = ?';
    params.push(category);
    countParams.push(category);
  }
  
  if (account_id) {
    query += ' AND (t.account_id = ? OR t.to_account_id = ?)';
    countQuery += ' AND (account_id = ? OR to_account_id = ?)';
    params.push(account_id, account_id);
    countParams.push(account_id, account_id);
  }
  
  query += ' ORDER BY t.date DESC, t.id DESC';
  
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

app.get('/api/transactions/trash', authenticateToken, (req, res) => {
  const { limit, offset } = req.query;
  
  let query = `
    SELECT t.*, 
           a.name as account_name, a.bank as account_bank,
           ta.name as to_account_name, ta.bank as to_account_bank
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    WHERE t.user_id = ? AND t.deleted_at IS NOT NULL
    ORDER BY t.deleted_at DESC
  `;
  
  const params = [req.user.id];
  
  if (limit) {
    query += ' LIMIT ?';
    params.push(parseInt(limit));
    if (offset) {
      query += ' OFFSET ?';
      params.push(parseInt(offset));
    }
  }
  
  const transactions = db.prepare(query).all(...params);
  const { total } = db.prepare(
    'SELECT COUNT(*) as total FROM transactions WHERE user_id = ? AND deleted_at IS NOT NULL'
  ).get(req.user.id);
  
  res.json({ transactions, total, limit: parseInt(limit) || null, offset: parseInt(offset) || 0 });
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { account_id, to_account_id, date, type, category, amount, currency, description } = req.body;
  const validationError = validateTransactionInput({ type, amount, date, category, account_id, to_account_id });
  if (validationError) return res.status(400).json({ error: validationError });
  
  try {
    // Validate sufficient balance for debit transactions BEFORE committing
    if ((type === 'expense' || type === 'transfer' || type === 'conversion') && account_id) {
      const sourceAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(account_id, req.user.id);
      if (!sourceAccount) return res.status(404).json({ error: 'Source account not found' });
      
      const balanceCheck = validateSufficientBalance(sourceAccount, amount);
      if (!balanceCheck.valid) {
        return res.status(400).json({
          error: balanceCheck.error,
          availableBalance: balanceCheck.availableBalance,
          attemptedAmount: balanceCheck.attemptedAmount,
          shortfall: balanceCheck.shortfall
        });
      }
    }
    
    // Get user's default currency
    const userCurrency = req.user.default_currency || 'USD';
    const txCurrency = currency || userCurrency;
    
    // Get conversion info if currency differs from user default
    let convertedAmount = amount;
    let exchangeRate = 1;
    
    if (txCurrency !== userCurrency && type !== 'transfer' && type !== 'conversion') {
      const conversion = await convertCurrency(amount, txCurrency, userCurrency);
      convertedAmount = conversion.converted;
      exchangeRate = conversion.rate;
    }
    
    // For conversion type, exchange rate is provided explicitly and we use the original amount
    if (type === 'conversion') {
      exchangeRate = Number(currency) || 1; // currency field temporarily holds the exchange rate for conversions
      convertedAmount = amount * exchangeRate;
    }
    
    // Begin transaction
    db.prepare('BEGIN').run();
    
    // Insert transaction with converted amount and exchange rate
    const result = db.prepare(`
      INSERT INTO transactions 
      (user_id, account_id, to_account_id, date, type, category, amount, currency, converted_amount, exchange_rate, description) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(req.user.id, account_id || null, to_account_id || null, date, type, category, amount, txCurrency, 
           convertedAmount, exchangeRate, description || '');
    
    // Update account balances
    if (type === 'income' && account_id) {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
        .run(amount, account_id, req.user.id);
    } else if (type === 'expense' && account_id) {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
        .run(amount, account_id, req.user.id);
    } else if ((type === 'transfer' || type === 'conversion') && account_id && to_account_id) {
      // Deduct from source account
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?')
        .run(amount, account_id, req.user.id);
      // Add to destination account (use converted amount for conversions)
      const targetAmount = type === 'conversion' ? convertedAmount : amount;
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?')
        .run(targetAmount, to_account_id, req.user.id);
    }
    
    db.prepare('COMMIT').run();
    
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, transaction });
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    res.status(500).json({ error: 'Transaction failed: ' + err.message });
  }
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  const { account_id, to_account_id, date, type, category, amount, currency, description } = req.body;
  const validationError = validateTransactionInput({ type, amount, date, category, account_id, to_account_id });
  if (validationError) return res.status(400).json({ error: validationError });
  
  try {
    // Get the existing transaction
    const existingTx = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    
    if (!existingTx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Start transaction
    db.prepare('BEGIN').run();
    
    try {
      // 1. Reverse the old transaction effect
      reverseTransactionEffect(existingTx, req.user.id);
      
      // 2. Validate the new transaction would not cause negative balance
      if ((type === 'expense' || type === 'transfer' || type === 'conversion') && account_id) {
        const sourceAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
          .get(account_id, req.user.id);
        
        if (!sourceAccount) {
          db.prepare('ROLLBACK').run();
          return res.status(404).json({ error: 'Source account not found' });
        }
        
        const balanceCheck = validateSufficientBalance(sourceAccount, amount);
        if (!balanceCheck.valid) {
          db.prepare('ROLLBACK').run();
          return res.status(400).json({
            error: balanceCheck.error,
            availableBalance: balanceCheck.availableBalance,
            attemptedAmount: balanceCheck.attemptedAmount,
            shortfall: balanceCheck.shortfall
          });
        }
      }
      
      // 3. Handle currency conversion for new transaction
      const userCurrency = req.user.default_currency || 'USD';
      const txCurrency = currency || userCurrency;
      let convertedAmount = amount;
      let exchangeRate = 1;
      
      if (txCurrency !== userCurrency && type !== 'transfer' && type !== 'conversion') {
        const conversion = await convertCurrency(amount, txCurrency, userCurrency);
        convertedAmount = conversion.converted;
        exchangeRate = conversion.rate;
      }
      
      if (type === 'conversion') {
        exchangeRate = Number(currency) || 1;
        convertedAmount = amount * exchangeRate;
      }
      
      // 4. Update the transaction record
      db.prepare(`
        UPDATE transactions 
        SET account_id = ?, to_account_id = ?, date = ?, type = ?, category = ?, 
            amount = ?, currency = ?, converted_amount = ?, exchange_rate = ?, description = ?
        WHERE id = ? AND user_id = ?
      `).run(
        account_id || null, 
        to_account_id || null, 
        date, 
        type, 
        category, 
        amount, 
        txCurrency,
        convertedAmount,
        exchangeRate,
        description || '',
        req.params.id, 
        req.user.id
      );
      
      // 5. Apply the new transaction effect
      const updatedTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      applyTransactionEffect(updatedTx, req.user.id);
      
      // 6. Record the edit in transaction history
      recordTransactionHistory(updatedTx, 'edit', req.user.id);
      
      db.prepare('COMMIT').run();
      
      res.json({ success: true, transaction: updatedTx });
    } catch (err) {
      db.prepare('ROLLBACK').run();
      throw err;
    }
  } catch (err) {
    console.error('Transaction edit error:', err);
    res.status(500).json({ error: 'Transaction edit failed: ' + err.message });
  }
});

app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  try {
    // Get the transaction to delete
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Start database transaction
    db.prepare('BEGIN').run();
    
    try {
      // 1. Reverse the transaction's balance effect
      reverseTransactionEffect(transaction, req.user.id);
      
      // 2. Mark as deleted (soft delete)
      const deletedAt = new Date().toISOString();
      const deletedReason = req.body.reason || 'User deleted';
      
      db.prepare('UPDATE transactions SET deleted_at = ?, deleted_reason = ? WHERE id = ? AND user_id = ?')
        .run(deletedAt, deletedReason, req.params.id, req.user.id);
      
      // 3. Record in transaction history
      recordTransactionHistory(transaction, 'delete', req.user.id);
      
      db.prepare('COMMIT').run();
      
      res.json({ success: true, message: 'Transaction moved to trash' });
    } catch (err) {
      db.prepare('ROLLBACK').run();
      throw err;
    }
  } catch (err) {
    console.error('Transaction delete error:', err);
    res.status(500).json({ error: 'Transaction delete failed: ' + err.message });
  }
});

app.post('/api/transactions/:id/restore', authenticateToken, (req, res) => {
  try {
    // Get the deleted transaction
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL')
      .get(req.params.id, req.user.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Deleted transaction not found' });
    }
    
    // Start database transaction
    db.prepare('BEGIN').run();
    
    try {
      // 1. Validate that restoring would not cause negative balance
      if ((transaction.type === 'expense' || transaction.type === 'transfer' || transaction.type === 'conversion') && transaction.account_id) {
        const sourceAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
          .get(transaction.account_id, req.user.id);
        
        if (!sourceAccount) {
          db.prepare('ROLLBACK').run();
          return res.status(404).json({ error: 'Source account not found' });
        }
        
        const balanceCheck = validateSufficientBalance(sourceAccount, transaction.amount);
        if (!balanceCheck.valid) {
          db.prepare('ROLLBACK').run();
          return res.status(400).json({
            error: 'Cannot restore: ' + balanceCheck.error,
            availableBalance: balanceCheck.availableBalance,
            attemptedAmount: balanceCheck.attemptedAmount,
            shortfall: balanceCheck.shortfall
          });
        }
      }
      
      // 2. Reapply the transaction's balance effect
      applyTransactionEffect(transaction, req.user.id);
      
      // 3. Clear the deleted flags
      db.prepare('UPDATE transactions SET deleted_at = NULL, deleted_reason = NULL WHERE id = ? AND user_id = ?')
        .run(req.params.id, req.user.id);
      
      // 4. Record in transaction history
      recordTransactionHistory(transaction, 'restore', req.user.id);
      
      db.prepare('COMMIT').run();
      
      const restoredTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
      res.json({ success: true, transaction: restoredTx, message: 'Transaction restored' });
    } catch (err) {
      db.prepare('ROLLBACK').run();
      throw err;
    }
  } catch (err) {
    console.error('Transaction restore error:', err);
    res.status(500).json({ error: 'Transaction restore failed: ' + err.message });
  }
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
  const validationError = validateBudgetInput({ category, allocated });
  if (validationError) return res.status(400).json({ error: validationError });
  
  const result = db.prepare('INSERT INTO budgets (user_id, category, allocated, currency, period) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, category, allocated, currency || req.user.default_currency, period || 'monthly');
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/budgets/:id', authenticateToken, (req, res) => {
  const { category, allocated, currency } = req.body;
  const validationError = validateBudgetInput({ category, allocated });
  if (validationError) return res.status(400).json({ error: validationError });
  
  db.prepare('UPDATE budgets SET category = ?, allocated = ?, currency = ? WHERE id = ? AND user_id = ?')
    .run(category, allocated, currency, req.params.id, req.user.id);
  
  res.json({ success: true });
});

app.delete('/api/budgets/:id', authenticateToken, (req, res) => {
  db.prepare('UPDATE budgets SET active = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ============================================================================
// FINANCE: EXCHANGE RATES ENDPOINTS
// ============================================================================

app.get('/api/exchange-rate', authenticateToken, async (req, res) => {
  const { from, to } = req.query;
  
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to currencies required' });
  }
  
  try {
    const rate = await fetchExchangeRate(from, to);
    res.json({ from, to, rate, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Exchange rate fetch failed: ' + err.message });
  }
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
  const validationError = validateFinancialGoalInput({ name, target_amount });
  if (validationError) return res.status(400).json({ error: validationError });
  
  const result = db.prepare('INSERT INTO financial_goals (user_id, name, target_amount, current_amount, currency, target_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, target_amount, current_amount || 0, currency || req.user.default_currency, target_date || null);
  
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/financial-goals/:id', authenticateToken, (req, res) => {
  const { name, target_amount, current_amount, currency, target_date } = req.body;
  const validationError = validateFinancialGoalInput({ name, target_amount });
  if (validationError) return res.status(400).json({ error: validationError });
  
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

app.get('/api/reports/net-worth', authenticateToken, async (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND active = 1').all(req.user.id);
    const userCurrency = req.user.default_currency || 'USD';
    
    let totalNormalized = 0;
    const accountsWithNormalized = [];
    
    for (const acc of accounts) {
      let normalized = acc.balance;
      
      // Convert to user's default currency if different
      if (acc.currency !== userCurrency) {
        const rate = await fetchExchangeRate(acc.currency, userCurrency);
        normalized = acc.balance * rate;
      }
      
      accountsWithNormalized.push({
        ...acc,
        normalizedBalance: normalized
      });
      
      totalNormalized += normalized;
    }
    
    // Get latest income for the month
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const incomeEntries = db.prepare(`
      SELECT COALESCE(SUM(rate), 0) as total 
      FROM income_entries 
      WHERE user_id = ? AND date BETWEEN ? AND ?
    `).get(req.user.id, monthStart, monthEnd);
    
    const expenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ?
    `).get(req.user.id, monthStart, monthEnd);
    
    res.json({
      totalNetWorth: totalNormalized,
      currency: userCurrency,
      accounts: accountsWithNormalized,
      monthlyIncome: incomeEntries.total,
      monthlyExpenses: expenses.total,
      monthlyNet: incomeEntries.total - expenses.total
    });
  } catch (err) {
    res.status(500).json({ error: 'Net worth calculation failed: ' + err.message });
  }
});

app.get('/api/reports/income-summary', authenticateToken, (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const m = parseInt(month) || new Date().getMonth() + 1;
  
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd = new Date(y, m, 0).toISOString().split('T')[0];
  
  const entries = db.prepare(`
    SELECT * FROM income_entries 
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date DESC
  `).all(req.user.id, monthStart, monthEnd);
  
  const totalDays = new Date(y, m, 0).getDate();
  const workedDays = entries.length;
  const potentialDays = Math.floor(totalDays * 5 / 7); // Approximate working days in month
  const totalIncome = entries.reduce((sum, e) => sum + e.rate, 0);
  
  res.json({
    period: { year: y, month: m, start: monthStart, end: monthEnd },
    entries,
    workedDays,
    potentialDays,
    totalIncome,
    dailyRate: entries.length > 0 ? totalIncome / entries.length : 0,
    missedDays: potentialDays - workedDays
  });
});

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

app.get('/api/reports/audit-trail', authenticateToken, (req, res) => {
  const { start_date, end_date } = req.query;
  
  // Get deleted transaction stats
  let deletedQuery = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND deleted_at IS NOT NULL';
  const params = [req.user.id];
  
  if (start_date && end_date) {
    deletedQuery += ' AND deleted_at BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }
  
  const deletedCount = db.prepare(deletedQuery).get(...params).count;
  
  // Get deletion reasons breakdown
  const deletionReasons = db.prepare(`
    SELECT deleted_reason, COUNT(*) as count 
    FROM transactions 
    WHERE user_id = ? AND deleted_at IS NOT NULL 
    GROUP BY deleted_reason
  `).all(req.user.id);
  
  // Get edit frequency (from transaction_history)
  const editCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM transaction_history 
    WHERE user_id = ? AND action = 'edit'
  `).get(req.user.id).count;
  
  // Get most edited transactions
  const mostEdited = db.prepare(`
    SELECT 
      th.transaction_id,
      COUNT(*) as edit_count,
      t.description,
      t.category
    FROM transaction_history th
    LEFT JOIN transactions t ON th.transaction_id = t.id
    WHERE th.user_id = ? AND th.action = 'edit'
    GROUP BY th.transaction_id
    ORDER BY edit_count DESC
    LIMIT 10
  `).all(req.user.id);
  
  res.json({
    deletedCount,
    deletionReasons,
    editCount,
    mostEdited,
    period: { start: start_date || 'all', end: end_date || 'now' }
  });
});

// ============================================================================
// MAINTENANCE ENDPOINTS
// ============================================================================

app.post('/api/maintenance/cleanup-sessions', (req, res) => {
  try {
    const result = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    res.json({ success: true, deleted: result.changes, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed: ' + err.message });
  }
});

app.post('/api/maintenance/vacuum', (req, res) => {
  try {
    db.exec('VACUUM');
    res.json({ success: true, message: 'Database vacuumed', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Vacuum failed: ' + err.message });
  }
});

app.post('/api/maintenance/analyze', (req, res) => {
  try {
    db.exec('ANALYZE');
    res.json({ success: true, message: 'Database analyzed', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Analyze failed: ' + err.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '3.0.0' });
});

app.get('/api/readiness', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ready: true, db: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

app.get('/api/app-version', (req, res) => {
  res.json({ buildId: APP_BUILD_ID, timestamp: new Date().toISOString() });
});

app.get('/api/metrics', (req, res) => {
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  let totals = { users: 0, accounts: 0, commitments: 0, transactions: 0 };
  try {
    totals = {
      users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      accounts: db.prepare('SELECT COUNT(*) as c FROM accounts').get().c,
      commitments: db.prepare('SELECT COUNT(*) as c FROM commitments').get().c,
      transactions: db.prepare('SELECT COUNT(*) as c FROM transactions').get().c,
    };
  } catch (err) {
    // Best effort; don't fail metrics
  }
  res.json({
    uptime_seconds: uptime,
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    db_path: DB_PATH,
    totals,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/metrics/prometheus', async (req, res) => {
  try {
    // Update database metrics
    const counts = {
      users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      accounts: db.prepare('SELECT COUNT(*) as c FROM accounts').get().c,
      commitments: db.prepare('SELECT COUNT(*) as c FROM commitments').get().c,
      transactions: db.prepare('SELECT COUNT(*) as c FROM transactions').get().c,
      sessions: db.prepare("SELECT COUNT(*) as c FROM sessions WHERE expires_at > datetime('now')").get().c
    };
    
    Object.entries(counts).forEach(([table, count]) => {
      dbRecordCount.set({ table }, count);
    });
    
    activeSessionsGauge.set(counts.sessions);
    
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).json({ error: 'Metrics collection failed: ' + err.message });
  }
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

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎯 Tracker v3.0.0 running on port ${PORT}`);
    console.log(`   Navigation: Commitments | Finance | Reports | Profile`);
    console.log(`   Database: ${DB_PATH}`);
  });
}

// Export for testing
module.exports = { app, db };