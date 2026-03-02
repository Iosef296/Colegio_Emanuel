-- Create ENUM types
CREATE TYPE user_role AS ENUM ('padre', 'docente', 'admin');
CREATE TYPE grade_level_type AS ENUM ('inicial', 'primaria', 'secundaria');
CREATE TYPE attendance_status AS ENUM ('temprano', 'tarde', 'falta', 'justificado');
CREATE TYPE communication_type AS ENUM ('general', 'curso', 'grado');

-- Users (padres, docentes, admins)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  dni VARCHAR(15),
  email VARCHAR(100),
  phone VARCHAR(20),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Academic periods
CREATE TABLE academic_periods (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  start_date DATE,
  end_date DATE
);

-- Grade levels (grados)
CREATE TABLE grade_levels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  section VARCHAR(5) NOT NULL,
  level grade_level_type NOT NULL,
  period_id INT NOT NULL,
  FOREIGN KEY (period_id) REFERENCES academic_periods(id)
);

-- Students
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  dni VARCHAR(15),
  birth_date DATE,
  grade_level_id INT NOT NULL,
  codigo VARCHAR(20) UNIQUE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id)
);
-- For existing databases: ALTER TABLE students ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE;

-- Parent-Student relationship
CREATE TABLE parent_student (
  id SERIAL PRIMARY KEY,
  parent_id INT NOT NULL,
  student_id INT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE (parent_id, student_id)
);

-- Courses
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(10) DEFAULT '#3B82F6',
  description TEXT
);

-- Teacher-Course assignments
CREATE TABLE teacher_courses (
  id SERIAL PRIMARY KEY,
  teacher_id INT NOT NULL,
  course_id INT NOT NULL,
  grade_level_id INT NOT NULL,
  period_id INT NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id),
  FOREIGN KEY (period_id) REFERENCES academic_periods(id),
  UNIQUE (teacher_id, course_id, grade_level_id, period_id)
);

-- Grades
CREATE TABLE grades (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  teacher_course_id INT NOT NULL,
  evaluation_name VARCHAR(20) NOT NULL,
  score DECIMAL(4,1) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (teacher_course_id) REFERENCES teacher_courses(id),
  UNIQUE (student_id, teacher_course_id, evaluation_name)
);

-- Attendance
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  date DATE NOT NULL,
  status attendance_status NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE (student_id, date)
);

-- Payments
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  month VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid BOOLEAN DEFAULT FALSE,
  paid_date DATE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE (student_id, month, year)
);

-- Communications
CREATE TABLE communications (
  id SERIAL PRIMARY KEY,
  author_id INT NOT NULL,
  course_id INT,
  grade_level_id INT,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  type communication_type DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id)
);

-- Daily progress
CREATE TABLE daily_progress (
  id SERIAL PRIMARY KEY,
  teacher_course_id INT NOT NULL,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_course_id) REFERENCES teacher_courses(id)
);
