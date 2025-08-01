process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const net = require('net');
const { exec } = require('child_process');
const util = require('util');
const multer = require('multer');
const XLSX = require('xlsx');
const execAsync = util.promisify(exec);
const { Pool } = require('pg');
require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const PORT = 5000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Configure multer for Excel file uploads
const excelUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for Excel files
  },
  fileFilter: function (req, file, cb) {
    // Accept Excel files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed!'), false);
    }
  }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Function to find an available port
const findAvailablePort = (startPort) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        findAvailablePort(startPort + 1)
          .then(resolve)
          .catch(reject);
      } else {
        reject(err);
      }
    });

    server.listen(startPort, () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
};

// CORS configuration with dynamic origin
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',
    'http://localhost:3005',
    'https://school-latest-front.onrender.com',
    'https://mpasatadmission.com',
    'https://www.mpasatadmission.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 86400
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.options('*', cors(corsOptions));

// Global request logger middleware
app.use((req, res, next) => {
  let userInfo = '';
  if (req.headers && req.headers.authorization) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = require('jsonwebtoken').decode(token);
      if (decoded) {
        userInfo = ` | user: ${decoded.username} (role: ${decoded.role})`;
      }
    } catch (e) {}
  }
  console.log(`[REQ] ${req.method} ${req.originalUrl}${userInfo}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  console.log('Authenticating request...');
  
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    console.log('No authorization header');
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('No token in authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    console.log('Token verified for user:', user.username);
    req.user = user;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Public endpoints (no authentication required)
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Temporary endpoint to create admin user (remove in production)
app.post('/api/setup-admin', async (req, res) => {
  try {
    const adminPassword = 'admin1234';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    // Check if admin user exists
    const result = await pool.query('SELECT * FROM users WHERE username = $1', ['admin1234']);
    const existingUsers = result.rows;
    if (existingUsers.length > 0) {
      // Update existing admin password and role
      await pool.query(
        'UPDATE users SET password = $1, role = $2 WHERE username = $3',
        [hashedPassword, 'admin', 'admin1234']
      );
      console.log('Admin password and role updated');
    } else {
      // Create new admin user with role admin
      await pool.query(
        'INSERT INTO users (username, password, email, contact, is_default, role) VALUES ($1, $2, $3, $4, $5, $6)',
        ['admin1234', hashedPassword, 'admin@example.com', '+237000000000', true, 'admin']
      );
      console.log('Admin user created');
    }
    res.json({ 
      message: 'Admin user setup complete',
      username: 'admin1234',
      password: 'admin1234'
    });
  } catch (error) {
    console.error('Error setting up admin:', error);
    res.status(500).json({ error: 'Failed to setup admin user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt for:', username);

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const users = result.rows;
    if (users.length === 0) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Create token with expiration and role
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    // Send back user data (excluding password) along with token
    const userData = {
      id: user.id,
      username: user.username,
      contact: user.contact,
      created_at: user.created_at,
      role: user.role
    };
    console.log('Login successful for:', username);
    res.json({ 
      token,
      user: userData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/register', async (req, res) => {
  console.log('Received registration request:', {
    body: req.body,
    headers: req.headers,
    method: req.method,
    url: req.url
  });
  const { username, contact, password, role } = req.body;
  if (!username || !password) {
    console.log('Missing required fields:', { username: !!username, password: !!password });
    return res.status(400).json({ error: 'Username and password are required' });
  }
  // Validate role
  const allowedRoles = ['student', 'teacher', 'parent'];
  let userRole = (role && allowedRoles.includes(role.toLowerCase())) ? role.toLowerCase() : 'student';
  try {
    // Check if username exists
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const users = result.rows;
    if (users.length > 0) {
      console.log('Username already exists:', username);
      return res.status(400).json({ error: 'Username already exists' });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create new user with selected role
    const insertResult = await pool.query(
      'INSERT INTO users (username, contact, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, contact, hashedPassword, userRole]
    );
    const newUser = insertResult.rows[0];
    console.log('Account created successfully:', { username, userId: newUser.id, role: userRole });
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Error in registration endpoint:', error);
    res.status(500).json({ error: `Failed to create account: ${error.message}` });
  }
});

app.post('/api/check-user', async (req, res) => {
  const { username } = req.body;
  console.log('Checking if user exists:', username);

  try {
    const [users] = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
    
    if (users.length > 0) {
      console.log('User exists:', username);
      res.json({ exists: true });
    } else {
      console.log('User does not exist:', username);
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;
  console.log('Password reset request for:', username);

  try {
    // Check if user exists
    const [users] = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (users.length === 0) {
      console.log('User not found for password reset:', username);
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the password
    await pool.query(
      'UPDATE users SET password = $1 WHERE username = $2',
      [hashedPassword, username]
    );
    
    console.log('Password reset successful for:', username);
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // Get current user
    const [users] = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Users endpoints
app.get('/api/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can view all users' });
  }
  try {
    const result = await pool.query('SELECT id, username, contact, role FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Error fetching all users' });
  }
});

// Admin: Delete user by id
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete users' });
  }
  const userId = req.params.id;
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Error deleting user' });
  }
});

// Admin: Edit user by id
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can edit users' });
  }
  const userId = req.params.id;
  const { username, contact, password, role } = req.body;
  try {
    let updateFields = ['username = $1', 'contact = $2', 'role = $3'];
    let updateValues = [username, contact, role, userId];
    let query = '';
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = $4');
      updateValues = [username, contact, role, hashedPassword, userId];
      query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $5`;
    } else {
      query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $4`;
    }
    const result = await pool.query(query, updateValues);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Error updating user' });
  }
});

// Students endpoints
app.post('/api/students', authenticateToken, upload.single('student_picture'), async (req, res) => {
  let { 
    full_name, 
    sex, 
    date_of_birth, 
    place_of_birth, 
    father_name, 
    mother_name, 
    previous_class, 
    next_class, 
    previous_average, 
    guardian_contact, 
    vocational_training, 
    class_id // <-- Accept class_id
  } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  // Get file path from uploaded file
  const student_picture = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    // Validate class_id
    if (!class_id) {
      return res.status(400).json({ error: 'Class is required for student registration.' });
    }
    // Check if class exists and get its name
    const classCheck = await pool.query('SELECT id, name FROM classes WHERE id = $1', [class_id]);
    if (classCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Selected class does not exist.' });
    }
    // Always set next_class to the class name from DB
    next_class = classCheck.rows[0].name;
    // Check role-based restrictions
    if (userRole === 'student') {
      // Students can only register themselves (1 student max)
      const existingStudent = await pool.query(
        'SELECT id FROM students WHERE user_id = $1',
        [userId]
      );
      
      if (existingStudent.rows.length > 0) {
        return res.status(400).json({ 
          error: 'You have already registered yourself as a student. Students can only register once.' 
        });
      }
    } else if (userRole === 'parent') {
      // Parents can register multiple students (no restriction)
      // This is the default behavior
    } else if (userRole === 'admin') {
      // Admins can register unlimited students
      // This is the default behavior
    } else {
      return res.status(403).json({ 
        error: 'Invalid user role for student registration' 
      });
    }

    const result = await pool.query(
      `INSERT INTO students (user_id, full_name, sex, date_of_birth, place_of_birth, father_name, mother_name, previous_class, next_class, previous_average, guardian_contact, student_picture, vocational_training, class_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [userId, full_name, sex, date_of_birth, place_of_birth, father_name, mother_name, previous_class, next_class, previous_average, guardian_contact, student_picture, vocational_training, class_id]
    );
    const newStudent = result.rows[0];
    res.status(201).json({ id: newStudent.id });
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ error: 'Error creating student' });
  }
});

