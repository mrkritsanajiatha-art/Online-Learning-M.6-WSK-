import { supabase } from './supabaseClient.js';

/* ============================================================
   รอบการเรียน (LESSON ROUND)
   ------------------------------------------------------------
   บทเรียนให้ XP เฉพาะ "ครั้งแรกที่ทำ" เพื่อกัน XP เฟ้อ
   เมื่อคุณครูเพิ่มเนื้อหาใหม่เข้าไปในบท จึงต้องเปิดรอบใหม่
   ให้นักเรียนที่เคยทำของเดิมกลับมาทำแล้วได้ XP อีกครั้ง

   วิธีเปิดรอบใหม่: เปลี่ยนวันที่ด้านล่างเป็นเวลาปัจจุบัน
   ผลที่เกิด: คะแนนที่บันทึกไว้ "ก่อน" วันนี้จะไม่นับว่าเคยทำแล้ว
              แต่ประวัติเดิมยังอยู่ครบในตาราง scores (ไม่มีการลบ)
              และ XP ที่นักเรียนสะสมไว้แล้วไม่ถูกหักคืน

   รอบที่ 3 — 20 ก.ค. 2026 ~23:00 น. (ไทย): ชุดคำศัพท์ปลายภาคใหม่ 66 คำ
   + คำถามใหม่ทั้งโมดูล 1 (96 ข้อ) + Grammar ใหม่ทุกโมดูล (40 ข้อ)
   ตั้งเป็นเวลา "หลังดีพลอย" เพื่อไม่บล็อก XP คนที่ทำระหว่างวัน
   ============================================================ */
export const LESSON_ROUND_START = '2026-07-20T16:00:00Z';

/* ============================================================
   ห้องเรียน — รายการกลางที่ใช้ร่วมกันทั้งแอป
   เดิมให้พิมพ์เอง จึงมีทั้ง "M.6/1", "6/1", "ม6/7", "ม.6/1 "
   และตัวที่มองไม่เห็นอย่าง zero-width space ปนมา ทำให้ตัวกรอง
   มองเป็นคนละห้อง — ตอนนี้เลือกจากรายการนี้เท่านั้น
   ============================================================ */
export const CLASS_OPTIONS = Array.from({ length: 10 }, (_, i) => `ม.6/${i + 1}`);

// ทำให้ค่าห้องที่พิมพ์มาแบบไหนก็ตาม กลายเป็นรูปแบบมาตรฐาน
// คืนค่า null ถ้าจับคู่ไม่ได้ (ปล่อยไว้ให้คนตรวจ ดีกว่าเดาผิด)
export function normalizeClassName(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/[​-‍﻿]/g, '') // ตัดอักขระล่องหน (zero-width)
    .replace(/\s+/g, '')                   // ตัดช่องว่างทุกตำแหน่ง
    .trim();
  const m = cleaned.match(/^(?:ม\.?|M\.?|m\.?)?6[/\-.](\d{1,2})$/);
  if (!m) return null;
  const room = parseInt(m[1], 10);
  if (room < 1 || room > 10) return null;
  return `ม.6/${room}`;
}

function mapUser(data) {
  return {
    UserID: data.id,
    FirstName: data.first_name,
    LastName: data.last_name,
    Role: data.role || 'Student',
    Class: data.class_name,
    Number: data.student_number,
    StudentId: data.student_id || '',
    ProfileImage: data.profile_image || '',
    Nickname: data.nickname || '',
    Motto: data.motto || '',
    Dream: data.dream || '',
    TargetGoal: data.target_goal || '',
    Bio: data.bio || '',
    TeamId: data.team_id || null,
    YoutubeUrl: data.youtube_url || '',
    EnglishLevel: data.english_level || null,
    PlacementDone: !!data.placement_done
  };
}

export async function loginUser(username, password) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password_hash', password)
    .single();
  if (error || !data) return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  return { success: true, user: mapUser(data) };
}

export async function registerStudent(userObj) {
  const { data: existing } = await supabase.from('users').select('id').eq('username', userObj.username).single();
  if (existing) return { success: false, message: 'Username นี้ถูกใช้งานแล้ว' };

  const { data, error } = await supabase.from('users').insert([{
    prefix: userObj.prefix,
    first_name: userObj.firstname,
    last_name: userObj.lastname,
    class_name: normalizeClassName(userObj.className),
    student_number: userObj.number,
    student_id: userObj.studentId,
    username: userObj.username,
    password_hash: userObj.password
  }]).select().single();

  if (error) return { success: false, message: error.message };
  return { success: true, user: mapUser(data) };
}

export async function getAppData(userId) {
  const { data: user } = await supabase.from('users').select('xp, level, streak').eq('id', userId).single();
  // Module 1 (display_order 1) is the Vocab pool for the Daily Quest — hidden from the lesson list
  const { data: modules } = await supabase.from('modules').select('*').order('display_order', { ascending: true });
  return {
    success: true,
    dashboard: { xp: user?.xp || 0, level: user?.level || 'Beginner', streak: user?.streak || 0, badges: [], readiness: 100, recommendation: { weakness: 'None', module: 1 } },
    modules: modules?.map(m => ({ id: m.id, title: m.title, desc: m.description, order: m.display_order })) || []
  };
}

export async function getDashboardData(userId) {
  const { data: user } = await supabase.from('users').select('xp, level, streak').eq('id', userId).single();
  return { success: true, data: { xp: user?.xp || 0, level: user?.level || 'Beginner', streak: user?.streak || 0, badges: [], readiness: 100, recommendation: { weakness: 'None', module: 1 } } };
}

/* display_order ทำหน้าที่แบ่งกลุ่มบทเรียน (ดู LESSON_GROUPS ใน main.js)
     1   = คลังคำศัพท์ของ Daily Quest เท่านั้น ไม่แสดงเป็นบทเรียน
     2-4 = บทเรียนกลางภาค (เก็บไว้ทบทวน)
     5+  = บทเรียนปลายภาค (รอบปัจจุบัน)
   จึงต้องส่ง display_order กลับไปด้วย ไม่งั้นหน้าบทเรียนแยกกลุ่มไม่ได้ */
export async function getModules() {
  const { data } = await supabase.from('modules').select('*').order('display_order', { ascending: true });
  return data?.map(m => ({ id: m.id, title: m.title, desc: m.description, order: m.display_order })) || [];
}

export async function getLeaderboard(className) {
  // All students, ranked by XP. Optional class filter. Admins excluded.
  const { data } = await supabase.from('users')
    .select('id, first_name, last_name, class_name, xp, profile_image, role')
    .order('xp', { ascending: false });
  const students = (data || []).filter(u => (u.role || 'Student') !== 'Admin');
  // เรียงตามเลขห้อง ไม่ใช่ตามตัวอักษร ไม่งั้น ม.6/10 จะมาแทรกก่อน ม.6/2
  const roomNo = (c) => { const m = String(c).match(/(\d+)$/); return m ? parseInt(m[1], 10) : 999; };
  const classes = [...new Set(students.map(u => u.class_name).filter(Boolean))]
    .sort((a, b) => roomNo(a) - roomNo(b) || String(a).localeCompare(b, 'th'));
  const filtered = className ? students.filter(u => u.class_name === className) : students;
  return {
    success: true,
    classes,
    data: filtered.map(u => ({ id: u.id, name: `${u.first_name} ${u.last_name}`, className: u.class_name, xp: u.xp, profileImage: u.profile_image }))
  };
}

