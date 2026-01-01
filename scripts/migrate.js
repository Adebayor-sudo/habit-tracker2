#!/usr/bin/env node
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/opt/habit-tracker/data/tracker.db';
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Create backup before migration
function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `tracker-${timestamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✓ Backup created: ${backupPath}`);
  
  // Keep only last 10 backups
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('tracker-'))
    .sort()
    .reverse();
  
  if (backups.length > 10) {
    backups.slice(10).forEach(file => {
      fs.unlinkSync(path.join(BACKUP_DIR, file));
      console.log(`✓ Removed old backup: ${file}`);
    });
  }
}

// Get current migration version
function getCurrentVersion(db) {
  try {
    const result = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
    return result ? result.version : 0;
  } catch (err) {
    // Table doesn't exist yet
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      )
    `);
    return 0;
  }
}

// Get pending migrations
function getPendingMigrations(currentVersion) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  return files
    .map(file => {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      
      const version = parseInt(match[1]);
      const description = match[2].replace(/_/g, ' ');
      
      return { version, description, file };
    })
    .filter(m => m && m.version > currentVersion);
}

// Run migration
function runMigration(db, migration) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, migration.file), 'utf8');
  
  console.log(`\nApplying migration ${migration.version}: ${migration.description}`);
  
  try {
    db.exec('BEGIN');
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)').run(migration.version, migration.description);
    db.exec('COMMIT');
    console.log(`✓ Migration ${migration.version} applied successfully`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(`✗ Migration ${migration.version} failed:`, err.message);
    throw err;
  }
}

// Main migration function
function migrate() {
  console.log('🔄 Database Migration Tool\n');
  console.log(`Database: ${DB_PATH}`);
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('✗ Database does not exist. Run the app first to create it.');
    process.exit(1);
  }
  
  // Create backup
  backup();
  
  // Open database
  const db = new Database(DB_PATH);
  
  try {
    const currentVersion = getCurrentVersion(db);
    console.log(`\nCurrent schema version: ${currentVersion}`);
    
    const pending = getPendingMigrations(currentVersion);
    
    if (pending.length === 0) {
      console.log('\n✓ Database is up to date. No migrations needed.');
    } else {
      console.log(`\nFound ${pending.length} pending migration(s):`);
      pending.forEach(m => console.log(`  - ${m.version}: ${m.description}`));
      
      pending.forEach(migration => runMigration(db, migration));
      
      console.log(`\n✓ All migrations completed successfully!`);
      console.log(`New schema version: ${pending[pending.length - 1].version}`);
    }
  } finally {
    db.close();
  }
}

// CLI
if (require.main === module) {
  migrate();
}

module.exports = { migrate, backup };