// Students GET endpoint with admin logic
app.get('/api/students', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const year = req.query.year ? parseInt(req.query.year) : null;
  
  console.log('GET /api/students - User ID:', userId, 'Role:', userRole, 'Year:', year);
  
  try {
    let students, query, params;
    if (userRole === 'admin') {
      // Admin: see all students for the year with user info and class name
      if (year) {
        query = `
          SELECT s.*, c.name as class_name, u.username as registered_by 
          FROM students s 
          LEFT JOIN classes c ON s.class_id = c.id
          LEFT JOIN users u ON s.user_id = u.id 
          WHERE EXTRACT(YEAR FROM s.created_at) = $1 
          ORDER BY s.created_at DESC
        `;
        params = [year];
      } else {
        query = `
          SELECT s.*, c.name as class_name, u.username as registered_by 
          FROM students s 
          LEFT JOIN classes c ON s.class_id = c.id
          LEFT JOIN users u ON s.user_id = u.id 
          ORDER BY s.created_at DESC
        `;
        params = [];
      }
    } else {
      // Regular user: only see their own students, with class name
      if (year) {
        query = `SELECT s.*, c.name as class_name FROM students s LEFT JOIN classes c ON s.class_id = c.id WHERE s.user_id = $1 AND EXTRACT(YEAR FROM s.created_at) = $2 ORDER BY s.created_at DESC`;
        params = [userId, year];
      } else {
        query = `SELECT s.*, c.name as class_name FROM students s LEFT JOIN classes c ON s.class_id = c.id WHERE s.user_id = $1 ORDER BY s.created_at DESC`;
        params = [userId];
      }
    }
    
    console.log('Query:', query);
    console.log('Params:', params);
    
    const result = await pool.query(query, params);
    students = result.rows;
    
    console.log('Found students:', students.length);
    console.log('Students:', students.map(s => ({ id: s.id, name: s.full_name, user_id: s.user_id, class_name: s.class_name })));
    
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Error fetching students' });
  }
});

app.put('/api/students/:id', authenticateToken, upload.single('student_picture'), async (req, res) => {
  let { 
    full_name, 
    sex, 
    date_of_birth, 
    place_of_birth, 
    father_name, 
    mother_name, 
    previous_class, 
    next_class, 
    previous_average, 
    guardian_contact, 
    vocational_training, 
    class_id // <-- add class_id
  } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const studentId = req.params.id;
  // Get file path from uploaded file
  const student_picture = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    // If class_id is provided, validate it and get its name
    if (class_id) {
      const classCheck = await pool.query('SELECT id, name FROM classes WHERE id = $1', [class_id]);
      if (classCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Selected class does not exist.' });
      }
      // Always set next_class to the class name from DB
      next_class = classCheck.rows[0].name;
    }
    console.log(`[DEBUG] PUT /api/students/${studentId} by user ${userId} (role: ${userRole})`);
    let resultStudent;
    if (userRole === 'admin') {
      // Admin can edit any student
      resultStudent = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
      if (resultStudent.rows.length === 0) {
        console.log(`[DEBUG] Student with id ${studentId} does not exist.`);
        return res.status(404).json({ error: 'Student does not exist.' });
      }
    } else {
      // Regular users can only edit their own students
      resultStudent = await pool.query('SELECT * FROM students WHERE id = $1 AND user_id = $2', [studentId, userId]);
      if (resultStudent.rows.length === 0) {
        // Check if student exists at all
        const checkStudent = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
        if (checkStudent.rows.length === 0) {
          console.log(`[DEBUG] Student with id ${studentId} does not exist.`);
          return res.status(404).json({ error: 'Student does not exist.' });
        } else {
          console.log(`[DEBUG] User ${userId} (role: ${userRole}) not permitted to edit student ${studentId}.`);
          return res.status(403).json({ error: 'Not permitted to edit this student.' });
        }
      }
    }
    // If class_id is provided, validate it
    if (class_id) {
      const classCheck = await pool.query('SELECT id FROM classes WHERE id = $1', [class_id]);
      if (classCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Selected class does not exist.' });
      }
    }
    // Build update query dynamically based on whether a new picture or class_id is provided
    let updateFields = [
      'full_name = $1',
      'sex = $2',
      'date_of_birth = $3',
      'place_of_birth = $4',
      'father_name = $5',
      'mother_name = $6',
      'previous_class = $7',
      'next_class = $8',
      'previous_average = $9',
      'guardian_contact = $10',
      'vocational_training = $11'
    ];
    let updateValues = [full_name, sex, date_of_birth, place_of_birth, father_name, mother_name, previous_class, next_class, previous_average, guardian_contact, vocational_training];
    let paramIndex = 12;
    if (student_picture !== null) {
      updateFields.push(`student_picture = $${paramIndex}`);
      updateValues.push(student_picture);
      paramIndex++;
    }
    if (class_id) {
      updateFields.push(`class_id = $${paramIndex}`);
      updateValues.push(class_id);
      paramIndex++;
    }
    updateFields = updateFields.join(', ');
    updateValues.push(studentId);
    const updateQuery = userRole === 'admin'
      ? `UPDATE students SET ${updateFields} WHERE id = $${paramIndex}`
      : `UPDATE students SET ${updateFields} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`;
    if (userRole === 'admin') {
      await pool.query(updateQuery, updateValues);
    } else {
      updateValues.push(userId);
      await pool.query(updateQuery, updateValues);
    }
    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Error updating student' });
  }
});

