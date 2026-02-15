USE colegio_emanuel;

-- Academic period
INSERT INTO academic_periods (id, year, name, start_date, end_date)
VALUES (1, 2026, 'Año Escolar 2026', '2026-03-01', '2026-12-15');

-- Grade level
INSERT INTO grade_levels (id, name, section, level, period_id)
VALUES (1, '4° Primaria', 'A', 'primaria', 1);

-- Users (passwords hashed with bcrypt - plaintext noted in comments)
-- Todos los usuarios usan contraseña: admin123
INSERT INTO users (id, username, password_hash, role, full_name, dni, email, phone) VALUES
(1, 'admin', '$2a$10$P/wGSOoaFtkFmVFmoHW0oemni.9YDNNt76B8GCNavk5pvVcAUD9Oy', 'admin', 'Administrador del Sistema', '00000000', 'admin@emanuel.edu.pe', '999000000'),
(2, 'garcia.maria', '$2a$10$P/wGSOoaFtkFmVFmoHW0oemni.9YDNNt76B8GCNavk5pvVcAUD9Oy', 'docente', 'María García', '12345678', 'garcia@emanuel.edu.pe', '999111111'),
(3, 'lopez.juan', '$2a$10$P/wGSOoaFtkFmVFmoHW0oemni.9YDNNt76B8GCNavk5pvVcAUD9Oy', 'docente', 'Juan López', '87654321', 'lopez@emanuel.edu.pe', '999222222'),
(4, 'quispe.pedro', '$2a$10$P/wGSOoaFtkFmVFmoHW0oemni.9YDNNt76B8GCNavk5pvVcAUD9Oy', 'padre', 'Pedro Quispe', '11111111', 'quispe@email.com', '999333333');

-- Students
INSERT INTO students (id, first_name, last_name, dni, birth_date, grade_level_id) VALUES
(1, 'Carlos', 'Quispe', '60000001', '2016-05-10', 1);

-- Parent-Student
INSERT INTO parent_student (parent_id, student_id) VALUES (4, 1);

-- Courses
INSERT INTO courses (id, name, color, description) VALUES
(1, 'Matemáticas', '#3B82F6', 'Curso de matemáticas'),
(2, 'Comunicación', '#10B981', 'Curso de comunicación'),
(3, 'Ciencias', '#8B5CF6', 'Curso de ciencias naturales'),
(4, 'Historia', '#F59E0B', 'Curso de historia'),
(5, 'Inglés', '#EC4899', 'Curso de inglés'),
(6, 'Arte', '#14B8A6', 'Curso de arte');

-- Teacher-Course assignments (Prof. Garcia teaches Math, Ciencias, Historia; Prof. Lopez teaches Comunicacion, Ingles, Arte)
INSERT INTO teacher_courses (id, teacher_id, course_id, grade_level_id, period_id) VALUES
(1, 2, 1, 1, 1),  -- Garcia - Matematicas
(2, 3, 2, 1, 1),  -- Lopez - Comunicacion
(3, 2, 3, 1, 1),  -- Garcia - Ciencias
(4, 2, 4, 1, 1),  -- Garcia - Historia
(5, 3, 5, 1, 1),  -- Lopez - Ingles
(6, 3, 6, 1, 1);  -- Lopez - Arte

-- Grades for Carlos Quispe
INSERT INTO grades (student_id, teacher_course_id, evaluation_name, score) VALUES
(1, 1, 'N1', 18), (1, 1, 'N2', 15), (1, 1, 'N3', 17),
(1, 2, 'N1', 14), (1, 2, 'N2', 16), (1, 2, 'N3', 15),
(1, 3, 'N1', 17), (1, 3, 'N2', 18), (1, 3, 'N3', 16),
(1, 4, 'N1', 15), (1, 4, 'N2', 14), (1, 4, 'N3', 16),
(1, 5, 'N1', 19), (1, 5, 'N2', 17), (1, 5, 'N3', 18),
(1, 6, 'N1', 16), (1, 6, 'N2', 18), (1, 6, 'N3', 17);

-- Attendance for Carlos in March 2026
INSERT INTO attendance (student_id, date, status) VALUES
(1, '2026-03-02', 'temprano'), (1, '2026-03-03', 'temprano'), (1, '2026-03-04', 'tarde'),
(1, '2026-03-05', 'temprano'), (1, '2026-03-06', 'temprano'),
(1, '2026-03-09', 'temprano'), (1, '2026-03-10', 'falta'), (1, '2026-03-11', 'temprano'),
(1, '2026-03-12', 'temprano'), (1, '2026-03-13', 'tarde'),
(1, '2026-03-16', 'temprano'), (1, '2026-03-17', 'temprano'), (1, '2026-03-18', 'temprano'),
(1, '2026-03-19', 'falta'), (1, '2026-03-20', 'temprano'),
(1, '2026-03-23', 'temprano'), (1, '2026-03-24', 'temprano'), (1, '2026-03-25', 'tarde'),
(1, '2026-03-26', 'temprano'), (1, '2026-03-27', 'temprano'),
-- April
(1, '2026-04-01', 'temprano'), (1, '2026-04-02', 'temprano'), (1, '2026-04-03', 'temprano'),
(1, '2026-04-06', 'tarde'), (1, '2026-04-07', 'temprano'),
(1, '2026-04-08', 'temprano'), (1, '2026-04-09', 'temprano'), (1, '2026-04-10', 'falta'),
(1, '2026-04-13', 'temprano'), (1, '2026-04-14', 'temprano');

-- Payments
INSERT INTO payments (student_id, month, year, amount, paid, paid_date) VALUES
(1, 'Marzo', 2026, 350.00, 1, '2026-03-05'),
(1, 'Abril', 2026, 350.00, 1, '2026-04-03'),
(1, 'Mayo', 2026, 350.00, 0, NULL),
(1, 'Junio', 2026, 350.00, 0, NULL),
(1, 'Julio', 2026, 350.00, 0, NULL),
(1, 'Agosto', 2026, 350.00, 0, NULL);

-- Communications
INSERT INTO communications (author_id, course_id, grade_level_id, title, body, type, created_at) VALUES
(2, 1, 1, 'Examen parcial', 'Se comunica que el examen parcial de Matemáticas será el día viernes 20 de febrero. Los temas a evaluar son: fracciones, decimales y operaciones combinadas. Se recomienda repasar los ejercicios del cuaderno.', 'curso', '2026-02-12 10:00:00'),
(1, NULL, NULL, 'Reunión de padres', 'Se convoca a reunión general de padres de familia para el día sábado 22 de febrero a las 9:00 AM en el auditorio del colegio. Tema: avance académico del primer bimestre.', 'general', '2026-02-10 10:00:00'),
(3, 2, 1, 'Tarea de lectura', 'Los alumnos deberán leer el capítulo 5 del libro \'El principito\' y realizar un resumen de una página para el día lunes.', 'curso', '2026-02-08 10:00:00');

-- Daily progress
INSERT INTO daily_progress (teacher_course_id, date, content) VALUES
(1, '2026-02-12', 'Se trabajó fracciones equivalentes. Los alumnos realizaron ejercicios prácticos en grupo.'),
(2, '2026-02-12', 'Análisis de texto narrativo. Se identificaron personajes principales y secundarios.'),
(1, '2026-02-11', 'Introducción a decimales. Conversión de fracciones a decimales.');
