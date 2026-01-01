#!/usr/bin/env node

/**
 * Transaction Mutations Integration Test Suite
 * Tests editing, deleting, and restoring transactions with balance integrity
 */

const BASE_URL = 'http://localhost:3000';
let authToken = null;
let userId = null;

// Helper to make authenticated API calls
async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}/api${path}`, options);
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  
  return data;
}

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✓ ${message}`);
    testsPassed++;
  }
}

function assertApproxEqual(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`❌ FAIL: ${message} (expected ${expected}, got ${actual}, diff ${diff})`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✓ ${message}`);
    testsPassed++;
  }
}

async function test(name, fn) {
  console.log(`\n🧪 Test: ${name}`);
  try {
    await fn();
    console.log(`✅ PASSED: ${name}`);
  } catch (err) {
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${err.message}`);
    if (err.stack) {
      console.error(`   Stack: ${err.stack.split('\n').slice(1, 3).join('\n')}`);
    }
  }
}

// Setup: Create test user and account
async function setup() {
  console.log('\n🔧 Setting up test environment...');
  
  // Create unique test user
  const username = `testuser_${Date.now()}`;
  const password = 'testpass123';
  const display_name = 'Test User';
  
  try {
    const registerRes = await api('POST', '/register', { username, password, display_name });
    authToken = registerRes.token;
    userId = registerRes.user.id;
    console.log(`✓ Created test user: ${username} (ID: ${userId})`);
  } catch (err) {
    console.error('Failed to register:', err.message);
    process.exit(1);
  }
  
  // Create test account
  const accountRes = await api('POST', '/accounts', {
    name: 'Test Account',
    bank: 'Test Bank',
    type: 'checking',
    balance: 1000,
    currency: 'USD',
    role: 'spending'
  });
  
  const accountId = accountRes.id;
  console.log(`✓ Created test account with $1000 balance (ID: ${accountId})`);
  
  return { accountId };
}

// Test 1: Edit expense transaction
async function testEditExpense(accountId) {
  // Create initial expense
  const tx1 = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'expense',
    category: 'Groceries',
    amount: 200,
    description: 'Initial expense',
    account_id: accountId,
    currency: 'USD'
  });
  
  // Check balance after expense
  const accounts1 = await api('GET', '/accounts');
  const account1 = accounts1.accounts.find(a => a.id === accountId);
  assertApproxEqual(account1.balance, 800, 0.01, 'Balance should be $800 after $200 expense');
  
  // Edit expense to $150
  await api('PUT', `/transactions/${tx1.transaction.id}`, {
    date: '2026-01-01',
    type: 'expense',
    category: 'Groceries',
    amount: 150,
    description: 'Edited expense',
    account_id: accountId,
    currency: 'USD'
  });
  
  // Check balance after edit
  const accounts2 = await api('GET', '/accounts');
  const account2 = accounts2.accounts.find(a => a.id === accountId);
  assertApproxEqual(account2.balance, 850, 0.01, 'Balance should be $850 after editing to $150');
  
  // Cleanup
  await api('DELETE', `/transactions/${tx1.transaction.id}`);
}

// Test 2: Edit with insufficient balance validation
async function testEditValidation(accountId) {
  // Create expense of $100
  const tx = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'expense',
    category: 'Shopping',
    amount: 100,
    description: 'Test expense',
    account_id: accountId,
    currency: 'USD'
  });
  
  // Check current balance
  const accounts1 = await api('GET', '/accounts');
  const account1 = accounts1.accounts.find(a => a.id === accountId);
  const currentBalance = account1.balance;
  
  // Try to edit to amount greater than available
  let editFailed = false;
  try {
    await api('PUT', `/transactions/${tx.transaction.id}`, {
      date: '2026-01-01',
      type: 'expense',
      category: 'Shopping',
      amount: currentBalance + 500, // Should fail
      description: 'Invalid edit',
      account_id: accountId,
      currency: 'USD'
    });
  } catch (err) {
    if (err.message.includes('Insufficient funds') || err.message.includes('shortfall')) {
      editFailed = true;
    }
  }
  
  assert(editFailed, 'Edit should be rejected when amount exceeds available balance');
  
  // Verify balance unchanged
  const accounts2 = await api('GET', '/accounts');
  const account2 = accounts2.accounts.find(a => a.id === accountId);
  assertApproxEqual(account2.balance, currentBalance, 0.01, 'Balance should be unchanged after failed edit');
  
  // Cleanup
  await api('DELETE', `/transactions/${tx.transaction.id}`);
}

