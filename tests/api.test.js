const request = require('supertest');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Test database path
const TEST_DB = path.join(__dirname, '../data/test-tracker.db');

// Import app without starting server
let app, db;

beforeAll(() => {
  // Create test database
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = TEST_DB;
  
  // Import server
  delete require.cache[require.resolve('../server.js')];
  const server = require('../server.js');
  app = server.app;
  db = server.db;
});

afterAll(() => {
  if (db) db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('Authentication', () => {
  test('POST /api/register - should create new user', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'testuser',
        password: 'test123',
        display_name: 'Test User'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('testuser');
    expect(res.body.user.display_name).toBe('Test User');
  });

  test('POST /api/register - should reject duplicate username', async () => {
    await request(app)
      .post('/api/register')
      .send({
        username: 'duplicate',
        password: 'test123',
        display_name: 'User One'
      });

    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'duplicate',
        password: 'test456',
        display_name: 'User Two'
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Username already exists');
  });

  test('POST /api/login - should authenticate valid credentials', async () => {
    await request(app)
      .post('/api/register')
      .send({
        username: 'loginuser',
        password: 'password123',
        display_name: 'Login User'
      });

    const res = await request(app)
      .post('/api/login')
      .send({
        username: 'loginuser',
        password: 'password123'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/login - should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({
        username: 'loginuser',
        password: 'wrongpassword'
      });
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

describe('Domains', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'domainuser',
        password: 'test123',
        display_name: 'Domain User'
      });
    token = res.body.token;
  });

  test('GET /api/domains - should return default 5 domains', async () => {
    const res = await request(app)
      .get('/api/domains')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);
    expect(res.body[0]).toHaveProperty('key');
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('icon');
  });

  test('GET /api/domains - should require authentication', async () => {
    const res = await request(app)
      .get('/api/domains');
    
    expect(res.status).toBe(401);
  });
});

describe('Commitments', () => {
  let token, userId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'commituser',
        password: 'test123',
        display_name: 'Commit User'
      });
    token = res.body.token;
    userId = res.body.user.id;
  });

  test('POST /api/commitments - should create commitment', async () => {
    const res = await request(app)
      .post('/api/commitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        domain_key: 'health',
        text: 'Drink 8 glasses of water',
        frequency: 'daily'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.commitment.text).toBe('Drink 8 glasses of water');
  });

  test('GET /api/commitments - should return user commitments', async () => {
    const res = await request(app)
      .get('/api/commitments')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.commitments).toBeDefined();
    expect(res.body.commitments.length).toBeGreaterThan(0);
  });
});

describe('Finance - Accounts', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'financeuser',
        password: 'test123',
        display_name: 'Finance User'
      });
    token = res.body.token;
  });

  test('POST /api/accounts - should create account with bank', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Salary Account',
        bank: 'Sterling',
        type: 'checking',
        balance: 10000,
        currency: 'NGN'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/accounts - should require bank field', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Account',
        type: 'checking',
        balance: 5000
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bank is required');
  });

  test('GET /api/accounts - should return grouped accounts', async () => {
    const res = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.accounts).toBeDefined();
    expect(res.body.grouped).toBeDefined();
  });
});

describe('Finance - Transfers', () => {
  let token, account1Id, account2Id;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/register')
      .send({
        username: 'transferuser',
        password: 'test123',
        display_name: 'Transfer User'
      });
    token = registerRes.body.token;

    // Create two accounts
    const acc1 = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Account 1',
        bank: 'Kuda',
        type: 'checking',
        balance: 5000,
        currency: 'NGN'
      });
    account1Id = acc1.body.id;

    const acc2 = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Account 2',
        bank: 'Zenith',
        type: 'savings',
        balance: 1000,
        currency: 'NGN'
      });
    account2Id = acc2.body.id;
  });

  test('POST /api/transactions - should transfer between accounts', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: new Date().toISOString().split('T')[0],
        type: 'transfer',
        category: 'Transfer',
        amount: 3000,
        account_id: account1Id,
        to_account_id: account2Id,
        description: 'Test transfer',
        currency: 'NGN'
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Transfer should maintain net total', async () => {
    const accountsRes = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);
    
    const totalBalance = accountsRes.body.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    expect(totalBalance).toBe(6000); // 5000 + 1000 initial balances maintained
  });

  test('Balances should update correctly after transfer', async () => {
    const accountsRes = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`);
    
    const acc1 = accountsRes.body.accounts.find(a => a.id === account1Id);
    const acc2 = accountsRes.body.accounts.find(a => a.id === account2Id);
    
    expect(acc1.balance).toBe(2000); // 5000 - 3000
    expect(acc2.balance).toBe(4000); // 1000 + 3000
  });
});
