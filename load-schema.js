const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function loadSchema() {
  try {
    const sql = fs.readFileSync('init-db.pg.sql', 'utf8');
    // Split on semicolons at the end of a line (to avoid issues with function bodies)
    const statements = sql.split(/;\s*$/m).filter(stmt => stmt.trim());
    for (const statement of statements) {
      await pool.query(statement);
      console.log('Executed statement:', statement.split('\n')[0]);
    }
    console.log('Schema loaded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error loading schema:', err);
    process.exit(1);
  }
}

loadSchema(); 