const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixStudentClass() {
  try {
    console.log('=== FIXING STUDENT CLASS ASSIGNMENT ===');
    
    // Find students without class assignment
    const studentsWithoutClass = await pool.query('SELECT id, full_name FROM students WHERE class_id IS NULL');
    console.log(`Found ${studentsWithoutClass.rows.length} students without class assignment:`);
    studentsWithoutClass.rows.forEach(row => {
      console.log(`- ${row.full_name} (ID: ${row.id})`);
    });
    
    // Get available classes
    const availableClasses = await pool.query('SELECT id, name FROM classes ORDER BY id');
    console.log('\nAvailable classes:');
    availableClasses.rows.forEach(row => {
      console.log(`- ${row.name} (ID: ${row.id})`);
    });
    
    // Assign students without class to the first available class
    if (studentsWithoutClass.rows.length > 0 && availableClasses.rows.length > 0) {
      const firstClassId = availableClasses.rows[0].id;
      const firstClassName = availableClasses.rows[0].name;
      
      console.log(`\nAssigning students without class to: ${firstClassName} (ID: ${firstClassId})`);
      
      const updateResult = await pool.query(
        'UPDATE students SET class_id = $1 WHERE class_id IS NULL',
        [firstClassId]
      );
      
      console.log(`Updated ${updateResult.rowCount} students`);
    }
    
    console.log('\n=== FIX COMPLETE ===');
  } catch (error) {
    console.error('Error fixing student class assignment:', error);
  } finally {
    await pool.end();
  }
}

fixStudentClass(); 