// Test 3: Delete and restore transaction
async function testDeleteRestore(accountId) {
  // Get initial balance
  const accounts0 = await api('GET', '/accounts');
  const account0 = accounts0.accounts.find(a => a.id === accountId);
  const initialBalance = account0.balance;
  
  // Create expense
  const tx = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'expense',
    category: 'Dining',
    amount: 75,
    description: 'Restaurant',
    account_id: accountId,
    currency: 'USD'
  });
  
  const txId = tx.transaction.id;
  
  // Verify balance after creation
  const accounts1 = await api('GET', '/accounts');
  const account1 = accounts1.accounts.find(a => a.id === accountId);
  assertApproxEqual(account1.balance, initialBalance - 75, 0.01, 'Balance reduced by $75 after expense');
  
  // Verify transaction appears in list
  const txList1 = await api('GET', '/transactions?limit=100');
  const found1 = txList1.transactions.find(t => t.id === txId);
  assert(found1, 'Transaction should appear in transactions list');
  
  // Delete transaction
  await api('DELETE', `/transactions/${txId}`);
  
  // Verify balance restored after deletion
  const accounts2 = await api('GET', '/accounts');
  const account2 = accounts2.accounts.find(a => a.id === accountId);
  assertApproxEqual(account2.balance, initialBalance, 0.01, 'Balance should be restored after deletion');
  
  // Verify transaction NOT in regular list
  const txList2 = await api('GET', '/transactions?limit=100');
  const found2 = txList2.transactions.find(t => t.id === txId);
  assert(!found2, 'Deleted transaction should not appear in regular list');
  
  // Verify transaction IS in trash
  const trash = await api('GET', '/transactions/trash?limit=100');
  const foundInTrash = trash.transactions.find(t => t.id === txId);
  assert(foundInTrash, 'Deleted transaction should appear in trash');
  assert(foundInTrash.deleted_at, 'Deleted transaction should have deleted_at timestamp');
  
  // Restore transaction
  await api('POST', `/transactions/${txId}/restore`);
  
  // Verify balance reduced again after restore
  const accounts3 = await api('GET', '/accounts');
  const account3 = accounts3.accounts.find(a => a.id === accountId);
  assertApproxEqual(account3.balance, initialBalance - 75, 0.01, 'Balance should be reduced again after restore');
  
  // Verify transaction back in regular list
  const txList3 = await api('GET', '/transactions?limit=100');
  const found3 = txList3.transactions.find(t => t.id === txId);
  assert(found3, 'Restored transaction should appear in regular list');
  assert(!found3.deleted_at, 'Restored transaction should not have deleted_at');
  
  // Cleanup
  await api('DELETE', `/transactions/${txId}`);
}

// Test 4: Restore validation (insufficient balance)
async function testRestoreValidation(accountId) {
  // Get current balance
  const accounts0 = await api('GET', '/accounts');
  const account0 = accounts0.accounts.find(a => a.id === accountId);
  const currentBalance = account0.balance;
  
  // Create and delete a large expense
  const tx = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'expense',
    category: 'Equipment',
    amount: 100,
    description: 'Large expense',
    account_id: accountId,
    currency: 'USD'
  });
  
  const txId = tx.transaction.id;
  await api('DELETE', `/transactions/${txId}`);
  
  // Create another expense that uses most of the balance
  const tx2 = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'expense',
    category: 'Other',
    amount: currentBalance - 50, // Leave only $50
    description: 'Uses most balance',
    account_id: accountId,
    currency: 'USD'
  });
  
  // Try to restore the original transaction (should fail - not enough balance)
  let restoreFailed = false;
  try {
    await api('POST', `/transactions/${txId}/restore`);
  } catch (err) {
    if (err.message.includes('Insufficient funds') || err.message.includes('shortfall') || err.message.includes('Cannot restore')) {
      restoreFailed = true;
    }
  }
  
  assert(restoreFailed, 'Restore should be rejected when insufficient balance');
  
  // Verify transaction still in trash
  const trash = await api('GET', '/transactions/trash?limit=100');
  const stillInTrash = trash.transactions.find(t => t.id === txId);
  assert(stillInTrash, 'Transaction should remain in trash after failed restore');
  
  // Cleanup
  await api('DELETE', `/transactions/${tx2.transaction.id}`);
  await api('POST', `/transactions/${txId}/restore`); // Now should succeed
  await api('DELETE', `/transactions/${txId}`);
}

