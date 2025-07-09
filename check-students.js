const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkStudents() {
  try {
    console.log('=== CHECKING STUDENTS AND CLASSES ===');
    
    // Check all students
    console.log('\n--- ALL STUDENTS ---');
    const studentsResult = await pool.query('SELECT id, full_name, class_id, user_id FROM students ORDER BY created_at DESC');
    studentsResult.rows.forEach(row => {
      console.log(`Student: ${row.full_name}, Class ID: ${row.class_id}, User ID: ${row.user_id}`);
    });
    
    // Check all classes
    console.log('\n--- ALL CLASSES ---');
    const classesResult = await pool.query('SELECT id, name, user_id, year FROM classes ORDER BY created_at DESC');
    classesResult.rows.forEach(row => {
      console.log(`Class: ${row.name}, ID: ${row.id}, User ID: ${row.user_id}, Year: ${row.year}`);
    });
    
    // Check students with their class names
    console.log('\n--- STUDENTS WITH CLASS NAMES ---');
    const studentsWithClassesResult = await pool.query(`
      SELECT s.id, s.full_name, s.class_id, c.name as class_name 
      FROM students s 
      LEFT JOIN classes c ON s.class_id = c.id 
      ORDER BY s.created_at DESC
    `);
    studentsWithClassesResult.rows.forEach(row => {
      console.log(`Student: ${row.full_name}, Class ID: ${row.class_id}, Class Name: ${row.class_name || 'NULL'}`);
    });
    
    console.log('\n=== CHECK COMPLETE ===');
  } catch (error) {
    console.error('Error checking students:', error);
  } finally {
    await pool.end();
  }
}

checkStudents(); 