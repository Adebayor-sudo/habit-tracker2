const request = require('supertest');
const { app, db } = require('../server');

describe('Balance Validation - Negative Balance Prevention', () => {
  let token;
  let userId;
  let accountId;

  beforeAll(async () => {
    // Register and login
    const registerRes = await request(app)
      .post('/api/register')
      .send({
        username: `balancetest_${Date.now()}`,
        password: 'TestPassword123',
        display_name: 'Balance Tester'
      });

    token = registerRes.body.token;
    userId = registerRes.body.user.id;

    // Create a spending account with limited balance
    const accountRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Spending Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 1000,
        role: 'spending'
      });

    accountId = accountRes.body.id;
  });

  test('Should allow expense that equals available balance', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: accountId,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category: 'Testing',
        amount: 1000,
        description: 'Spend entire balance'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction).toBeDefined();
  });

  test('Should reject expense that exceeds available balance', async () => {
    // Create a fresh account with small balance
    const accountRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Limited Balance Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 500,
        role: 'spending'
      });

    const newAccountId = accountRes.body.id;

    // Attempt to spend more than available
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: newAccountId,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category: 'Testing',
        amount: 750,
        description: 'Attempt to overspend'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient funds');
    expect(res.body.availableBalance).toBe(500);
    expect(res.body.attemptedAmount).toBe(750);
    expect(res.body.shortfall).toBe(250);
  });

  test('Should reject transfer that exceeds available balance', async () => {
    // Create two accounts
    const acc1Res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Source Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 100,
        role: 'spending'
      });

    const acc2Res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Dest Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 0,
        role: 'spending'
      });

    const sourceAccountId = acc1Res.body.id;
    const destAccountId = acc2Res.body.id;

    // Attempt transfer exceeding source balance
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: sourceAccountId,
        to_account_id: destAccountId,
        date: new Date().toISOString().split('T')[0],
        type: 'transfer',
        category: 'Transfer',
        amount: 250,
        description: 'Transfer exceeding balance'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient funds');
    expect(res.body.availableBalance).toBe(100);
    expect(res.body.attemptedAmount).toBe(250);
    expect(res.body.shortfall).toBe(150);
  });

  test('Should reject conversion that exceeds available balance', async () => {
    // Create account for conversion
    const accRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'USD Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 100,
        role: 'spending'
      });

    const usdAccountId = accRes.body.id;

    // Create destination NGN account
    const ngnAccRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'NGN Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'NGN',
        balance: 0,
        role: 'spending'
      });

    const ngnAccountId = ngnAccRes.body.id;

    // Attempt conversion exceeding balance
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: usdAccountId,
        to_account_id: ngnAccountId,
        date: new Date().toISOString().split('T')[0],
        type: 'conversion',
        category: 'Conversion',
        amount: 500,
        currency: 1650, // Exchange rate (temporarily held in currency field for conversions)
        description: 'Currency conversion'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient funds');
    expect(res.body.availableBalance).toBe(100);
    expect(res.body.attemptedAmount).toBe(500);
    expect(res.body.shortfall).toBe(400);
  });

  test('Should allow income transaction (no balance check needed)', async () => {
    // Create income account
    const incomeAccRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Income Account',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 0,
        role: 'income'
      });

    const incomeAccountId = incomeAccRes.body.id;

    // Income should work regardless of balance
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: incomeAccountId,
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        category: 'Salary',
        amount: 5000,
        description: 'Monthly salary'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Should never create account with negative balance in database', async () => {
    // Verify no negative balances exist
    const allAccounts = db.prepare(
      'SELECT id, balance FROM accounts WHERE user_id = ? AND active = 1'
    ).all(userId);

    allAccounts.forEach(acc => {
      expect(acc.balance).toBeGreaterThanOrEqual(0);
    });
  });

  test('Balance check provides clear error details for user feedback', async () => {
    // Create account
    const accRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Error Detail Test',
        bank: 'Test Bank',
        type: 'checking',
        currency: 'USD',
        balance: 1234.56,
        role: 'spending'
      });

    const testAccountId = accRes.body.id;

    // Attempt overspend
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        account_id: testAccountId,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category: 'Testing',
        amount: 2000,
        description: 'Overspend test'
      });

    // Response should include all error details
    expect(res.status).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Insufficient funds',
        availableBalance: 1234.56,
        attemptedAmount: 2000,
        shortfall: 765.44
      })
    );
  });
});