// Delete all students endpoint (admin only) - MUST come before :id route
app.delete('/api/students/delete-all', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Check if user is admin
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admin can delete all students' });
    }

    // Delete all students
    const result = await pool.query('DELETE FROM students');
    
    res.json({ 
      message: `${result.rowCount} students deleted successfully`,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error deleting all students:', error);
    res.status(500).json({ error: 'Error deleting all students' });
  }
});

// Approve all students endpoint (admin only) - MUST come before :id route
app.post('/api/students/approve-all', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Check if user is admin
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admin can approve all students' });
    }

    // Update all students to approved status
    const result = await pool.query(
      'UPDATE students SET status = $1 WHERE status = $2',
      ['approved', 'pending']
    );
    
    res.json({ 
      message: `${result.rowCount} students approved successfully`,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error approving all students:', error);
    res.status(500).json({ error: 'Error approving all students' });
  }
});

// Individual student delete - MUST come after specific routes
app.delete('/api/students/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const studentId = req.params.id;

  try {
    let result;
    
    if (userRole === 'admin') {
      // Admin can delete any student
      result = await pool.query(
        'SELECT * FROM students WHERE id = $1',
        [studentId]
      );
    } else {
      // Regular users can only delete their own students
      result = await pool.query(
        'SELECT * FROM students WHERE id = $1 AND user_id = $2',
        [studentId, userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Delete the student
    if (userRole === 'admin') {
      // Admin can delete any student
      await pool.query(
        'DELETE FROM students WHERE id = $1',
        [studentId]
      );
    } else {
      // Regular users can only delete their own students
      await pool.query(
        'DELETE FROM students WHERE id = $1 AND user_id = $2',
        [studentId, userId]
      );
    }
    
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Error deleting student' });
  }
});

// Excel upload endpoint for bulk student registration
app.post('/api/students/upload', authenticateToken, excelUpload.single('file'), async (req, res) => {
  const userId = req.user.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No Excel file uploaded' });
  }

  function parseExcelDate(dateStr) {
    if (!dateStr) return '';
    // If it's a number, treat as Excel serial date
    if (typeof dateStr === 'number') {
      // Excel's epoch starts at 1900-01-01
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + dateStr * 86400000);
      // Format as yyyy-mm-dd
      return d.toISOString().slice(0, 10);
    }
    // Accept both Date objects and strings
    if (dateStr instanceof Date) {
      return dateStr.toISOString().slice(0, 10);
    }
    if (typeof dateStr === 'string') {
      // Try to parse d-MMM-yyyy (e.g., 5-Dec-2025)
      const match = /^([0-9]{1,2})[-.\/]([A-Za-z]{3})[-.\/]([0-9]{4})$/.exec(dateStr.trim());
      if (match) {
        const day = match[1].padStart(2, '0');
        const monthStr = match[2].toLowerCase();
        const year = match[3];
        const months = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const month = months[monthStr] || '01';
        return `${year}-${month}-${day}`;
      }
      // Try to parse yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      // Fallback: return as is
      return dateStr;
    }
    // Fallback: return as is
    return dateStr;
  }

  function normalizeSex(sex) {
    if (!sex) return 'Male';
    const s = sex.toString().trim().toLowerCase();
    if (s === 'f' || s === 'female') return 'Female';
    return 'Male';
  }

  try {
    // Read the Excel file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Skip the header row and process data
    const students = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Skip row if all fields are empty
      if (!row || row.length < 11 || row.every(cell => cell === undefined || cell === null || cell === '')) continue;
      if (row[0]) { // Only process if Full Name is present
        students.push({
          full_name: row[0] || '',
          sex: normalizeSex(row[1]),
          date_of_birth: parseExcelDate(row[2]),
          place_of_birth: row[3] || '',
          father_name: row[4] || '',
          mother_name: row[5] || '',
          previous_class: row[6] || '',
          next_class: row[7] || '',
          previous_average: row[8] || '',
          guardian_contact: row[9] || '',
          vocational_training: row[10] || ''
        });
      }
    }

    if (students.length === 0) {
      return res.status(400).json({ error: 'No valid student data found in the Excel file' });
    }

    // Insert students into database
    const insertPromises = students.map(student => {
      return pool.query(
        `INSERT INTO students (user_id, full_name, sex, date_of_birth, place_of_birth, father_name, mother_name, previous_class, next_class, previous_average, guardian_contact, vocational_training)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [userId, student.full_name, student.sex, student.date_of_birth, student.place_of_birth, student.father_name, student.mother_name, student.previous_class, student.next_class, student.previous_average, student.guardian_contact, student.vocational_training]
      ).catch(err => {
        console.error('Failed to insert row:', student, err.message);
        throw err;
      });
    });

    const results = await Promise.all(insertPromises);

    // Clean up the uploaded file
    const fs = require('fs');
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: `${results.length} students uploaded successfully`,
      count: results.length
    });
  } catch (error) {
    console.error('Error uploading students:', error);
    
    // Clean up the uploaded file in case of error
    if (req.file) {
      const fs = require('fs');
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Error uploading students from Excel file', details: error.message });
  }
});

// Student analytics endpoint: students added per day for the last 30 days
app.get('/api/students/analytics/daily', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let rows;
    if (userRole === 'admin') {
      // Admin can view analytics for all students
      if (year) {
        const result = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM students
           WHERE EXTRACT(YEAR FROM created_at) = $1 AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [year]
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM students
           WHERE created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`
        );
        rows = result.rows;
      }
    } else {
      // Regular users can only view their own students' analytics
      if (year) {
        const result = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM students
           WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [userId, year]
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM students
           WHERE user_id = $1 AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [userId]
        );
        rows = result.rows;
      }
    }
    // Build a map for quick lookup
    const countsByDate = {};
    rows.forEach(row => {
      countsByDate[row.date] = parseInt(row.count);
    });
    // Generate last 30 days
    const resultArr = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      resultArr.push({
        date: dateStr,
        count: countsByDate[dateStr] || 0
      });
    }
    res.json(resultArr);
  } catch (error) {
    console.error('Error fetching student analytics:', error);
    res.status(500).json({ error: 'Error fetching student analytics', details: error.message });
  }
});

