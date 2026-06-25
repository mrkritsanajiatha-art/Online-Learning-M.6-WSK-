import { supabase } from './supabaseClient.js';

function mapUser(data) {
  return {
    UserID: data.id,
    FirstName: data.first_name,
    LastName: data.last_name,
    Role: data.role || 'Student',
    Class: data.class_name,
    Number: data.student_number,
    ProfileImage: data.profile_image || '',
    Nickname: data.nickname || '',
    Motto: data.motto || '',
    Dream: data.dream || '',
    TargetGoal: data.target_goal || '',
    Bio: data.bio || '',
    TeamId: data.team_id || null,
    YoutubeUrl: data.youtube_url || ''
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
    class_name: userObj.className,
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
  const { data: modules } = await supabase.from('modules').select('*').neq('display_order', 1).order('display_order', { ascending: true });
  return {
    success: true,
    dashboard: { xp: user?.xp || 0, level: user?.level || 'Beginner', streak: user?.streak || 0, badges: [], readiness: 100, recommendation: { weakness: 'None', module: 1 } },
    modules: modules?.map(m => ({ id: m.id, title: m.title, desc: m.description })) || []
  };
}

export async function getDashboardData(userId) {
  const { data: user } = await supabase.from('users').select('xp, level, streak').eq('id', userId).single();
  return { success: true, data: { xp: user?.xp || 0, level: user?.level || 'Beginner', streak: user?.streak || 0, badges: [], readiness: 100, recommendation: { weakness: 'None', module: 1 } } };
}

export async function getModules() {
  // Module 1 (display_order 1) is the Vocab pool for the Daily Quest — hidden from the lesson list
  const { data } = await supabase.from('modules').select('*').neq('display_order', 1).order('display_order', { ascending: true });
  return data?.map(m => ({ id: m.id, title: m.title, desc: m.description })) || [];
}

export async function getLeaderboard(className) {
  // All students, ranked by XP. Optional class filter. Admins excluded.
  const { data } = await supabase.from('users')
    .select('id, first_name, last_name, class_name, xp, profile_image, role')
    .order('xp', { ascending: false });
  const students = (data || []).filter(u => (u.role || 'Student') !== 'Admin');
  const classes = [...new Set(students.map(u => u.class_name).filter(Boolean))].sort();
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
  // xp
  let xp = 0;
  inWeek.forEach(r => {
    if (r.quiz_type === 'Bonus') return;
    xp += (r.quiz_type === 'WordBridge') ? (r.score || 0) : (r.score || 0) * 10;
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
    return { id: s.id, userId: s.user_id, name: anon ? 'ไม่ระบุตัวตน' : (u ? u.name : '-'), img: anon ? '' : (u ? u.img : ''), kind: s.kind, content: s.content, at: s.created_at, reactions: rc[s.id] || 0, anonymous: anon };
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
  return { success: true, story: { id: s.id, ownerId: s.user_id, name: anon ? 'ไม่ระบุตัวตน' : (u ? (u.first_name + ' ' + u.last_name) : '-'), cls: anon ? '' : (u ? u.class_name : ''), img: anon ? '' : (u ? u.profile_image : ''), kind: s.kind, content: s.content, at: s.created_at, anonymous: anon }, counts, mine };
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

export async function getCompletedModules(userId) {
  // A unit is "completed" once its Post-Test has been finished (recorded in scores)
  const { data } = await supabase.from('scores')
    .select('reference_id')
    .eq('user_id', String(userId).trim())
    .eq('quiz_type', 'PostTest');
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
    // → once ever per (type + reference_id)
    let q = supabase.from('scores').select('id').eq('user_id', uid).eq('quiz_type', quizType);
    if (referenceId !== null && referenceId !== undefined) q = q.eq('reference_id', referenceId);
    else q = q.is('reference_id', null);
    const { data: existing } = await q;
    if (existing && existing.length > 0) return { success: true, alreadyDone: true };
  }

  await supabase.from('scores').insert([{
    user_id: uid, quiz_type: quizType,
    reference_id: (referenceId !== null && referenceId !== undefined) ? referenceId : null,
    score, max_score: maxScore, time_spent: timeSpent || 0
  }]);
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
    class_name: s(f.className, 50),
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
  await supabase.from('users').update({
    last_login: new Date().toISOString(),
    streak: newStreak
  }).eq('id', uid);
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

export async function adminAddQuiz(moduleId, text, opt1, opt2, opt3, opt4, answer, explain) {
  await supabase.from('quiz_bank').insert([{ module_id: moduleId, question: text, choice_a: opt1, choice_b: opt2, choice_c: opt3, choice_d: opt4, correct_answer: answer, explanation: explain }]);
  return { success: true };
}

export async function getUserProfile(targetUserId) {
  const uid = String(targetUserId).trim();
  const { data: u } = await supabase.from('users')
    .select('id, first_name, last_name, class_name, xp, streak, profile_image, youtube_url, nickname, motto, dream, bio, target_goal')
    .eq('id', uid).single();
  if (!u) return { success: false, message: 'ไม่พบผู้ใช้' };
  const { data: scores } = await supabase.from('scores').select('quiz_type, reference_id').eq('user_id', uid);
  const completedModules = [...new Set((scores || []).filter(s => s.quiz_type === 'PostTest').map(s => s.reference_id))].length;
  const activities = (scores || []).length;
  return {
    success: true,
    user: {
      id: u.id, firstName: u.first_name, lastName: u.last_name, className: u.class_name,
      xp: u.xp || 0, streak: u.streak || 0, profileImage: u.profile_image || '',
      youtubeUrl: u.youtube_url || '', nickname: u.nickname || '',
      motto: u.motto || '', dream: u.dream || '', bio: u.bio || '', targetGoal: u.target_goal || ''
    },
    stats: { completedModules, activities }
  };
}
