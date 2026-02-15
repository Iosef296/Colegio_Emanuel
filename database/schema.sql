CREATE DATABASE IF NOT EXISTS colegio_emanuel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE colegio_emanuel;

-- Users (padres, docentes, admins)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('padre','docente','admin') NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  dni VARCHAR(15),
  email VARCHAR(100),
  phone VARCHAR(20),
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Academic periods
CREATE TABLE academic_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  start_date DATE,
  end_date DATE
);

-- Grade levels (grados)
CREATE TABLE grade_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  section VARCHAR(5) NOT NULL,
  level ENUM('inicial','primaria','secundaria') NOT NULL,
  period_id INT NOT NULL,
  FOREIGN KEY (period_id) REFERENCES academic_periods(id)
);

-- Students
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  dni VARCHAR(15),
  birth_date DATE,
  grade_level_id INT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id)
);

-- Parent-Student relationship
CREATE TABLE parent_student (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  student_id INT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE KEY uk_parent_student (parent_id, student_id)
);

-- Courses
CREATE TABLE courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(10) DEFAULT '#3B82F6',
  description TEXT
);

-- Teacher-Course assignments
CREATE TABLE teacher_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  course_id INT NOT NULL,
  grade_level_id INT NOT NULL,
  period_id INT NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id),
  FOREIGN KEY (period_id) REFERENCES academic_periods(id),
  UNIQUE KEY uk_teacher_course_grade (teacher_id, course_id, grade_level_id, period_id)
);

-- Grades
CREATE TABLE grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  teacher_course_id INT NOT NULL,
  evaluation_name VARCHAR(20) NOT NULL,
  score DECIMAL(4,1) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (teacher_course_id) REFERENCES teacher_courses(id),
  UNIQUE KEY uk_grade (student_id, teacher_course_id, evaluation_name)
);

-- Attendance
CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  date DATE NOT NULL,
  status ENUM('temprano','tarde','falta','justificado') NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE KEY uk_attendance (student_id, date)
);

-- Payments
CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid TINYINT(1) DEFAULT 0,
  paid_date DATE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE KEY uk_payment (student_id, month, year)
);

-- Communications
CREATE TABLE communications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL,
  course_id INT,
  grade_level_id INT,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  type ENUM('general','curso','grado') DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id)
);

-- Daily progress
CREATE TABLE daily_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_course_id INT NOT NULL,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_course_id) REFERENCES teacher_courses(id)
);
