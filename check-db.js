const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDatabase() {
  try {
    console.log('=== CHECKING DATABASE STATE ===');
    
    // Check all classes
    console.log('\n--- ALL CLASSES ---');
    const classesResult = await pool.query('SELECT id, name, user_id, year, created_at FROM classes ORDER BY created_at DESC');
    classesResult.rows.forEach(row => {
      console.log(`Class ID: ${row.id}, Name: ${row.name}, User ID: ${row.user_id}, Year: ${row.year}`);
    });
    
    // Check all students and their classes
    console.log('\n--- ALL STUDENTS AND THEIR CLASSES ---');
    const studentsResult = await pool.query(`
      SELECT s.id, s.full_name, s.user_id, s.class_id, c.name as class_name 
      FROM students s 
      LEFT JOIN classes c ON s.class_id = c.id 
      ORDER BY s.created_at DESC
    `);
    studentsResult.rows.forEach(row => {
      console.log(`Student: ${row.full_name}, Class ID: ${row.class_id}, Class Name: ${row.class_name || 'NULL'}`);
    });
    
    // Check students per class
    console.log('\n--- STUDENTS PER CLASS ---');
    const studentsPerClassResult = await pool.query(`
      SELECT c.id, c.name, COUNT(s.id) as student_count
      FROM classes c
      LEFT JOIN students s ON c.id = s.class_id
      GROUP BY c.id, c.name
      ORDER BY c.created_at DESC
    `);
    studentsPerClassResult.rows.forEach(row => {
      console.log(`Class: ${row.name} (ID: ${row.id}), Students: ${row.student_count}`);
    });
    
    console.log('\n=== DATABASE CHECK COMPLETE ===');
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await pool.end();
  }
}

checkDatabase(); 