// Classes endpoints
app.post('/api/classes', authenticateToken, async (req, res) => {
  const { 
    name, 
    registration_fee, 
    tuition_fee, 
    vocational_fee, 
    sport_wear_fee, 
    health_sanitation_fee, 
    number_of_installments,
    year
  } = req.body;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `INSERT INTO classes (user_id, name, registration_fee, tuition_fee, vocational_fee, sport_wear_fee, health_sanitation_fee, number_of_installments, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userId, name, registration_fee, tuition_fee, vocational_fee, sport_wear_fee, health_sanitation_fee, number_of_installments, year]
    );
    
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: 'Error creating class' });
  }
});

app.get('/api/classes', authenticateToken, async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let query = 'SELECT * FROM classes';
    let params = [];
    if (year) {
      query += ' WHERE year = $1';
      params.push(year);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Error fetching classes' });
  }
});

app.put('/api/classes/:id', authenticateToken, async (req, res) => {
  const { 
    name, 
    registration_fee, 
    tuition_fee, 
    vocational_fee, 
    sport_wear_fee, 
    health_sanitation_fee, 
    number_of_installments,
    year
  } = req.body;
  const userId = req.user.id;
  const classId = req.params.id;

  try {
    // First verify the class belongs to the user
    const resultClass = await pool.query(
      'SELECT * FROM classes WHERE id = $1 AND user_id = $2',
      [classId, userId]
    );
    if (resultClass.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Update the class
    const result = await pool.query(
      `UPDATE classes 
       SET name = $1, registration_fee = $2, tuition_fee = $3, vocational_fee = $4, sport_wear_fee = $5, health_sanitation_fee = $6, number_of_installments = $7, year = $8
       WHERE id = $9 AND user_id = $10 RETURNING *`,
      [name, registration_fee, tuition_fee, vocational_fee, sport_wear_fee, health_sanitation_fee, number_of_installments, year, classId, userId]
    );
    
    res.json({ message: 'Class updated successfully' });
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: 'Error updating class' });
  }
});

app.delete('/api/classes/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const classId = req.params.id;

  try {
    // First verify the class belongs to the user
    const resultClassDel = await pool.query(
      'SELECT * FROM classes WHERE id = $1 AND user_id = $2',
      [classId, userId]
    );
    if (resultClassDel.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Delete the class
    await pool.query(
      'DELETE FROM classes WHERE id = $1 AND user_id = $2',
      [classId, userId]
    );
    
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: 'Error deleting class' });
  }
});

// Vocational endpoints
app.post('/api/vocational', authenticateToken, upload.fields([
  { name: 'picture1', maxCount: 1 },
  { name: 'picture2', maxCount: 1 },
  { name: 'picture3', maxCount: 1 },
  { name: 'picture4', maxCount: 1 }
]), async (req, res) => {
  const { title, description, year } = req.body;
  const userId = req.user.id;
  
  // Get file paths from uploaded files
  const picture1 = req.files.picture1 ? `/uploads/${req.files.picture1[0].filename}` : null;
  const picture2 = req.files.picture2 ? `/uploads/${req.files.picture2[0].filename}` : null;
  const picture3 = req.files.picture3 ? `/uploads/${req.files.picture3[0].filename}` : null;
  const picture4 = req.files.picture4 ? `/uploads/${req.files.picture4[0].filename}` : null;

  try {
    const result = await pool.query(
      `INSERT INTO vocational (user_id, name, description, picture1, picture2, picture3, picture4, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, title, description, picture1, picture2, picture3, picture4, year]
    );
    
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Error creating vocational department:', error);
    res.status(500).json({ error: 'Error creating vocational department' });
  }
});

app.get('/api/vocational', authenticateToken, async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let query = 'SELECT id, user_id, name as title, description, picture1, picture2, picture3, picture4, year, created_at, updated_at FROM vocational';
    let params = [];
    if (year) {
      query += ' WHERE year = $1';
      params.push(year);
    }
    query += ' ORDER BY created_at DESC';
    const resultVoc = await pool.query(query, params);
    res.json(resultVoc.rows);
  } catch (error) {
    console.error('Error fetching vocational departments:', error);
    res.status(500).json({ error: 'Error fetching vocational departments' });
  }
});

app.put('/api/vocational/:id', authenticateToken, upload.fields([
  { name: 'picture1', maxCount: 1 },
  { name: 'picture2', maxCount: 1 },
  { name: 'picture3', maxCount: 1 },
  { name: 'picture4', maxCount: 1 }
]), async (req, res) => {
  const { title, description, year } = req.body;
  const userId = req.user.id;
  const vocationalId = req.params.id;
  
  // Get file paths from uploaded files
  const picture1 = req.files.picture1 ? `/uploads/${req.files.picture1[0].filename}` : undefined;
  const picture2 = req.files.picture2 ? `/uploads/${req.files.picture2[0].filename}` : undefined;
  const picture3 = req.files.picture3 ? `/uploads/${req.files.picture3[0].filename}` : undefined;
  const picture4 = req.files.picture4 ? `/uploads/${req.files.picture4[0].filename}` : undefined;

  try {
    // First verify the vocational department belongs to the user
    const resultVocPut = await pool.query(
      'SELECT * FROM vocational WHERE id = $1 AND user_id = $2',
      [vocationalId, userId]
    );
    if (resultVocPut.rows.length === 0) {
      return res.status(404).json({ error: 'Vocational department not found' });
    }

    // Build update query and values dynamically
    let updateFields = ['name = $1', 'description = $2', 'year = $3'];
    let updateValues = [title, description, year];
    let paramIndex = 4;
    if (picture1 !== undefined) {
      updateFields.push(`picture1 = $${paramIndex}`);
      updateValues.push(picture1);
      paramIndex++;
    }
    if (picture2 !== undefined) {
      updateFields.push(`picture2 = $${paramIndex}`);
      updateValues.push(picture2);
      paramIndex++;
    }
    if (picture3 !== undefined) {
      updateFields.push(`picture3 = $${paramIndex}`);
      updateValues.push(picture3);
      paramIndex++;
    }
    if (picture4 !== undefined) {
      updateFields.push(`picture4 = $${paramIndex}`);
      updateValues.push(picture4);
      paramIndex++;
    }
    // Add WHERE clause
    updateFields = updateFields.join(', ');
    updateValues.push(vocationalId, userId);
    const updateQuery = `UPDATE vocational SET ${updateFields} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`;

    // Update the vocational department
    await pool.query(updateQuery, updateValues);
    res.json({ message: 'Vocational department updated successfully' });
  } catch (error) {
    console.error('Error updating vocational department:', error);
    res.status(500).json({ error: 'Error updating vocational department' });
  }
});