export async function getDailyQuest() {
  const shuffle = (arr) => {
    const a = [...(arr || [])];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const mapQ = (q) => ({
    text: q.question,
    options: [q.choice_a, q.choice_b, q.choice_c, q.choice_d].filter(Boolean),
    correctAnswer: q.correct_answer,
    explanation: q.explanation,
    type: q.pattern === 'Grammar' ? 'Grammar' : 'Vocab'
  });

  // 9 vocab questions from module 1 (Vocab 1-5)
  const { data: vocabData } = await supabase
    .from('quiz_bank').select('*').eq('module_id', 1);

  // 1 grammar question from module 8 (Infinitive & Gerund)
  const { data: grammarData } = await supabase
    .from('quiz_bank').select('*').eq('module_id', 8).eq('pattern', 'Grammar');

  let vocab9 = shuffle(vocabData).slice(0, 9);
  let grammar1 = shuffle(grammarData).slice(0, 1);

  // Fallback: if not enough questions from specific modules, fill from all modules
  if (vocab9.length + grammar1.length < 10) {
    const { data: allData } = await supabase.from('quiz_bank').select('*');
    const all = shuffle(allData).slice(0, 10);
    return { success: true, data: all.map(mapQ) };
  }

  const combined = shuffle([...vocab9, ...grammar1]);
  return { success: true, data: combined.map(mapQ) };
}

export async function getQuizQuestions(moduleId, quizType) {
  let query = supabase.from('quiz_bank').select('*').eq('module_id', moduleId);
  if (quizType) query = query.eq('quiz_type', quizType);
  const { data } = await query;
  return {
    success: true,
    data: data?.map(q => ({
      text: q.question,
      context: q.context || null,
      options: [q.choice_a, q.choice_b, q.choice_c, q.choice_d].filter(Boolean),
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      pattern: q.pattern || null
    })) || []
  };
}

// Monday (Thailand) of the current week as YYYY-MM-DD
function bangkokMonday() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const day = now.getUTCDay();           // 0=Sun..6=Sat
  const diff = (day === 0 ? 6 : day - 1); // days since Monday
  now.setUTCDate(now.getUTCDate() - diff);
  return now.toISOString().split('T')[0];
}

function weekProgress(rows, goalType, weekStart) {
  const inWeek = (rows || []).filter(r => bangkokDate(r.created_at) >= weekStart);
  if (goalType === 'lessons') {
    return new Set(inWeek.filter(r => r.quiz_type === 'PostTest').map(r => r.reference_id)).size;
  }
  if (goalType === 'vocab') {
    return inWeek.filter(r => r.quiz_type === 'Flashcards').length;
  }
  // xp — mirror the XP actually awarded per activity type (see submitQuizScore,
  // submitGameScore, submitEnglishScore). Getting this wrong inflates the goal.
  let xp = 0;
  inWeek.forEach(r => {
    const t = r.quiz_type;
    const s = r.score || 0;
    if (t === 'Bonus') return;
    if (t === 'WordBridge') xp += s;                                   // score == XP awarded
    else if (t && t.indexOf('english_') === 0) xp += s > 0 ? Math.max(1, Math.floor(s / 10)) : 0; // English: floor(score/10)
    else xp += s * 10;                                                 // quizzes: score * 10
  });
  return xp;
}

export async function getWeeklyGoal(userId) {
  const uid = String(userId).trim();
  const weekStart = bangkokMonday();
  const { data: goals } = await supabase.from('weekly_goals')
    .select('*').eq('user_id', uid).eq('week_start', weekStart).order('created_at', { ascending: false }).limit(1);
  const goal = goals && goals[0] ? goals[0] : null;
  if (!goal) return { success: true, weekStart, goal: null };

  const { data: rows } = await supabase.from('scores').select('quiz_type, reference_id, score, created_at').eq('user_id', uid);
  const progress = weekProgress(rows, goal.goal_type, weekStart);
  const completed = progress >= goal.target;
  if (completed !== goal.completed || progress !== goal.progress) {
    await supabase.from('weekly_goals').update({ progress, completed }).eq('id', goal.id);
  }
  return { success: true, weekStart, goal: { id: goal.id, goalType: goal.goal_type, target: goal.target, progress, completed, justCompleted: completed && !goal.completed } };
}

