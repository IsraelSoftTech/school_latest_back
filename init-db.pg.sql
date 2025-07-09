-- USERS table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    contact VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(20) NOT NULL DEFAULT 'user'
);

-- CLASSES table
CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    registration_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tuition_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    vocational_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    sport_wear_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    health_sanitation_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    number_of_installments INT NOT NULL DEFAULT 1,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- STUDENTS table
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    sex VARCHAR(10) CHECK (sex IN ('Male', 'Female')) NOT NULL,
    date_of_birth DATE NOT NULL,
    place_of_birth VARCHAR(255) NOT NULL,
    father_name VARCHAR(255) NOT NULL,
    mother_name VARCHAR(255) NOT NULL,
    class_id INT,
    previous_class VARCHAR(100),
    next_class VARCHAR(100),
    previous_average NUMERIC(5,2),
    guardian_contact VARCHAR(20) NOT NULL,
    student_picture VARCHAR(500),
    vocational_training VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- VOCATIONAL table
CREATE TABLE IF NOT EXISTS vocational (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    picture1 VARCHAR(500),
    picture2 VARCHAR(500),
    picture3 VARCHAR(500),
    picture4 VARCHAR(500),
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- TEACHERS table
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    teacher_name VARCHAR(255) NOT NULL,
    subjects TEXT NOT NULL,
    id_card VARCHAR(100),
    classes_taught TEXT,
    salary_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- FEES table
CREATE TABLE IF NOT EXISTS fees (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    class_id INT NOT NULL,
    fee_type VARCHAR(50) CHECK (fee_type IN ('Registration', 'Tuition', 'Vocational', 'Sport Wear', 'Sanitation & Health')) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ID_CARDS table
CREATE TABLE IF NOT EXISTS id_cards (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL,
    photo_url VARCHAR(500),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- INSERT default admin user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin1234') THEN
        INSERT INTO users (username, password, email, contact, is_default)
        VALUES (
            'admin1234',
            '$2b$10$5QFB6d0BXN1BAfY6KDm1P.D8p8KEXpVD4nqeVf1OKuR6nGhvHUHYy',
            'admin@example.com',
            '+237000000000',
            TRUE
        );
    END IF;
END
$$; 