app.delete('/api/vocational/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const vocationalId = req.params.id;

  try {
    // First verify the vocational department belongs to the user
    const resultVocDel = await pool.query(
      'SELECT * FROM vocational WHERE id = $1 AND user_id = $2',
      [vocationalId, userId]
    );
    if (resultVocDel.rows.length === 0) {
      return res.status(404).json({ error: 'Vocational department not found' });
    }

    // Delete the vocational department
    await pool.query(
      'DELETE FROM vocational WHERE id = $1 AND user_id = $2',
      [vocationalId, userId]
    );
    
    res.json({ message: 'Vocational department deleted successfully' });
  } catch (error) {
    console.error('Error deleting vocational department:', error);
    res.status(500).json({ error: 'Error deleting vocational department' });
  }
});

// Teachers endpoints
app.post('/api/teachers', authenticateToken, async (req, res) => {
  const { teacher_name, subjects, id_card } = req.body;
  const userId = req.user.id;

  try {
    // Check if user has already registered a teacher
    const existingTeacher = await pool.query(
      'SELECT id FROM teachers WHERE user_id = $1',
      [userId]
    );
    
    if (existingTeacher.rows.length > 0) {
      return res.status(400).json({ error: 'You have already registered a teacher. Only one teacher registration is allowed per account.' });
    }

    const result = await pool.query(
      `INSERT INTO teachers (user_id, teacher_name, subjects, id_card, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [userId, teacher_name, subjects, id_card]
    );
    
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({ error: 'Error creating teacher' });
  }
});

app.get('/api/teachers', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let teachers, query, params;
    if (userRole === 'admin') {
      // Admin: see all teachers for the year
      if (year) {
        query = 'SELECT * FROM teachers WHERE EXTRACT(YEAR FROM created_at) = $1 ORDER BY created_at DESC';
        params = [year];
      } else {
        query = 'SELECT * FROM teachers ORDER BY created_at DESC';
        params = [];
      }
    } else {
      // Regular user: only see their own teachers
      if (year) {
        query = 'SELECT * FROM teachers WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 ORDER BY created_at DESC';
        params = [userId, year];
      } else {
        query = 'SELECT * FROM teachers WHERE user_id = $1 ORDER BY created_at DESC';
        params = [userId];
      }
    }
    const result = await pool.query(query, params);
    teachers = result.rows;
    res.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Error fetching teachers' });
  }
});

app.put('/api/teachers/:id', authenticateToken, async (req, res) => {
  const { teacher_name, subjects, id_card, classes_taught, salary_amount } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const teacherId = req.params.id;

  try {
    let resultTeacher;
    
    if (userRole === 'admin') {
      // Admin can edit any teacher
      resultTeacher = await pool.query(
        'SELECT * FROM teachers WHERE id = $1',
        [teacherId]
      );
    } else {
      // Regular users can only edit their own teachers
      resultTeacher = await pool.query(
        'SELECT * FROM teachers WHERE id = $1 AND user_id = $2',
        [teacherId, userId]
      );
    }
    
    if (resultTeacher.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Update the teacher
    let result;
    if (userRole === 'admin') {
      // Admin can update any teacher
      result = await pool.query(
        `UPDATE teachers 
         SET teacher_name = $1, subjects = $2, id_card = $3, classes_taught = $4, salary_amount = $5
         WHERE id = $6 RETURNING *`,
        [teacher_name, subjects, id_card, classes_taught, salary_amount, teacherId]
      );
    } else {
      // Regular users can only update their own teachers
      result = await pool.query(
        `UPDATE teachers 
         SET teacher_name = $1, subjects = $2, id_card = $3, classes_taught = $4, salary_amount = $5
         WHERE id = $6 AND user_id = $7 RETURNING *`,
        [teacher_name, subjects, id_card, classes_taught, salary_amount, teacherId, userId]
      );
    }
    
    res.json({ message: 'Teacher updated successfully' });
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ error: 'Error updating teacher' });
  }
});

// New endpoint for admin to approve/reject teachers
app.put('/api/teachers/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  const userId = req.user.id;
  const teacherId = req.params.id;

  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can approve/reject teachers' });
    }

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "approved" or "rejected"' });
    }

    // Update the teacher status
    const result = await pool.query(
      `UPDATE teachers 
       SET status = $1
       WHERE id = $2 RETURNING *`,
      [status, teacherId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json({ message: `Teacher ${status} successfully` });
  } catch (error) {
    console.error('Error updating teacher status:', error);
    res.status(500).json({ error: 'Error updating teacher status' });
  }
});

app.delete('/api/teachers/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const teacherId = req.params.id;

  try {
    let resultTeacherDel;
    
    if (userRole === 'admin') {
      // Admin can delete any teacher
      resultTeacherDel = await pool.query(
        'SELECT * FROM teachers WHERE id = $1',
        [teacherId]
      );
    } else {
      // Regular users can only delete their own teachers
      resultTeacherDel = await pool.query(
        'SELECT * FROM teachers WHERE id = $1 AND user_id = $2',
        [teacherId, userId]
      );
    }
    
    if (resultTeacherDel.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Delete the teacher
    if (userRole === 'admin') {
      // Admin can delete any teacher
      await pool.query(
        'DELETE FROM teachers WHERE id = $1',
        [teacherId]
      );
    } else {
      // Regular users can only delete their own teachers
      await pool.query(
        'DELETE FROM teachers WHERE id = $1 AND user_id = $2',
        [teacherId, userId]
      );
    }
    
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'Error deleting teacher' });
  }
});

// Teacher analytics endpoint: teachers added per day for the last 30 days
app.get('/api/teachers/analytics/daily', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let rows;
    if (userRole === 'admin') {
      // Admin can view analytics for all teachers
      if (year) {
        [rows] = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM teachers
           WHERE EXTRACT(YEAR FROM created_at) = $1 AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [year]
        );
      } else {
        [rows] = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM teachers
           WHERE created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`
        );
      }
    } else {
      // Regular users can only view their own teachers' analytics
      if (year) {
        [rows] = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM teachers
           WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [userId, year]
        );
      } else {
        [rows] = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count
           FROM teachers
           WHERE user_id = $1 AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [userId]
        );
      }
    }
    res.json(rows);
  } catch (error) {
    console.error('Error fetching teacher analytics:', error);
    res.status(500).json({ error: 'Error fetching teacher analytics', details: error.message });
  }
});