export async function setWeeklyGoal(userId, goalType, target) {
  const uid = String(userId).trim();
  const weekStart = bangkokMonday();
  const t = Math.max(1, parseInt(target, 10) || 0);
  if (['lessons', 'xp', 'vocab'].indexOf(goalType) < 0) return { success: false, message: 'ประเภทเป้าหมายไม่ถูกต้อง' };
  // one active goal per week — replace existing
  await supabase.from('weekly_goals').delete().eq('user_id', uid).eq('week_start', weekStart);
  const { data: rows } = await supabase.from('scores').select('quiz_type, reference_id, score, created_at').eq('user_id', uid);
  const progress = weekProgress(rows, goalType, weekStart);
  const { error } = await supabase.from('weekly_goals').insert([{
    user_id: uid, week_start: weekStart, goal_type: goalType, target: t, progress, completed: progress >= t
  }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function getCommunityData() {
  // Derived entirely from existing data — no extra tables needed.
  const { data: users } = await supabase.from('users')
    .select('id, first_name, last_name, class_name, xp, streak, role, profile_image');
  const students = (users || []).filter(u => (u.role || 'Student') !== 'Admin');
  const { data: mods } = await supabase.from('modules').select('id, display_order');
  const unitOf = {};
  (mods || []).forEach(m => { if (m.display_order >= 5) unitOf[m.id] = m.display_order - 4; });

  // all scores (small table) for per-student aggregates + feed
  let all = [], from = 0, page = 1000;
  while (true) {
    const { data } = await supabase.from('scores').select('user_id, quiz_type, reference_id, score, created_at').order('created_at', { ascending: false }).range(from, from + page - 1);
    if (!data || !data.length) break;
    all = all.concat(data); if (data.length < page) break; from += page;
  }

  const info = {};
  students.forEach(s => { info[s.id] = { name: (s.first_name + ' ' + s.last_name).trim(), cls: s.class_name, xp: s.xp || 0, streak: s.streak || 0, img: s.profile_image || '', units: new Set(), quizzes: new Set(), activity: 0 }; });
  all.forEach(r => {
    const u = info[r.user_id]; if (!u) return;
    u.activity++;
    const t = r.quiz_type;
    if (t === 'PostTest') u.units.add(r.reference_id);
    if (['PreTest', 'Activity', 'PostTest', 'Quiz'].indexOf(t) >= 0) u.quizzes.add(t + '|' + r.reference_id);
  });

  const leaderBy = (metric) => {
    let best = null;
    students.forEach(s => {
      const u = info[s.id]; let v = 0;
      if (metric === 'xp') v = u.xp;
      else if (metric === 'streak') v = u.streak;
      else if (metric === 'quizzes') v = u.quizzes.size;
      else if (metric === 'units') v = u.units.size;
      else if (metric === 'activity') v = u.activity;
      if (v > 0 && (!best || v > best.value)) best = { holderId: s.id, holderName: u.name, value: v };
    });
    return best;
  };

  const titles = [
    Object.assign({ key: 'champion', emoji: '📚', label: 'Learning Champion', desc: 'XP สูงสุด', unit: 'XP' }, leaderBy('xp') || {}),
    Object.assign({ key: 'streakking', emoji: '🔥', label: 'Streak King', desc: 'เข้าต่อเนื่องนานสุด', unit: 'วัน' }, leaderBy('streak') || {}),
    Object.assign({ key: 'quizmaster', emoji: '🎯', label: 'Quiz Master', desc: 'ทำแบบทดสอบมากสุด', unit: 'ชุด' }, leaderBy('quizzes') || {}),
    Object.assign({ key: 'fastlearner', emoji: '🚀', label: 'Fast Learner', desc: 'เรียนจบ Unit มากสุด', unit: 'Unit' }, leaderBy('units') || {}),
    Object.assign({ key: 'communitystar', emoji: '💬', label: 'Community Star', desc: 'ขยันที่สุด', unit: 'กิจกรรม' }, leaderBy('activity') || {})
  ];

  // Feed = most recent activities
  const feed = all.slice(0, 30).map(r => {
    const u = info[r.user_id]; if (!u) return null;
    const t = r.quiz_type; let emoji = '✨', text = 'ทำกิจกรรม';
    if (t === 'PostTest') { emoji = '🎓'; text = 'เรียนจบ Unit ' + (unitOf[r.reference_id] || ''); }
    else if (t === 'Activity') { emoji = '✏️'; text = 'ทำแบบฝึกหัด'; }
    else if (t === 'PreTest') { emoji = '📋'; text = 'ทำแบบทดสอบก่อนเรียน'; }
    else if (t === 'Quiz') { emoji = '📝'; text = 'ทำแบบทดสอบ'; }
    else if (t === 'Flashcards') { emoji = '📚'; text = 'ท่องคำศัพท์จบ 1 ชุด'; }
    else if (t === 'Daily') { emoji = '⭐'; text = 'ทำแบบฝึกประจำวัน'; }
    else if (t === 'WordBridge') { emoji = '🌉'; text = 'เล่นเกมสะพานคำจบ (+' + r.score + ' EXP)'; }
    else if (t === 'Bonus') { emoji = '🎫'; text = 'ได้รับคะแนนพิเศษจากครู (+' + r.score + ')'; }
    return { userId: r.user_id, name: u.name, cls: u.cls, img: u.img, emoji: emoji, text: text, at: r.created_at };
  }).filter(Boolean);

  // Active stories (not expired) + reaction counts
  const nowIso = new Date().toISOString();
  const { data: stories } = await supabase.from('stories').select('*').gt('expires_at', nowIso).order('created_at', { ascending: false });
  const sIds = (stories || []).map(s => s.id);
  let reacts = [];
  if (sIds.length) { const r = await supabase.from('reactions').select('story_id').in('story_id', sIds); reacts = r.data || []; }
  const rc = {}; reacts.forEach(r => { rc[r.story_id] = (rc[r.story_id] || 0) + 1; });
  const storyOut = (stories || []).map(s => {
    const u = info[s.user_id];
    const anon = !!s.anonymous;
    return { id: s.id, userId: anon ? null : s.user_id, name: anon ? 'ไม่ระบุตัวตน' : (u ? u.name : '-'), img: anon ? '' : (u ? u.img : ''), kind: s.kind, content: s.content, at: s.created_at, reactions: rc[s.id] || 0, anonymous: anon };
  });

  // Showcase (pinned first)
  const { data: showcase } = await supabase.from('showcase').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30);
  const showOut = (showcase || []).map(s => { const u = info[s.user_id]; return { id: s.id, userId: s.user_id, name: u ? u.name : '-', img: u ? u.img : '', category: s.category, title: s.title, content: s.content, media: s.media_url, pinned: s.pinned, at: s.created_at }; });

  return { success: true, titles: titles, feed: feed, stories: storyOut, showcase: showOut };
}

export async function postStory(userId, kind, content, anonymous) {
  const c = (content || '').trim().slice(0, 300);
  if (!c) return { success: false, message: 'กรุณาใส่ข้อความ' };
  const { error } = await supabase.from('stories').insert([{ user_id: String(userId).trim(), kind: kind || 'text', content: c, anonymous: !!anonymous }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function getStory(storyId, userId) {
  const uid = String(userId).trim();
  const { data: s } = await supabase.from('stories').select('*').eq('id', storyId).single();
  if (!s) return { success: false, message: 'สตอรี่หมดอายุหรือถูกลบแล้ว' };
  const { data: u } = await supabase.from('users').select('first_name, last_name, profile_image, class_name').eq('id', s.user_id).single();
  const { data: rx } = await supabase.from('reactions').select('emoji, user_id').eq('story_id', storyId);
  const counts = {}; const mine = {};
  (rx || []).forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; if (r.user_id === uid) mine[r.emoji] = true; });
  const anon = !!s.anonymous;
  // Only reveal ownerId to the owner themselves (drives the delete button); never
  // leak the real author id of an anonymous story to other viewers.
  const isOwner = s.user_id === uid;
  return { success: true, story: { id: s.id, ownerId: isOwner ? s.user_id : null, name: anon ? 'ไม่ระบุตัวตน' : (u ? (u.first_name + ' ' + u.last_name) : '-'), cls: anon ? '' : (u ? u.class_name : ''), img: anon ? '' : (u ? u.profile_image : ''), kind: s.kind, content: s.content, at: s.created_at, anonymous: anon }, counts, mine };
}

export async function reactStory(storyId, userId, emoji) {
  const uid = String(userId).trim();
  const { data: ex } = await supabase.from('reactions').select('id').eq('story_id', storyId).eq('user_id', uid).eq('emoji', emoji);
  if (ex && ex.length) { await supabase.from('reactions').delete().eq('id', ex[0].id); return { success: true, active: false }; }
  const { error } = await supabase.from('reactions').insert([{ story_id: storyId, user_id: uid, emoji: emoji }]);
  if (error) return { success: false, message: error.message };
  return { success: true, active: true };
}

export async function deleteStory(storyId, userId) {
  await supabase.from('stories').delete().eq('id', storyId).eq('user_id', String(userId).trim());
  return { success: true };
}

export async function postShowcase(userId, category, title, content, mediaUrl) {
  const t = (title || '').trim().slice(0, 160);
  if (!t) return { success: false, message: 'กรุณาใส่ชื่อผลงาน' };
  const { error } = await supabase.from('showcase').insert([{
    user_id: String(userId).trim(), category: category || 'essay', title: t,
    content: (content || '').trim().slice(0, 2000), media_url: (mediaUrl || '').trim() || null
  }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function adminPinShowcase(id, pinned) {
  const { error } = await supabase.from('showcase').update({ pinned: !!pinned }).eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deleteShowcase(id, userId) {
  await supabase.from('showcase').delete().eq('id', id).eq('user_id', String(userId).trim());
  return { success: true };
}

/* ============================================================
   ความคืบหน้ารายสเต็ปของแต่ละโมดูล (รอบปัจจุบัน)
   ใช้ขับระบบล็อกตามลำดับ: Pre-test → คำศัพท์ → เนื้อหา →
   แกรมม่า → แบบทดสอบ → Post-test
   ============================================================ */
const STEP_TYPES = ['PreTest', 'Flashcards', 'LessonRead', 'Grammar', 'Activity', 'PostTest'];

export async function getModuleProgress(userId) {
  const { data } = await supabase.from('scores')
    .select('quiz_type, reference_id')
    .eq('user_id', String(userId).trim())
    .in('quiz_type', STEP_TYPES)
    .gte('created_at', LESSON_ROUND_START);
  const progress = {};
  (data || []).forEach(r => {
    if (r.reference_id == null) return;
    if (!progress[r.reference_id]) progress[r.reference_id] = {};
    progress[r.reference_id][r.quiz_type] = true;
  });
  return { success: true, progress };
}

/* สเต็ปไหนของโมดูลไหน "มีเนื้อหาจริง" บ้าง
   บางโมดูลไม่มีครบทุกสเต็ป (เช่น ชุดทบทวนกลางภาคไม่มีข้อสอบแกรมม่า)
   ถ้าไม่เช็คก่อน นักเรียนจะไปติดสเต็ปว่างแล้วปลดล็อกสเต็ปถัดไปไม่ได้เลย
   LessonRead ไม่ต้องเช็ค เพราะเป็นหน้าเนื้อหาที่เปิดอ่านได้เสมอ */
export async function getModuleStepAvailability() {
  const [qRes, fRes] = await Promise.all([
    supabase.from('quiz_bank').select('module_id, quiz_type'),
    supabase.from('flashcards').select('module_id')
  ]);
  const avail = {};
  const mark = (mid, key) => {
    if (mid == null) return;
    if (!avail[mid]) avail[mid] = {};
    avail[mid][key] = true;
  };
  (qRes.data || []).forEach(r => mark(r.module_id, r.quiz_type));
  (fRes.data || []).forEach(r => mark(r.module_id, 'Flashcards'));
  return { success: true, avail };
}

// บันทึกว่าอ่านเนื้อหาบทเรียนแล้ว (ได้ 10 XP ครั้งแรกของรอบ)
export async function markLessonRead(userId, moduleId) {
  return submitQuizScore(userId, 'LessonRead', Number(moduleId), 1, 1, 0);
}

export async function getCompletedModules(userId) {
  // A unit is "completed" once its Post-Test has been finished in the current round
  const { data } = await supabase.from('scores')
    .select('reference_id')
    .eq('user_id', String(userId).trim())
    .eq('quiz_type', 'PostTest')
    .gte('created_at', LESSON_ROUND_START);
  const ids = [...new Set((data || []).map(r => r.reference_id).filter(v => v != null))];
  return { success: true, data: ids };
}

export async function getFlashcards(moduleId) {
  const { data } = await supabase.from('flashcards').select('*').eq('module_id', moduleId);
  return { success: true, data: data?.map(f => ({ vocab: f.vocabulary, pronun: f.pronunciation, meaning: f.meaning, example: f.example })) || [] };
}

// Thailand calendar date (UTC+7) as YYYY-MM-DD — used so "once per day" follows local day
function bangkokDate(dateLike) {
  const t = (dateLike ? new Date(dateLike) : new Date()).getTime();
  return new Date(t + 7 * 3600 * 1000).toISOString().split('T')[0];
}

export async function submitQuizScore(userId, quizType, referenceId, score, maxScore, timeSpent) {
  const uid = String(userId).trim();

  // ---- Anti-leak: award XP only on the first successful completion ----
  // Bonus is admin-controlled (capped elsewhere) and never grants XP here.
  if (quizType === 'Bonus') return { success: true, alreadyDone: false };

  if (quizType === 'Daily') {
    // Daily Quest → once per (Thailand) day
    const today = bangkokDate();
    const { data } = await supabase.from('scores')
      .select('created_at').eq('user_id', uid).eq('quiz_type', 'Daily')
      .order('created_at', { ascending: false }).limit(1);
    if (data && data[0] && bangkokDate(data[0].created_at) === today) {
      return { success: true, alreadyDone: true };
    }
  } else {
    // All other learning activities (PreTest / Activity / PostTest / Quiz / Flashcards)
    // → once per (type + reference_id) ต่อหนึ่งรอบการเรียน
    // นับเฉพาะที่ทำในรอบปัจจุบัน ของเก่าก่อนเปิดรอบใหม่จึงไม่บล็อก XP
    let q = supabase.from('scores').select('id')
      .eq('user_id', uid).eq('quiz_type', quizType)
      .gte('created_at', LESSON_ROUND_START);
    if (referenceId !== null && referenceId !== undefined) q = q.eq('reference_id', referenceId);
    else q = q.is('reference_id', null);
    const { data: existing } = await q;
    if (existing && existing.length > 0) return { success: true, alreadyDone: true };
  }

  const { error: insErr } = await supabase.from('scores').insert([{
    user_id: uid, quiz_type: quizType,
    reference_id: (referenceId !== null && referenceId !== undefined) ? referenceId : null,
    score, max_score: maxScore, time_spent: timeSpent || 0
  }]);
  // Only award XP if the score row was actually written — otherwise XP would be
  // granted with no backing record (or double-granted on a duplicate insert).
  if (insErr) return { success: false, message: insErr.message };
  await supabase.rpc('add_xp', { p_uid: uid, p_amount: score * 10 });
  return { success: true, alreadyDone: false };
}

export async function uploadProfileImage(userId, base64Str) {
  // Cropped image is a small JPEG data URL stored directly in the TEXT column
  const { error } = await supabase.from('users').update({ profile_image: base64Str }).eq('id', String(userId).trim());
  if (error) return { success: false, message: error.message };
  return { success: true, url: base64Str };
}

export async function updateProfileName(userId, firstName, lastName) {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  if (!fn) return { success: false, message: 'กรุณากรอกชื่อ' };
  const { error } = await supabase.from('users')
    .update({ first_name: fn, last_name: ln })
    .eq('id', String(userId).trim());
  if (error) return { success: false, message: error.message };
  return { success: true, firstName: fn, lastName: ln };
}

export async function updateProfile(userId, f) {
  const s = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
  const fn = s(f.firstName, 100);
  if (!fn) return { success: false, message: 'กรุณากรอกชื่อ' };
  const num = parseInt(f.number, 10);
  const payload = {
    first_name: fn,
    last_name: s(f.lastName, 100),
    nickname: s(f.nickname, 60),
    class_name: normalizeClassName(f.className),
    student_number: isNaN(num) ? null : num,
    motto: s(f.motto, 120),
    dream: s(f.dream, 160),
    target_goal: s(f.targetGoal, 160),
    bio: s(f.bio, 300),
    youtube_url: (f.youtubeUrl || '').trim().slice(0, 500) || null
  };
  const { error } = await supabase.from('users').update(payload).eq('id', String(userId).trim());
  if (error) return { success: false, message: error.message };
  return { success: true, payload: payload };
}

export async function recordLogin(userId) {
  // Real streak: consecutive Thailand-days. Awards a daily login bonus (once/day).
  const uid = String(userId).trim();
  const { data: u } = await supabase.from('users').select('xp, streak, last_login').eq('id', uid).single();
  if (!u) return { success: false };
  const today = bangkokDate();
  const last = u.last_login ? bangkokDate(u.last_login) : null;
  if (last === today) {
    return { success: true, streak: u.streak || 0, bonus: 0, already: true };
  }
  const yesterday = bangkokDate(Date.now() - 24 * 3600 * 1000);
  const newStreak = (last === yesterday) ? (u.streak || 0) + 1 : 1;
  const bonus = Math.min(50, newStreak * 10); // day1=10 … day5+=50 per day
  // Compare-and-swap on last_login so two concurrent logins (two tabs/devices)
  // can't both award the daily bonus: only the update that still matches the
  // previously-read last_login wins; the loser matches 0 rows and skips XP.
  let upd = supabase.from('users').update({ last_login: new Date().toISOString(), streak: newStreak });
  upd = u.last_login ? upd.eq('last_login', u.last_login) : upd.is('last_login', null);
  const { data: claimed, error: updErr } = await upd.eq('id', uid).select('id');
  if (updErr) return { success: false, message: updErr.message };
  if (!claimed || claimed.length === 0) {
    return { success: true, streak: newStreak, bonus: 0, already: true };
  }
  if (bonus > 0) await supabase.rpc('add_xp', { p_uid: uid, p_amount: bonus });
  return { success: true, streak: newStreak, bonus, already: false };
}

export async function adminGetTables() {
  return { success: true, data: ['users', 'modules', 'chapters', 'lessons', 'flashcards', 'quiz_bank', 'scores', 'progress', 'badges', 'certificates', 'announcements'] };
}

export async function adminGetTableData(tableName) {
  const { data, error } = await supabase.from(tableName).select('*').limit(50);
  if (error || !data || data.length === 0) return { success: true, headers: [], data: [] };
  return { success: true, headers: Object.keys(data[0]), data: data };
}

export async function adminUpdateRow(tableName, idField, idValue, updates) {
  await supabase.from(tableName).update(updates).eq(idField, idValue);
  return { success: true };
}

export async function adminInsertRow(tableName, newData) {
  const cleanData = {};
  for (const k in newData) { if (newData[k] !== '') cleanData[k] = newData[k]; }
  const { error } = await supabase.from(tableName).insert([cleanData]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function adminDeleteRow(tableName, idField, idValue) {
  await supabase.from(tableName).delete().eq(idField, idValue);
  return { success: true };
}

export async function adminExportScoresCSV(className) {
  return { success: false, message: 'ฟีเจอร์นี้ยังไม่เปิดใช้งาน' };
}

export async function getBonusScore(userId) {
  const { data } = await supabase
    .from('scores')
    .select('score, created_at')
    .eq('user_id', String(userId).trim())
    .eq('quiz_type', 'Bonus')
    .order('created_at', { ascending: false });
  const total = Math.min(100, (data || []).reduce((sum, r) => sum + (r.score || 0), 0));
  return { success: true, total, history: data || [] };
}

export async function adminScanGetUser(userId) {
  // userId may be UUID string or numeric string
  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, class_name, student_number, profile_image')
    .eq('id', String(userId).trim())
    .single();
  if (error || !data) return { success: false, message: 'ไม่พบผู้เรียนในระบบ' };
  const bonusRes = await getBonusScore(userId);
  return { success: true, user: data, currentBonus: bonusRes.total };
}

export async function adminGiveBonus(targetUserId, points, adminUserId) {
  const bonusRes = await getBonusScore(targetUserId);
  const canAdd = Math.min(points, 100 - bonusRes.total);
  if (canAdd <= 0) return { success: false, message: 'ผู้เรียนคนนี้ได้รับคะแนนพิเศษครบ 100 แล้ว' };
  const { error } = await supabase.from('scores').insert([{
    user_id: targetUserId,
    quiz_type: 'Bonus',
    score: canAdd,
    reference_id: 0,
    max_score: 100,
    time_spent: 0
  }]);
  if (error) return { success: false, message: error.message };
  return { success: true, given: canAdd, newTotal: bonusRes.total + canAdd };
}

export async function getGameStatus(userId, gameKey) {
  const { data } = await supabase.from('scores')
    .select('id, score')
    .eq('user_id', String(userId).trim())
    .eq('quiz_type', gameKey);
  return { success: true, played: !!(data && data.length > 0), score: data && data[0] ? data[0].score : 0 };
}

export async function submitGameScore(userId, gameKey, exp) {
  // One-time EXP per game (ever). exp already 0-100.
  const uid = String(userId).trim();
  const { data: existing } = await supabase.from('scores').select('id').eq('user_id', uid).eq('quiz_type', gameKey);
  if (existing && existing.length > 0) return { success: true, alreadyDone: true, awarded: 0 };
  const award = Math.max(0, Math.min(100, Math.round(exp || 0)));
  const { error } = await supabase.from('scores').insert([{
    user_id: uid, quiz_type: gameKey, reference_id: null, score: award, max_score: 100, time_spent: 0
  }]);
  if (error) return { success: false, message: error.message };
  if (award > 0) await supabase.rpc('add_xp', { p_uid: uid, p_amount: award });
  return { success: true, alreadyDone: false, awarded: award };
}

export async function submitPlacementResult(userId, level, score) {
  const uid = String(userId).trim();
  const { error } = await supabase.from('users')
    .update({ english_level: level, placement_done: true })
    .eq('id', uid);
  if (error) return { success: false, message: error.message };
  // Award XP for completing placement (once)
  await supabase.rpc('add_xp', { p_uid: uid, p_amount: 50 });
  return { success: true };
}

export async function adminAddQuiz(moduleId, text, opt1, opt2, opt3, opt4, answer, explain) {
  const { error } = await supabase.from('quiz_bank').insert([{ module_id: moduleId, question: text, choice_a: opt1, choice_b: opt2, choice_c: opt3, choice_d: opt4, correct_answer: answer, explanation: explain }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/* ===== FEED POSTS (text, optional anonymous) ===== */

export async function createPost(userId, content, anonymous) {
  const c = (content || '').trim().slice(0, 1000);
  if (!c) return { success: false, message: 'กรุณาใส่ข้อความ' };
  const { error } = await supabase.from('posts').insert([{
    user_id: String(userId).trim(), content: c, anonymous: !!anonymous
  }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deletePost(postId, userId) {
  await supabase.from('posts').delete().eq('id', postId).eq('user_id', String(userId).trim());
  return { success: true };
}

// Toggle reaction on a post (adds if absent, removes if present).
export async function addPostReaction(postId, userId, emoji) {
  const uid = String(userId).trim();
  const { data: existing } = await supabase.from('post_reactions')
    .select('id').eq('post_id', postId).eq('user_id', uid).eq('emoji', emoji).maybeSingle();
  if (existing) {
    await supabase.from('post_reactions').delete().eq('id', existing.id);
    return { success: true, action: 'removed' };
  }
  await supabase.from('post_reactions').insert([{ post_id: postId, user_id: uid, emoji }]);
  return { success: true, action: 'added' };
}

// Fetch comments for a post with user info.
export async function getPostComments(postId) {
  const { data: comments } = await supabase.from('post_comments')
    .select('id, user_id, content, created_at')
    .eq('post_id', postId).order('created_at', { ascending: true });
  const ids = [...new Set((comments || []).map(c => c.user_id))];
  const info = {};
  if (ids.length) {
    const { data: users } = await supabase.from('users')
      .select('id, first_name, last_name, profile_image').in('id', ids);
    (users || []).forEach(u => { info[u.id] = { name: (u.first_name + ' ' + u.last_name).trim(), img: u.profile_image || '' }; });
  }
  return { success: true, comments: (comments || []).map(c => ({
    id: c.id, userId: c.user_id,
    name: info[c.user_id] ? info[c.user_id].name : '-',
    img: info[c.user_id] ? info[c.user_id].img : '',
    content: c.content, at: c.created_at
  })) };
}

// Add a comment to a post.
export async function addPostComment(postId, userId, content) {
  const c = (content || '').trim().slice(0, 500);
  if (!c) return { success: false, message: 'กรุณาใส่ข้อความ' };
  const { error } = await supabase.from('post_comments')
    .insert([{ post_id: postId, user_id: String(userId).trim(), content: c }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

// Combined feed: active stories (24h) + latest text posts with reaction/comment counts.
export async function getFeedData(viewerId) {
  const vid = viewerId ? String(viewerId).trim() : null;

  // ----- text posts (latest 100) -----
  const { data: posts } = await supabase.from('posts')
    .select('id, user_id, content, anonymous, created_at')
    .order('created_at', { ascending: false }).limit(100);

  // ----- active stories -----
  const nowIso = new Date().toISOString();
  const { data: stories } = await supabase.from('stories')
    .select('*').gt('expires_at', nowIso).order('created_at', { ascending: false });

  // user info needed for both
  const ids = new Set();
  (posts || []).forEach(p => ids.add(p.user_id));
  (stories || []).forEach(s => ids.add(s.user_id));
  const info = {};
  if (ids.size) {
    const { data: users } = await supabase.from('users')
      .select('id, first_name, last_name, class_name, profile_image').in('id', [...ids]);
    (users || []).forEach(u => { info[u.id] = { name: (u.first_name + ' ' + u.last_name).trim(), cls: u.class_name || '', img: u.profile_image || '' }; });
  }

  // story reaction counts
  const sIds = (stories || []).map(s => s.id);
  let reacts = [];
  if (sIds.length) { const r = await supabase.from('reactions').select('story_id').in('story_id', sIds); reacts = r.data || []; }
  const rc = {}; reacts.forEach(r => { rc[r.story_id] = (rc[r.story_id] || 0) + 1; });
  const storyOut = (stories || []).map(s => {
    const u = info[s.user_id]; const anon = !!s.anonymous;
    return { id: s.id, userId: anon ? null : s.user_id, name: anon ? 'ไม่ระบุตัวตน' : (u ? u.name : '-'), img: anon ? '' : (u ? u.img : ''), kind: s.kind, content: s.content, at: s.created_at, reactions: rc[s.id] || 0, anonymous: anon };
  });

  // post reactions + comment counts
  const pIds = (posts || []).map(p => p.id);
  let postRxRows = [], myRxRows = [], cmtRows = [];
  if (pIds.length) {
    const [rxRes, myRxRes, cmtRes] = await Promise.all([
      supabase.from('post_reactions').select('post_id, emoji').in('post_id', pIds),
      vid ? supabase.from('post_reactions').select('post_id, emoji').in('post_id', pIds).eq('user_id', vid) : Promise.resolve({ data: [] }),
      supabase.from('post_comments').select('post_id').in('post_id', pIds)
    ]);
    postRxRows = rxRes.data || [];
    myRxRows = myRxRes.data || [];
    cmtRows = cmtRes.data || [];
  }

  // aggregate reactions per post
  const rxCounts = {}; // { postId: { heart: 3, fire: 1 } }
  postRxRows.forEach(r => {
    if (!rxCounts[r.post_id]) rxCounts[r.post_id] = {};
    rxCounts[r.post_id][r.emoji] = (rxCounts[r.post_id][r.emoji] || 0) + 1;
  });
  const myRx = {}; // { postId: { heart: true } }
  myRxRows.forEach(r => {
    if (!myRx[r.post_id]) myRx[r.post_id] = {};
    myRx[r.post_id][r.emoji] = true;
  });
  const cmtCount = {}; // { postId: 5 }
  cmtRows.forEach(r => { cmtCount[r.post_id] = (cmtCount[r.post_id] || 0) + 1; });

  const postOut = (posts || []).map(p => {
    const u = info[p.user_id]; const anon = !!p.anonymous;
    const isMine = vid && p.user_id === vid;
    return {
      id: p.id, userId: anon ? null : p.user_id, ownerId: (anon && !isMine) ? null : p.user_id,
      name: anon ? 'ไม่ระบุตัวตน' : (u ? u.name : '-'),
      cls: anon ? '' : (u ? u.cls : ''),
      img: anon ? '' : (u ? u.img : ''),
      content: p.content, at: p.created_at, anonymous: anon, mine: isMine,
      reactions: rxCounts[p.id] || {},
      myReactions: myRx[p.id] || {},
      commentCount: cmtCount[p.id] || 0
    };
  });

  return { success: true, stories: storyOut, posts: postOut };
}

// Posts for one profile wall — anonymous posts are excluded (would reveal author).
export async function getUserPosts(targetUserId) {
  const uid = String(targetUserId).trim();
  const { data: posts } = await supabase.from('posts')
    .select('id, content, created_at')
    .eq('user_id', uid).eq('anonymous', false)
    .order('created_at', { ascending: false }).limit(50);
  return { success: true, posts: (posts || []).map(p => ({ id: p.id, content: p.content, at: p.created_at })) };
}

export async function getEnglishProgress(userId) {
  const uid = String(userId).trim();
  const { data } = await supabase.from('scores')
    .select('quiz_type, score, max_score')
    .eq('user_id', uid)
    .in('quiz_type', ['english_grammar', 'english_vocab', 'english_reading']);
  const best = {};
  (data || []).forEach(function(row) {
    if (!best[row.quiz_type] || row.score > best[row.quiz_type].score) {
      best[row.quiz_type] = { score: row.score, maxScore: row.max_score };
    }
  });
  const totalExp = Object.values(best).reduce(function(s, v) { return s + (v.score || 0); }, 0);
  return { success: true, progress: best, totalExp };
}

export async function submitEnglishScore(userId, moduleId, score, maxScore) {
  const uid = String(userId).trim();
  const quizType = 'english_' + moduleId;
  await supabase.from('scores').insert([{
    user_id: uid, quiz_type: quizType, reference_id: null,
    score: score, max_score: maxScore, time_spent: 0
  }]);
  const xp = score > 0 ? Math.max(1, Math.floor(score / 10)) : 0;
  if (xp > 0) await supabase.rpc('add_xp', { p_uid: uid, p_amount: xp });
  return { success: true, awarded: score };
}

export async function getUserProfile(targetUserId) {
  const uid = String(targetUserId).trim();
  const { data: u, error: uErr } = await supabase.from('users')
    .select('*')
    .eq('id', uid).single();
  if (uErr || !u) return { success: false, message: 'ไม่พบผู้ใช้' };

  // Run remaining queries in parallel
  const [scoresRes, rankRes] = await Promise.all([
    supabase.from('scores').select('quiz_type, reference_id, score, max_score').eq('user_id', uid),
    supabase.from('users').select('id', { count: 'exact', head: true }).gt('xp', u.xp || 0)
  ]);

  const scores = scoresRes.data || [];
  const rank = (rankRes.count || 0) + 1;

  const completedModules = [...new Set(scores.filter(s => s.quiz_type === 'PostTest').map(s => s.reference_id))].length;
  const activities = scores.length;

  const engBest = {};
  scores.filter(s => ['english_grammar','english_vocab','english_reading'].includes(s.quiz_type)).forEach(s => {
    if (!engBest[s.quiz_type] || s.score > engBest[s.quiz_type].score)
      engBest[s.quiz_type] = { score: s.score, maxScore: s.max_score };
  });
  const engData = {
    placementDone: !!u.placement_done,
    englishLevel: u.english_level || null,
    grammarPct: engBest['english_grammar'] ? Math.round((engBest['english_grammar'].score / engBest['english_grammar'].maxScore) * 100) : 0,
    vocabDone:   !!engBest['english_vocab'],
    readingPct:  engBest['english_reading'] ? Math.round((engBest['english_reading'].score / engBest['english_reading'].maxScore) * 100) : 0,
    totalEngExp: Object.values(engBest).reduce((s, v) => s + (v.score || 0), 0)
  };

  return {
    success: true,
    user: {
      id: u.id, firstName: u.first_name, lastName: u.last_name, className: u.class_name,
      xp: u.xp || 0, streak: u.streak || 0, profileImage: u.profile_image || '',
      youtubeUrl: u.youtube_url || '', nickname: u.nickname || '',
      motto: u.motto || '', dream: u.dream || '', bio: u.bio || '', targetGoal: u.target_goal || ''
    },
    stats: { completedModules, activities },
    rank: rank,
    english: engData
  };
}

/* ============================================================
   ANNOUNCEMENTS (การ์ดประกาศตอนเข้าระบบ)
   รูปเก็บเป็น data URL ใน TEXT column เหมือน profile_image
   ============================================================ */

// ประกาศที่กำลังแสดงอยู่ (เอาอันล่าสุดที่ยังเปิดใช้งาน)
// ประกาศที่เปิดอยู่ทั้งหมด — หน้าแอปจะหมุนสลับให้ทีละใบ
// เรียงจากเก่าไปใหม่ เพื่อให้ลำดับที่นักเรียนเห็นตรงกับลำดับที่ครูสร้าง
export async function getActiveAnnouncements() {
  const { data, error } = await supabase.from('announcements')
    .select('id, title, content, image, created_at')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) return { success: false, message: error.message };
  return { success: true, items: data || [] };
}

// รายการประกาศทั้งหมดสำหรับหน้าแอดมิน
export async function adminListAnnouncements() {
  const { data, error } = await supabase.from('announcements')
    .select('id, title, content, image, active, created_at')
    .order('created_at', { ascending: false });
  if (error) return { success: false, message: error.message };
  return { success: true, items: data || [] };
}

export async function adminCreateAnnouncement(title, content, imageDataUrl, author) {
  const t = (title || '').trim();
  if (!t) return { success: false, message: 'กรุณาใส่หัวข้อประกาศ' };
  // เปิดพร้อมกันได้หลายอัน แอปจะหมุนสลับให้เอง จึงไม่ปิดของเดิม
  const { error } = await supabase.from('announcements').insert([{
    title: t,
    content: (content || '').trim(),
    image: imageDataUrl || null,
    author: author || null,
    active: true
  }]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function adminSetAnnouncementActive(id, active) {
  const { error } = await supabase.from('announcements').update({ active: !!active }).eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function adminDeleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/* ============================================================
   รายงานคะแนนรายบุคคล — หน้า "เช็คคะแนนของฉัน"
   ดึงจากตาราง scores ที่บันทึกไว้จริง ไม่ได้คำนวณใหม่
   ============================================================ */
export async function getMyScoreReport(userId) {
  const uid = String(userId).trim();
  const [uRes, mRes, sRes] = await Promise.all([
    supabase.from('users').select('xp, streak, english_level, class_name').eq('id', uid).single(),
    supabase.from('modules').select('id, title, display_order').order('display_order', { ascending: true }),
    supabase.from('scores').select('quiz_type, reference_id, score, max_score, created_at').eq('user_id', uid)
  ]);

  const u = uRes.data || {};
  const modules = mRes.data || [];
  const scores = sRes.data || [];

  // อันดับ = จำนวนคนที่ XP มากกว่าเรา + 1 (ต้องรู้ XP ของเราก่อน จึงแยกออกมา)
  const { count: aheadCount } = await supabase.from('users')
    .select('id', { count: 'exact', head: true })
    .gt('xp', u.xp || 0)
    .neq('role', 'Admin');

  // เก็บครั้งที่ทำได้ดีที่สุดของแต่ละพาร์ท (นักเรียนทำซ้ำได้)
  const best = {};
  scores.forEach(s => {
    const key = s.quiz_type + '|' + (s.reference_id == null ? '-' : s.reference_id);
    const pct = s.max_score ? s.score / s.max_score : 0;
    if (!best[key] || pct > best[key].pct) best[key] = { score: s.score, max: s.max_score, pct, at: s.created_at };
  });

  const PARTS = [
    { key: 'PreTest',  label: 'ทดสอบก่อนเรียน' },
    { key: 'Activity', label: 'แบบฝึกหัด' },
    { key: 'PostTest', label: 'ทดสอบหลังเรียน' }
  ];

  let got = 0, full = 0;
  const units = modules.map((m, i) => {
    const parts = PARTS.map(p => {
      const b = best[p.key + '|' + m.id] || null;
      if (b) { got += b.score; full += b.max; }
      return { key: p.key, label: p.label, done: !!b, score: b ? b.score : null, max: b ? b.max : null };
    });
    return { id: m.id, no: i + 1, title: m.title, parts, doneCount: parts.filter(p => p.done).length };
  });

  const dailyCount = scores.filter(s => s.quiz_type === 'Daily').length;
  const flashCount = scores.filter(s => s.quiz_type === 'Flashcards').length;
  const bonus = Math.min(100, scores.filter(s => s.quiz_type === 'Bonus').reduce((t, s) => t + (s.score || 0), 0));

  return {
    success: true,
    xp: u.xp || 0,
    streak: u.streak || 0,
    englishLevel: u.english_level || null,
    className: u.class_name || '',
    rank: (aheadCount || 0) + 1,
    units,
    totals: { got, full, pct: full ? Math.round((got / full) * 100) : 0 },
    dailyCount, flashCount, bonus
  };
}

/* ============================================================
   วิเคราะห์พัฒนาการผู้เรียน — หน้า "พัฒนาการของฉัน"
   (a) เทียบ Pre-test vs Post-test รายเลเวล ว่าพัฒนาขึ้นกี่ %
   (b) แนวโน้ม XP/กิจกรรมย้อนหลัง 6 สัปดาห์
   ============================================================ */
export async function getLearningAnalytics(userId) {
  const uid = String(userId).trim();
  const [mRes, sRes] = await Promise.all([
    supabase.from('modules').select('id, title, display_order').order('display_order', { ascending: true }),
    supabase.from('scores').select('quiz_type, reference_id, score, max_score, created_at').eq('user_id', uid)
  ]);
  const modules = mRes.data || [];
  const scores = sRes.data || [];

  // ---- (a) Pre vs Post ต่อโมดูล (ครั้งที่ดีที่สุด) ----
  const best = {};
  scores.forEach(s => {
    if (s.quiz_type !== 'PreTest' && s.quiz_type !== 'PostTest') return;
    const key = s.quiz_type + '|' + s.reference_id;
    const pct = s.max_score ? Math.round((s.score / s.max_score) * 100) : 0;
    if (best[key] == null || pct > best[key]) best[key] = pct;
  });
  const units = modules.map((m, i) => {
    const pre = best['PreTest|' + m.id];
    const post = best['PostTest|' + m.id];
    return {
      no: i + 1, title: m.title,
      prePct: pre == null ? null : pre,
      postPct: post == null ? null : post,
      delta: (pre != null && post != null) ? post - pre : null
    };
  });
  const deltas = units.filter(u => u.delta != null).map(u => u.delta);
  const summary = {
    compared: deltas.length,
    improved: deltas.filter(d => d > 0).length,
    avgDelta: deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0
  };

  // ---- (b) แนวโน้มรายสัปดาห์ (6 สัปดาห์ล่าสุด) ----
  // XP ต่อแถวคิดตามสูตรเดียวกับที่ระบบให้จริง (ดู weekProgress)
  const xpOf = (r) => {
    const t = r.quiz_type, s = r.score || 0;
    if (t === 'Bonus') return 0;
    if (t === 'WordBridge') return s;
    if (t && t.indexOf('english_') === 0) return s > 0 ? Math.max(1, Math.floor(s / 10)) : 0;
    return s * 10;
  };
  const mondayOf = (dateLike) => {
    const d = new Date(new Date(dateLike).getTime() + 7 * 3600 * 1000);
    const diff = (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1);
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().split('T')[0];
  };
  const weeks = [];
  const thisMonday = new Date(mondayOf(new Date()));
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const ws = d.toISOString().split('T')[0];
    weeks.push({ weekStart: ws, label: (d.getUTCDate()) + '/' + (d.getUTCMonth() + 1), xp: 0, count: 0 });
  }
  const byWeek = {};
  weeks.forEach(w => { byWeek[w.weekStart] = w; });
  scores.forEach(r => {
    const w = byWeek[mondayOf(r.created_at)];
    if (!w) return;
    w.xp += xpOf(r);
    w.count += 1;
  });

  return { success: true, units, summary, weekly: weeks };
}

/* ============================================================
   คะแนนกลางภาค — ดึงจาก Google Apps Script ของครู
   (ระบบเดิมที่ doogradeengkrit-m6 ใช้อยู่ ตัวเดียวกัน)

   หมายเหตุ: ทดสอบแล้วว่าฝั่ง Apps Script ค้นจาก "รหัสนักเรียน"
   อย่างเดียว พารามิเตอร์ห้อง/วิชาถูกเพิกเฉย จึงส่งไปเท่าที่จำเป็น
   และไม่ต้องให้นักเรียนเลือกห้องเองอีก
   ============================================================ */
const GRADE_API = 'https://script.google.com/macros/s/AKfycbwd7BSra2sNSqFwhRn8MesuiDiWehgrlhxEs0n6ybtZZAewoJpYUfJaItroQSTpAFL4bA/exec';

// ห้องที่มีข้อมูลคะแนนในชีต (ห้องที่ครูกฤษณะสอน)
export const GRADE_ROOMS = ['ม.6/2', 'ม.6/4', 'ม.6/6', 'ม.6/8', 'ม.6/9'];

// นักเรียนที่ล็อกอินค้างไว้ตั้งแต่ก่อนอัปเดต จะไม่มี StudentId ใน localStorage
// จึงมีทางดึงจากฐานข้อมูลให้อีกทาง
export async function getStudentIdOf(userId) {
  const { data } = await supabase.from('users').select('student_id').eq('id', String(userId).trim()).single();
  return { success: true, studentId: (data && data.student_id) || '' };
}

export async function getMidtermGrade(studentId) {
  const sid = String(studentId || '').trim();
  if (!/^\d{4,6}$/.test(sid)) {
    return { success: false, reason: 'bad_id', message: 'กรุณากรอกเลขประจำตัวนักเรียน 5 หลัก' };
  }
  try {
    const url = GRADE_API + '?grade=m6&subject=eng_vocab&room=&lastname=&id=' + encodeURIComponent(sid);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'success') {
      return { success: true, student: data.student, scores: data.scores || [], lastUpdate: data.lastUpdate || '' };
    }
    return { success: false, reason: 'not_found', message: data.message || 'ไม่พบข้อมูลคะแนนของเลขประจำตัวนี้' };
  } catch (e) {
    return { success: false, reason: 'network', message: 'เชื่อมต่อระบบคะแนนไม่ได้ ลองใหม่อีกครั้งนะ' };
  }
}
