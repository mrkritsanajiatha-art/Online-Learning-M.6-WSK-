import { supabase } from './supabaseClient.js';

function mapUser(data) {
  return {
    UserID: data.id,
    FirstName: data.first_name,
    LastName: data.last_name,
    Role: data.role || 'Student',
    Class: data.class_name,
    Number: data.student_number,
    ProfileImage: data.profile_image || ''
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

export async function getLeaderboard() {
  const { data } = await supabase.from('users').select('first_name, last_name, class_name, xp, profile_image').order('xp', { ascending: false }).limit(10);
  return { success: true, data: data?.map(u => ({ name: `${u.first_name} ${u.last_name}`, className: u.class_name, xp: u.xp, profileImage: u.profile_image })) || [] };
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
  const { data: user } = await supabase.from('users').select('xp').eq('id', uid).single();
  if (user) {
    await supabase.from('users').update({ xp: user.xp + (score * 10) }).eq('id', uid);
  }
  return { success: true, alreadyDone: false };
}

export async function uploadProfileImage(userId, base64Str) {
  return { success: false, message: 'Upload via Base64 not supported in Supabase snippet directly yet. Needs Storage bucket setup.' };
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
  const { data: user } = await supabase.from('users').select('xp').eq('id', uid).single();
  if (user) await supabase.from('users').update({ xp: user.xp + award }).eq('id', uid);
  return { success: true, alreadyDone: false, awarded: award };
}

export async function adminAddQuiz(moduleId, text, opt1, opt2, opt3, opt4, answer, explain) {
  await supabase.from('quiz_bank').insert([{ module_id: moduleId, question: text, choice_a: opt1, choice_b: opt2, choice_c: opt3, choice_d: opt4, correct_answer: answer, explanation: explain }]);
  return { success: true };
}