// Fee analytics endpoint: total fee amount paid per day for the last 30 days
app.get('/api/fees/analytics/daily', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    // Get raw results from DB
    let rows;
    if (userRole === 'admin') {
      // Admin can view analytics for all students
      if (year) {
        [rows] = await pool.query(
          `SELECT DATE(f.paid_at) as date, SUM(f.amount) as total
           FROM fees f
           WHERE EXTRACT(YEAR FROM f.paid_at) = $1 AND f.paid_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DATE(f.paid_at)
           ORDER BY date ASC`,
          [year]
        );
      } else {
        [rows] = await pool.query(
          `SELECT DATE(f.paid_at) as date, SUM(f.amount) as total
           FROM fees f
           WHERE f.paid_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DATE(f.paid_at)
           ORDER BY date ASC`
        );
      }
    } else {
      // Regular users can only view their own students' analytics
      if (year) {
        [rows] = await pool.query(
          `SELECT DATE(f.paid_at) as date, SUM(f.amount) as total
           FROM fees f
           JOIN students s ON f.student_id = s.id
           WHERE s.user_id = $1 AND EXTRACT(YEAR FROM f.paid_at) = $2 AND f.paid_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DATE(f.paid_at)
           ORDER BY date ASC`,
          [userId, year]
        );
      } else {
        [rows] = await pool.query(
          `SELECT DATE(f.paid_at) as date, SUM(f.amount) as total
           FROM fees f
           JOIN students s ON f.student_id = s.id
           WHERE s.user_id = $1 AND f.paid_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DATE(f.paid_at)
           ORDER BY date ASC`,
          [userId]
        );
      }
    }
    // Build a map for quick lookup
    const totalsByDate = {};
    rows.rows.forEach(row => {
      totalsByDate[row.date] = parseFloat(row.total);
    });
    // Generate last 30 days
    const result = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        total: totalsByDate[dateStr] || 0
      });
    }
    res.json(result);
  } catch (error) {
    console.error('Error fetching fee analytics:', error);
    res.status(500).json({ error: 'Error fetching fee analytics', details: error.message });
  }
});

// FEES & ID CARDS ENDPOINTS

// 1. Search students for auto-suggest
app.get('/api/students/search', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const query = req.query.query || '';
  try {
    let result;
    if (userRole === 'admin') {
      // Admin can search all students
      result = await pool.query(
        'SELECT id, full_name, class_id FROM students WHERE full_name LIKE $1 ORDER BY full_name ASC LIMIT 10',
        [`%${query}%`]
      );
    } else {
      // Regular users can only search their own students
      result = await pool.query(
        'SELECT id, full_name, class_id FROM students WHERE user_id = $1 AND full_name LIKE $2 ORDER BY full_name ASC LIMIT 10',
        [userId, `%${query}%`]
      );
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error searching students' });
  }
});

// Add this before startServer or before catch-all
app.get('/api/fees/total/yearly', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let result;
    if (userRole === 'admin') {
      // Admin can view total fees for all students
      if (year) {
        result = await pool.query(
          `SELECT SUM(amount) as total
           FROM fees f
           WHERE EXTRACT(YEAR FROM f.paid_at) = $1`,
          [year]
        );
      } else {
        result = await pool.query(
          `SELECT SUM(amount) as total
           FROM fees f
           WHERE EXTRACT(YEAR FROM f.paid_at) = EXTRACT(YEAR FROM CURRENT_DATE)`
        );
      }
    } else {
      // Regular users can only view their own students' fees
      if (year) {
        result = await pool.query(
          `SELECT SUM(amount) as total
           FROM fees f
           JOIN students s ON f.student_id = s.id
           WHERE s.user_id = $1 AND EXTRACT(YEAR FROM f.paid_at) = $2`,
          [userId, year]
        );
      } else {
        result = await pool.query(
          `SELECT SUM(amount) as total
           FROM fees f
           JOIN students s ON f.student_id = s.id
           WHERE s.user_id = $1 AND EXTRACT(YEAR FROM f.paid_at) = EXTRACT(YEAR FROM CURRENT_DATE)` ,
          [userId]
        );
      }
    }
    const total = result.rows[0]?.total || 0;
    res.json({ total });
  } catch (error) {
    console.error('Error fetching yearly total fees:', error);
    res.status(500).json({ error: 'Error fetching yearly total fees', details: error.message });
  }
});

app.get('/api/student/:id/fees', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const studentId = req.params.id;
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    // Get student and class with role-based access
    let resultStudent;
    if (userRole === 'admin') {
      // Admin can view fees for any student
      resultStudent = await pool.query(
        'SELECT s.id, s.full_name, s.class_id, c.name as class_name, c.registration_fee, c.tuition_fee, c.vocational_fee, c.sport_wear_fee, c.health_sanitation_fee FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = $1',
        [studentId]
      );
    } else {
      // Regular users can only view their own students' fees
      resultStudent = await pool.query(
        'SELECT s.id, s.full_name, s.class_id, c.name as class_name, c.registration_fee, c.tuition_fee, c.vocational_fee, c.sport_wear_fee, c.health_sanitation_fee FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = $1 AND s.user_id = $2',
        [studentId, userId]
      );
    }
    
    const student = resultStudent.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    // Get all fees paid
    let resultFees;
    if (year) {
      resultFees = await pool.query(
        'SELECT fee_type, SUM(amount) as paid FROM fees WHERE student_id = $1 AND EXTRACT(YEAR FROM paid_at) = $2 GROUP BY fee_type',
        [studentId, year]
      );
    } else {
      resultFees = await pool.query(
        'SELECT fee_type, SUM(amount) as paid FROM fees WHERE student_id = $1 GROUP BY fee_type',
        [studentId]
      );
    }
    // Calculate balances
    const feeMap = Object.fromEntries(resultFees.rows.map(f => [f.fee_type, parseFloat(f.paid)]));
    const balance = {
      Registration: Math.max(0, parseFloat(student.registration_fee) - (feeMap['Registration'] || 0)),
      Tuition: Math.max(0, parseFloat(student.tuition_fee) - (feeMap['Tuition'] || 0)),
      Vocational: Math.max(0, parseFloat(student.vocational_fee) - (feeMap['Vocational'] || 0)),
      'Sport Wear': Math.max(0, parseFloat(student.sport_wear_fee) - (feeMap['Sport Wear'] || 0)),
      'Sanitation & Health': Math.max(0, parseFloat(student.health_sanitation_fee) - (feeMap['Sanitation & Health'] || 0)),
    };
    res.json({ student, balance });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching student fees' });
  }
});