// Test 5: Transfer edit atomicity
async function testTransferEdit(accountId) {
  // Create second account
  const account2Res = await api('POST', '/accounts', {
    name: 'Second Account',
    bank: 'Test Bank',
    type: 'savings',
    balance: 500,
    currency: 'USD',
    role: 'spending'
  });
  const account2Id = account2Res.id;
  
  // Get initial balances
  const accounts0 = await api('GET', '/accounts');
  const acc1_initial = accounts0.accounts.find(a => a.id === accountId).balance;
  const acc2_initial = accounts0.accounts.find(a => a.id === account2Id).balance;
  
  // Create transfer of $100 from account1 to account2
  const tx = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'transfer',
    category: 'Transfer',
    amount: 100,
    description: 'Test transfer',
    account_id: accountId,
    to_account_id: account2Id,
    currency: 'USD'
  });
  
  // Check balances after transfer
  const accounts1 = await api('GET', '/accounts');
  const acc1_after = accounts1.accounts.find(a => a.id === accountId).balance;
  const acc2_after = accounts1.accounts.find(a => a.id === account2Id).balance;
  
  assertApproxEqual(acc1_after, acc1_initial - 100, 0.01, 'Source account reduced by $100');
  assertApproxEqual(acc2_after, acc2_initial + 100, 0.01, 'Destination account increased by $100');
  
  // Edit transfer to $150
  await api('PUT', `/transactions/${tx.transaction.id}`, {
    date: '2026-01-01',
    type: 'transfer',
    category: 'Transfer',
    amount: 150,
    description: 'Edited transfer',
    account_id: accountId,
    to_account_id: account2Id,
    currency: 'USD'
  });
  
  // Check balances after edit
  const accounts2 = await api('GET', '/accounts');
  const acc1_edited = accounts2.accounts.find(a => a.id === accountId).balance;
  const acc2_edited = accounts2.accounts.find(a => a.id === account2Id).balance;
  
  assertApproxEqual(acc1_edited, acc1_initial - 150, 0.01, 'Source account reduced by $150 after edit');
  assertApproxEqual(acc2_edited, acc2_initial + 150, 0.01, 'Destination account increased by $150 after edit');
  
  // Cleanup
  await api('DELETE', `/transactions/${tx.transaction.id}`);
  await api('DELETE', `/accounts/${account2Id}`);
}

// Test 6: Audit trail recording
async function testAuditTrail(accountId) {
  // Create transaction
  const tx = await api('POST', '/transactions', {
    date: '2026-01-01',
    type: 'expense',
    category: 'Test',
    amount: 50,
    description: 'Audit test',
    account_id: accountId,
    currency: 'USD'
  });
  
  const txId = tx.transaction.id;
  
  // Edit transaction
  await api('PUT', `/transactions/${txId}`, {
    date: '2026-01-01',
    type: 'expense',
    category: 'Test',
    amount: 60,
    description: 'Edited audit test',
    account_id: accountId,
    currency: 'USD'
  });
  
  // Delete transaction
  await api('DELETE', `/transactions/${txId}`);
  
  // Restore transaction
  await api('POST', `/transactions/${txId}/restore`);
  
  // Check audit trail
  const auditTrail = await api('GET', '/reports/audit-trail');
  
  assert(auditTrail.editCount >= 1, 'Audit trail should show at least 1 edit');
  assert(auditTrail.deletedCount >= 0, 'Audit trail should report deleted count');
  
  // Cleanup
  await api('DELETE', `/transactions/${txId}`);
}

// Main test runner
async function runTests() {
  console.log('='.repeat(60));
  console.log('Transaction Mutations Integration Test Suite');
  console.log('Testing: Edit, Delete, Restore, Balance Integrity, Audit Trail');
  console.log('='.repeat(60));
  
  try {
    const { accountId } = await setup();
    
    await test('Edit Expense Transaction', () => testEditExpense(accountId));
    await test('Edit Validation (Insufficient Balance)', () => testEditValidation(accountId));
    await test('Delete and Restore Transaction', () => testDeleteRestore(accountId));
    await test('Restore Validation (Insufficient Balance)', () => testRestoreValidation(accountId));
    await test('Transfer Edit Atomicity', () => testTransferEdit(accountId));
    await test('Audit Trail Recording', () => testAuditTrail(accountId));
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📊 Total: ${testsPassed + testsFailed}`);
    console.log('='.repeat(60));
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! Transaction mutation system is working correctly.');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Review errors above.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n💥 Test suite failed:', err.message);
    process.exit(1);
  }
}

// Run tests
runTests();
