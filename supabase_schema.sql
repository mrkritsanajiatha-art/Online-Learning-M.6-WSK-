-- ==========================================
-- Supabase Schema for Online Learning System
-- ==========================================

-- 1. Users Table (Students)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prefix VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    class_name VARCHAR(50),
    student_number INT,
    student_id VARCHAR(50) UNIQUE,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Student',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    profile_image TEXT,
    xp INT DEFAULT 0,
    level VARCHAR(50) DEFAULT 'Beginner',
    streak INT DEFAULT 0
);

-- 2. Modules Table
CREATE TABLE IF NOT EXISTS public.modules (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0
);

-- 3. Chapters Table
CREATE TABLE IF NOT EXISTS public.chapters (
    id SERIAL PRIMARY KEY,
    module_id INT REFERENCES public.modules(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    display_order INT DEFAULT 0
);

-- 4. Lessons Table
CREATE TABLE IF NOT EXISTS public.lessons (
    id SERIAL PRIMARY KEY,
    chapter_id INT REFERENCES public.chapters(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    video_url TEXT,
    display_order INT DEFAULT 0
);

-- 5. Flashcards Table
CREATE TABLE IF NOT EXISTS public.flashcards (
    id SERIAL PRIMARY KEY,
    module_id INT REFERENCES public.modules(id) ON DELETE CASCADE,
    chapter_id INT REFERENCES public.chapters(id) ON DELETE SET NULL,
    vocabulary VARCHAR(255) NOT NULL,
    pronunciation VARCHAR(255),
    meaning TEXT NOT NULL,
    example TEXT,
    thai_translation TEXT
);

-- 6. QuizBank Table
CREATE TABLE IF NOT EXISTS public.quiz_bank (
    id SERIAL PRIMARY KEY,
    module_id INT REFERENCES public.modules(id) ON DELETE CASCADE,
    chapter_id INT REFERENCES public.chapters(id) ON DELETE SET NULL,
    quiz_type VARCHAR(50),
    pattern VARCHAR(100),
    context TEXT,
    question TEXT NOT NULL,
    choice_a VARCHAR(255) NOT NULL,
    choice_b VARCHAR(255) NOT NULL,
    choice_c VARCHAR(255),
    choice_d VARCHAR(255),
    correct_answer VARCHAR(50) NOT NULL,
    explanation TEXT
);

-- 7. Scores Table
CREATE TABLE IF NOT EXISTS public.scores (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    quiz_type VARCHAR(50),
    reference_id INT,
    score INT NOT NULL,
    max_score INT NOT NULL,
    time_spent INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Progress Table
CREATE TABLE IF NOT EXISTS public.progress (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    module_id INT REFERENCES public.modules(id) ON DELETE CASCADE,
    chapter_id INT REFERENCES public.chapters(id) ON DELETE CASCADE,
    lesson_id INT REFERENCES public.lessons(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'Started',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Badges Table
CREATE TABLE IF NOT EXISTS public.badges (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    badge_name VARCHAR(100) NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Certificates Table
CREATE TABLE IF NOT EXISTS public.certificates (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    module_id INT REFERENCES public.modules(id) ON DELETE CASCADE,
    pdf_link TEXT NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Announcements Table
CREATE TABLE IF NOT EXISTS public.announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author VARCHAR(100),
    priority INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample modules
INSERT INTO public.modules (title, description, display_order) VALUES
('Vocab 1-5', 'คำศัพท์ที่ออกสอบบ่อยชุดที่ 1-5', 1),
('Mid 1.69', 'แนวข้อสอบกลางภาค 1/69', 2),
('Functional English', 'ทบทวนโครงสร้างประโยค', 3),
('Grammar Master', 'ตะลุยโจทย์ไวยากรณ์', 4);