app.post('/api/fees', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { student_id, class_id, fee_type, amount, paid_at } = req.body;
  try {
    // Optionally: check if student belongs to user
    if (paid_at) {
      await pool.query(
        'INSERT INTO fees (student_id, class_id, fee_type, amount, paid_at) VALUES ($1, $2, $3, $4, $5)',
        [student_id, class_id, fee_type, amount, paid_at]
      );
    } else {
      await pool.query(
        'INSERT INTO fees (student_id, class_id, fee_type, amount) VALUES ($1, $2, $3, $4)',
        [student_id, class_id, fee_type, amount]
      );
    }
    res.json({ message: 'Fee payment recorded' });
  } catch (error) {
    res.status(500).json({ error: 'Error recording fee payment' });
  }
});

app.get('/api/fees/class/:classId', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const classId = req.params.classId;
  const year = req.query.year ? parseInt(req.query.year) : null;
  
  console.log(`[DEBUG] Class fee request - ClassId: ${classId}, Year: ${year}, UserRole: ${userRole}, UserId: ${userId}`);
  
  try {
    // First, check if the class exists
    const classCheck = await pool.query(
      'SELECT id, name, user_id FROM classes WHERE id = $1',
      [classId]
    );
    
    if (classCheck.rows.length === 0) {
      console.log(`[DEBUG] Class ${classId} does not exist in database`);
      return res.status(404).json({ error: `Class with ID ${classId} not found` });
    }
    
    const classData = classCheck.rows[0];
    console.log(`[DEBUG] Class found: ${classData.name} (ID: ${classData.id}, UserID: ${classData.user_id})`);
    
    // Get all students in class with role-based access
    let resultStudents;
    if (userRole === 'admin') {
      // Admin can view fees for all students in the class
      resultStudents = await pool.query(
        'SELECT s.id, s.full_name, s.user_id, c.registration_fee, c.tuition_fee, c.vocational_fee, c.sport_wear_fee, c.health_sanitation_fee FROM students s JOIN classes c ON s.class_id = c.id WHERE s.class_id = $1',
        [classId]
      );
    } else {
      // Regular users can only view their own students in the class
      resultStudents = await pool.query(
        'SELECT s.id, s.full_name, s.user_id, c.registration_fee, c.tuition_fee, c.vocational_fee, c.sport_wear_fee, c.health_sanitation_fee FROM students s JOIN classes c ON s.class_id = c.id WHERE s.class_id = $1 AND s.user_id = $2',
        [classId, userId]
      );
    }
    
    console.log(`[DEBUG] Found ${resultStudents.rows.length} students in class ${classId}`);
    if (resultStudents.rows.length > 0) {
      console.log(`[DEBUG] Students in class:`, resultStudents.rows.map(s => ({ id: s.id, name: s.full_name, user_id: s.user_id })));
    }
    
    const students = resultStudents.rows;
    
    // If no students found, return empty array with a message
    if (students.length === 0) {
      console.log(`[DEBUG] No students found in class ${classId}, returning empty stats`);
      return res.json([]);
    }
    
    // Get all fees for these students
    const studentIds = students.map(s => s.id);
    let fees = [];
    if (studentIds.length > 0) {
      // Build parameterized placeholders for IN clause
      const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
      if (year) {
        const params = [...studentIds, year];
        const query = `SELECT student_id, fee_type, SUM(amount) as paid FROM fees WHERE student_id IN (${placeholders}) AND EXTRACT(YEAR FROM paid_at) = $${studentIds.length + 1} GROUP BY student_id, fee_type`;
        console.log(`[DEBUG] Executing fee query with year filter: ${query}`);
        console.log(`[DEBUG] Query parameters:`, params);
        const resultFees = await pool.query(query, params);
        fees = resultFees.rows;
      } else {
        const query = `SELECT student_id, fee_type, SUM(amount) as paid FROM fees WHERE student_id IN (${placeholders}) GROUP BY student_id, fee_type`;
        console.log(`[DEBUG] Executing fee query without year filter: ${query}`);
        console.log(`[DEBUG] Query parameters:`, studentIds);
        const resultFees = await pool.query(query, studentIds);
        fees = resultFees.rows;
      }
      console.log(`[DEBUG] Found ${fees.length} fee records for students in class ${classId}`);
      if (fees.length > 0) {
        console.log(`[DEBUG] Fee records:`, fees);
      }
    } else {
      console.log(`[DEBUG] No students found in class ${classId}, returning empty stats`);
    }
    
    // Map fees by student
    const feeMap = {};
    for (const f of fees) {
      if (!feeMap[f.student_id]) feeMap[f.student_id] = {};
      feeMap[f.student_id][f.fee_type] = parseFloat(f.paid);
    }
    
    // Build stats
    const stats = students.map(s => {
      const paid = feeMap[s.id] || {};
      const reg = parseFloat(s.registration_fee);
      const tui = parseFloat(s.tuition_fee);
      const voc = parseFloat(s.vocational_fee);
      const sport = parseFloat(s.sport_wear_fee);
      const health = parseFloat(s.health_sanitation_fee);
      const total = reg + tui + voc + sport + health;
      const paidReg = paid['Registration'] || 0;
      const paidTui = paid['Tuition'] || 0;
      const paidVoc = paid['Vocational'] || 0;
      const paidSport = paid['Sport Wear'] || 0;
      const paidHealth = paid['Sanitation & Health'] || 0;
      const paidTotal = paidReg + paidTui + paidVoc + paidSport + paidHealth;
      return {
        name: s.full_name,
        Registration: paidReg,
        Tuition: paidTui,
        Vocational: paidVoc,
        'Sport Wear': paidSport,
        'Sanitation & Health': paidHealth,
        Total: paidTotal,
        Balance: Math.max(0, total - paidTotal),
        Status: paidTotal >= total ? 'Paid' : 'Owing'
      };
    });
    
    console.log(`[DEBUG] Returning ${stats.length} student stats for class ${classId}`);
    res.json(stats);
  } catch (error) {
    console.error('Error in /api/fees/class/:classId:', error);
    res.status(500).json({ error: 'Error fetching class fee stats', details: error.message });
  }
});

