const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createOrUpdateAdmin() {
  const username = 'admin1234';
  const password = 'admin1234';
  const hashedPassword = await bcrypt.hash(password, 10);
  const email = 'admin@example.com';
  const contact = '+237000000000';
  const is_default = true;
  const role = 'admin';

  try {
    await pool.query(
      `INSERT INTO users (username, password, email, contact, is_default, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE
       SET password = EXCLUDED.password, role = EXCLUDED.role` ,
      [username, hashedPassword, email, contact, is_default, role]
    );
    console.log('Admin user created or updated successfully!');
  } catch (err) {
    console.error('Error creating/updating admin user:', err);
  } finally {
    await pool.end();
  }
}

createOrUpdateAdmin(); 