function verifyDatabaseStructure() {
  return new Promise((resolve, reject) => {
    const requiredTables = [
      'users',
      'students',
      'classes',
      'vocational',
      'teachers',
      'fees',
      'id_cards'
    ];

    const checkTable = (tableName) => {
      return new Promise((resolveTable, rejectTable) => {
        pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`, [tableName], (err, result) => {
          if (err) {
            console.error(`Error checking table ${tableName}:`, err);
            rejectTable(err);
          } else {
            if (result.rows[0].exists) {
              console.log(`Table ${tableName} exists`);
              resolveTable(true);
            } else {
              console.log(`Table ${tableName} does not exist`);
              resolveTable(false);
            }
          }
        });
      });
    };

    Promise.all(requiredTables.map(checkTable))
      .then((results) => {
        const allTablesExist = results.every(exists => exists);
        if (allTablesExist) {
          console.log('All required tables exist');
          resolve(true);
        } else {
          console.log('Some required tables are missing');
          resolve(false);
        }
      })
      .catch(reject);
  });
}

async function runMigrations() {
  try {
    console.log('Running migrations...');
    // Check if class_id column exists
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'class_id'"
    );
    const columns = result.rows;
    if (columns.length === 0) {
      console.log('Adding class_id column to students table...');
      await pool.query('ALTER TABLE students ADD COLUMN class_id INT');
      // Add foreign key constraint
      await pool.query(
        'ALTER TABLE students ADD CONSTRAINT students_ibfk_2 FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL'
      );
      console.log('class_id column and foreign key added successfully');
    } else {
      console.log('class_id column already exists');
    }
    // Assign first available class to students with NULL class_id
    const classResult = await pool.query('SELECT id FROM classes LIMIT 1');
    const classes = classResult.rows;
    if (classes.length > 0) {
      const classId = classes[0].id;
      const updateResult = await pool.query('UPDATE students SET class_id = $1 WHERE class_id IS NULL', [classId]);
      console.log(`Assigned class_id=${classId} to ${updateResult.rowCount} students with NULL class_id.`);
    } else {
      console.log('No classes found to assign to students.');
    }
    
    // Check if status column exists in teachers table
    const statusResult = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'status'"
    );
    const statusColumns = statusResult.rows;
    if (statusColumns.length === 0) {
      console.log('Adding status column to teachers table...');
      await pool.query('ALTER TABLE teachers ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT \'pending\' CHECK (status IN (\'pending\', \'approved\', \'rejected\'))');
      console.log('status column added successfully to teachers table');
    } else {
      console.log('status column already exists in teachers table');
    }

    // Check if status column exists in students table
    const studentStatusResult = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'status'"
    );
    const studentStatusColumns = studentStatusResult.rows;
    if (studentStatusColumns.length === 0) {
      console.log('Adding status column to students table...');
      await pool.query('ALTER TABLE students ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT \'pending\' CHECK (status IN (\'pending\', \'approved\', \'rejected\'))');
      console.log('status column added successfully to students table');
    } else {
      console.log('status column already exists in students table');
    }
  } catch (error) {
    console.error('Migration error:', error);
    // Don't throw error for migration failures, just log them
  }
}

const ensureAdminUser = async () => {
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
  }
};

const startServer = async () => {
  try {
    console.log('Starting server...');
    // Kill any process using port 5000
    if (process.platform === 'win32') {
      try {
        await execAsync('netstat -ano | findstr :5000');
        await execAsync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :5000\') do taskkill /F /PID %a');
        console.log('Killed existing process on port 5000');
      } catch (error) {
        // No process was found on port 5000, which is fine
      }
    } else {
      try {
        await execAsync('lsof -i :5000 | grep LISTEN | awk \'{print $2}\' | xargs kill -9');
        console.log('Killed existing process on port 5000');
      } catch (error) {
        // No process was found on port 5000, which is fine
      }
    }

    console.log('Connecting to database...');
    await pool.connect();
    console.log('Connected to database');
    // Ensure admin user exists
    await ensureAdminUser();
    // Verify database structure
    const structureValid = await verifyDatabaseStructure();
    console.log('Database structure checked:', structureValid);
    if (!structureValid) {
      console.log('Database structure invalid, initializing...');
      const initSuccess = await initializeDatabase();
      console.log('Database initialized:', initSuccess);
      if (!initSuccess) {
        throw new Error('Failed to initialize database');
      }
    } else {
      // Run migrations even if structure is valid
      await runMigrations();
      console.log('Migrations complete');
    }
    // Find available port
    const availablePort = await findAvailablePort(PORT);
    console.log('Available port found:', availablePort);
    app.listen(availablePort, () => {
      console.log(`Server running on port ${availablePort}`);
      console.log(`Frontend should be accessible at: http://localhost:${availablePort}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Debug endpoint to list all classes
app.get('/api/debug/classes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, user_id, year, created_at FROM classes ORDER BY created_at DESC');
    console.log(`[DEBUG] All classes in database:`, result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching debug classes:', error);
    res.status(500).json({ error: 'Error fetching classes' });
  }
});

// Debug endpoint to list all students and their classes
app.get('/api/debug/students', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can access debug students' });
  }
  try {
    const result = await pool.query(`
      SELECT s.id, s.full_name, s.user_id, s.class_id, u.username as registered_by
      FROM students s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching debug students:', error);
    res.status(500).json({ error: 'Error fetching students' });
  }
});

// Root endpoint for health check or friendly message
app.get('/', (req, res) => {
  res.json({ message: 'Welcome! The School API backend is running.' });
});