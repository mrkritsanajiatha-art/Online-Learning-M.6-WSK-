/**
 * Learning Management System Logic
 * Analytics, Gamification, Badges, Leaderboard
 */

// XP Thresholds for Levels
const LEVELS = [
  { name: "Beginner", minXP: 0 },
  { name: "Learner", minXP: 500 },
  { name: "Explorer", minXP: 1000 },
  { name: "Advanced", minXP: 2500 },
  { name: "Expert", minXP: 5000 },
  { name: "Master", minXP: 8000 },
  { name: "Champion", minXP: 12000 },
  { name: "Scholar", minXP: 15000 },
  { name: "Elite", minXP: 20000 },
  { name: "Parallel Master", minXP: 30000 }
];

function calculateLevel(xp) {
  let currentLevel = LEVELS[0].name;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXP) {
      currentLevel = LEVELS[i].name;
    } else {
      break;
    }
  }
  return currentLevel;
}

function getDashboardData(userId) {
  try {
    const userScores = DB.findMany('Scores', 'UserID', userId) || [];
    const totalXP = userScores.reduce((sum, record) => sum + (Number(record.Score) * 10), 0);
    const currentLevel = calculateLevel(totalXP);
    const userBadges = DB.findMany('Badges', 'UserID', userId) || [];
    const streak = Math.min(userScores.length, 30);
    
    let completedLessons = 0;
    try {
      completedLessons = DB.findMany('Progress', 'UserID', userId).filter(p => p.Status === 'Completed').length;
    } catch(e) {}

    return {
      success: true,
      data: {
        xp: totalXP,
        level: currentLevel,
        streak: streak,
        completedLessons: completedLessons,
        readiness: Math.min(100, Math.round((totalXP / 500) * 100)),
        badges: userBadges.map(b => b.BadgeName),
        recommendation: {
          weakness: totalXP < 100 ? 'Vocabulary' : 'Grammar',
          module: totalXP < 100 ? 1 : 3
        }
      }
    };
  } catch(e) {
    Logger.log(e);
    return { success: false, message: e.toString() };
  }
}

function submitQuizScore(userId, quizType, referenceId, score, maxScore, timeSpent) {
  try {
    // If it's Daily Quest, check if they already got points today
    if (referenceId === 'Daily') {
      const today = new Date().toISOString().split('T')[0];
      const allScores = DB.findMany('Scores', 'UserID', userId);
      const dailyScoresToday = allScores.filter(s => s.ReferenceID === 'Daily' && s.Timestamp && s.Timestamp.startsWith(today));
      
      if (dailyScoresToday.length > 0) {
        return { success: true, message: "Already claimed daily points", earnedBadges: [] };
      }
    }

    DB.insertData('Scores', {
      ScoreID: 'SCR-' + Utilities.getUuid(),
      UserID: userId,
      QuizType: quizType,
      ReferenceID: referenceId,
      Score: score,
      MaxScore: maxScore,
      TimeSpent: timeSpent,
      Timestamp: new Date().toISOString()
    });

    let earnedBadges = [];
    if (score === maxScore) {
      const badgeName = "Perfect Score";
      const existing = DB.findMany('Badges', 'UserID', userId).filter(b => b.BadgeName === badgeName);
      if (existing.length === 0) {
        awardBadge(userId, badgeName);
        earnedBadges.push(badgeName);
      }
    }

    return { success: true, earnedBadges: earnedBadges };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function awardBadge(userId, badgeName) {
  DB.insertData('Badges', {
    BadgeID: 'BDG-' + Utilities.getUuid(),
    UserID: userId,
    BadgeName: badgeName,
    EarnedAt: new Date().toISOString()
  });
}

function getLeaderboard(classFilter) {
  try {
    let students = DB.getDataAsObjects('Students');
    if (classFilter) {
      students = students.filter(s => s.Class === classFilter);
    }
    const allScores = DB.getDataAsObjects('Scores') || [];
    
    const leaderboard = students.map(student => {
      const userScores = allScores.filter(s => s.UserID === student.UserID);
      const totalXP = userScores.reduce((sum, record) => sum + (Number(record.Score) * 10), 0);
      return {
        name: student.FirstName + ' ' + student.LastName,
        className: student.Class,
        xp: totalXP,
        level: calculateLevel(totalXP),
        profileImage: student.ProfileImage || null
      };
    });

    leaderboard.sort((a, b) => b.xp - a.xp);
    return { success: true, data: leaderboard.slice(0, 50) };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Get all initial data for the app in a single call (speed optimization)
 */
function getAppData(userId) {
  try {
    var dashData = getDashboardData(userId);
    var modules = getModules();
    return {
      success: true,
      dashboard: dashData.success ? dashData.data : null,
      modules: modules
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Shuffle array helper
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Get Daily Quest (80% Vocab, 20% Exam)
 */
function getDailyQuest() {
  try {
    // 1. Get 2 Exam/Grammar Questions (20%)
    let examQs = [];
    examQs = examQs.concat(getQuizQuestions(2).data || []);
    examQs = examQs.concat(getQuizQuestions(3).data || []);
    examQs = examQs.concat(getQuizQuestions(4).data || []);
    examQs = examQs.concat(getQuizQuestions(5).data || []);
    examQs = shuffleArray(examQs).slice(0, 2);
    
    // 2. Generate 8 Vocab Questions dynamically from Flashcards (80%)
    let allCards = [];
    for (let i = 1; i <= 6; i++) {
      let res = getFlashcards(i);
      if (res && res.data) allCards = allCards.concat(res.data);
    }
    
    let vocabQs = [];
    if (allCards.length > 0) {
      allCards = shuffleArray(allCards);
      for (let i = 0; i < 8 && i < allCards.length; i++) {
        let targetCard = allCards[i];
        let wrongCards = shuffleArray(allCards.filter(c => c.id !== targetCard.id)).slice(0, 3);
        let options = [targetCard.meaning, ...wrongCards.map(c => c.meaning)];
        options = shuffleArray(options); // shuffle choices
        
        vocabQs.push({
          id: 'DYN_VOC_' + targetCard.id,
          text: `คำศัพท์ "${targetCard.vocab}" มีความหมายตรงกับข้อใด?`,
          options: options,
          correctAnswer: targetCard.meaning,
          explanation: `"${targetCard.vocab}" แปลว่า ${targetCard.meaning}\\nตัวอย่าง: ${targetCard.example}`
        });
      }
    } else {
      // Fallback
      vocabQs = vocabQs.concat(getQuizQuestions(1).data || []);
      vocabQs = vocabQs.concat(getQuizQuestions(6).data || []);
      vocabQs = shuffleArray(vocabQs).slice(0, 8);
    }
    
    // Combine and shuffle order
    let dailyQs = vocabQs.concat(examQs);
    dailyQs = shuffleArray(dailyQs);
    
    return { success: true, data: dailyQs };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Get Quiz Questions for a Module - Real Content for M.6 English
 */
function getQuizQuestions(moduleId) {
  var mid = Number(moduleId);
  var questions = [];

  if (mid === 1) {
    // Module 1: Vocab 1-5
    questions = [
      { id:'V1', text:'The teacher asked us to ________ the new vocabulary before the test.', options:['memorize','memory','memorial','memorable'], correctAnswer:'memorize', explanation:'memorize (v.) = ท่องจำ, memory (n.) = ความจำ' },
      { id:'V2', text:'She felt ________ after hearing the good news.', options:['delighted','delighting','delight','delightful'], correctAnswer:'delighted', explanation:'delighted (adj.) = ดีใจมาก ใช้กับคน (felt + adj.)' },
      { id:'V3', text:'The government will ________ a new policy next month.', options:['implement','imply','import','improve'], correctAnswer:'implement', explanation:'implement = นำไปปฏิบัติ/ดำเนินการ' },
      { id:'V4', text:'His ________ behavior surprised everyone at the party.', options:['peculiar','popular','particular','partial'], correctAnswer:'peculiar', explanation:'peculiar = แปลกประหลาด, พิเศษเฉพาะตัว' },
      { id:'V5', text:'We need to ________ the problem before it gets worse.', options:['address','dress','assess','access'], correctAnswer:'address', explanation:'address (v.) = จัดการ/แก้ไขปัญหา' },
      { id:'V6', text:'The movie was so ________ that I fell asleep.', options:['tedious','tremendous','terrific','tender'], correctAnswer:'tedious', explanation:'tedious = น่าเบื่อ, จืดชืด' },
      { id:'V7', text:'She has a strong ________ to succeed in her career.', options:['determination','destination','destruction','demonstration'], correctAnswer:'determination', explanation:'determination = ความมุ่งมั่น ตั้งใจ' },
      { id:'V8', text:'The doctor advised him to ________ from smoking.', options:['abstain','obtain','contain','maintain'], correctAnswer:'abstain', explanation:'abstain from = งดเว้นจาก' }
    ];
  } else if (mid === 2) {
    // Module 2: Mid 1.69 - แนวข้อสอบกลางภาค
    questions = [
      { id:'M1', text:'If I ________ you, I would apologize immediately.', options:['were','am','was','be'], correctAnswer:'were', explanation:'If + S + were... (Conditional Type 2: สมมติไม่จริงในปัจจุบัน)' },
      { id:'M2', text:'The report ________ by the manager yesterday.', options:['was approved','approved','has approved','is approved'], correctAnswer:'was approved', explanation:'Passive Voice อดีต: was/were + V3' },
      { id:'M3', text:'She asked me where I ________ the previous day.', options:['had been','have been','was being','am'], correctAnswer:'had been', explanation:'Reported Speech: เลื่อน Tense ถอยหลัง (was → had been)' },
      { id:'M4', text:'________ the rain, the football match continued.', options:['Despite','Although','Because','However'], correctAnswer:'Despite', explanation:'Despite + N/V-ing (แม้ว่า...) ตามด้วยคำนาม' },
      { id:'M5', text:'Not only ________ intelligent, but she is also hardworking.', options:['is she','she is','she was','was she'], correctAnswer:'is she', explanation:'Not only + Aux + S (Inversion) กลับประธานกับกริยาช่วย' },
      { id:'M6', text:'By the time we arrived, the movie ________.', options:['had already started','already started','has started','starts'], correctAnswer:'had already started', explanation:'By the time + Past Simple → Past Perfect (had + V3)' },
      { id:'M7', text:'I wish I ________ harder for the exam last week.', options:['had studied','studied','have studied','would study'], correctAnswer:'had studied', explanation:'Wish + Past Perfect = เสียดายสิ่งที่ผ่านมาแล้ว' },
      { id:'M8', text:'The more you practice, the ________ you become.', options:['better','best','good','well'], correctAnswer:'better', explanation:'The + comparative, the + comparative (ยิ่ง...ยิ่ง...)' }
    ];
  } else if (mid === 3) {
    // Module 3: Functional English
    questions = [
      { id:'F1', text:'"Would you mind ________ the window?" — "Not at all."', options:['opening','open','to open','opened'], correctAnswer:'opening', explanation:'Would you mind + V-ing? (ขอร้องสุภาพ)' },
      { id:'F2', text:'A: "I failed my driving test." B: "________"', options:['That is too bad.','Congratulations!','How wonderful!','Lucky you!'], correctAnswer:'That is too bad.', explanation:'แสดงความเสียใจ/เห็นใจ ใช้ That is too bad.' },
      { id:'F3', text:'A: "Could you tell me how to get to the station?" B: "________"', options:['Go straight and turn left.','I am fine, thanks.','Yes, I could.','No problem at all.'], correctAnswer:'Go straight and turn left.', explanation:'ตอบคำถามถามทาง = บอกเส้นทาง' },
      { id:'F4', text:'"I am sorry for being late." — "________"', options:['Never mind.','You are welcome.','Not bad.','How do you do?'], correctAnswer:'Never mind.', explanation:'ตอบรับคำขอโทษ = Never mind. / That is OK.' },
      { id:'F5', text:'A: "Shall we go to the movies tonight?" B: "________"', options:['That sounds great!','I am sorry to hear that.','How do you do?','Thank you anyway.'], correctAnswer:'That sounds great!', explanation:'ตอบรับคำชวน = That sounds great! / Sure!' },
      { id:'F6', text:'A: "How about having pizza for dinner?" B: "________"', options:['Good idea!','How do you do?','Nice to meet you.','Never mind.'], correctAnswer:'Good idea!', explanation:'How about + V-ing? เป็นการเสนอแนะ ตอบรับด้วย Good idea!' }
    ];
  } else if (mid === 4) {
    // Module 4: Grammar Master
    questions = [
      { id:'G1', text:'She ________ English since she was five years old.', options:['has studied','studied','studies','is studying'], correctAnswer:'has studied', explanation:'since + เวลาในอดีต → Present Perfect (has/have + V3)' },
      { id:'G2', text:'The book ________ on the table belongs to Mary.', options:['lying','lies','lied','lay'], correctAnswer:'lying', explanation:'Reduced Relative Clause: The book (which is) lying...' },
      { id:'G3', text:'I look forward to ________ from you soon.', options:['hearing','hear','heard','be heard'], correctAnswer:'hearing', explanation:'look forward to + V-ing (to เป็น preposition ไม่ใช่ to-infinitive)' },
      { id:'G4', text:'________ he tried hard, he could not pass the exam.', options:['Although','Despite','Because','However'], correctAnswer:'Although', explanation:'Although + S + V (แม้ว่า... + ประโยค)' },
      { id:'G5', text:'She is used to ________ up early every morning.', options:['getting','get','got','gets'], correctAnswer:'getting', explanation:'be used to + V-ing = คุ้นเคยกับการ...' },
      { id:'G6', text:'If I had known about the party, I ________ there.', options:['would have gone','would go','will go','went'], correctAnswer:'would have gone', explanation:'Conditional Type 3: If + had + V3, would have + V3' },
      { id:'G7', text:'The man ________ car was stolen reported to the police.', options:['whose','who','which','whom'], correctAnswer:'whose', explanation:'whose + noun = ของผู้ซึ่ง (แสดงความเป็นเจ้าของ)' },
      { id:'G8', text:'He suggested that she ________ a doctor.', options:['see','sees','saw','seeing'], correctAnswer:'see', explanation:'suggest + that + S + V1 (Subjunctive Mood)' }
    ];
  } else if (mid === 5) {
    // Module 5: Parallel Midterm Test
    questions = [
      { id:'P1', text:"Shall we take a taxi to get to WSK school or the motorcycle?", options:["Yes, I think that's right", "Whichever is the quickest", "The taxi goes to WSK school", "It takes around 10 minutes"], correctAnswer:"Whichever is the quickest", explanation:"ถามให้เลือกพาหนะ ตอบ 'อันไหนเร็วกว่าก็เอาอันนั้น' เหมาะที่สุด" },
      { id:'P2', text:"Why aren't you coming to school today?", options:["Let me check my schedule first", "I'm feeling under the weather", "She said she was too bored", "Sorry, I couldn't go tomorrow"], correctAnswer:"I'm feeling under the weather", explanation:"under the weather = รู้สึกไม่ค่อยสบาย/ป่วย" },
      { id:'P3', text:"Are you really thinking of moving abroad?", options:["I'm sure you'll like it there", "It's something I'm considering", "I've been there several times", "Things are improving all the time"], correctAnswer:"It's something I'm considering", explanation:"consider = พิจารณา/กำลังคิดอยู่ ตรงกับคำถาม thinking of" },
      { id:'P4', text:"Could you tell me why the website keeps crashing?", options:["You should try going online", "I don't have my own website", "It provides useful information", "There's a problem with the server"], correctAnswer:"There's a problem with the server", explanation:"เหตุผลที่เว็บล่ม คือ ปัญหาที่เซิร์ฟเวอร์ (server problem)" },
      { id:'P5', text:"What's your vision for the next few years?", options:["I want us to be a market leader", "I really love to challenge myself", "There's nothing wrong with my vision", "It takes a few years to see with my vision"], correctAnswer:"I want us to be a market leader", explanation:"vision (วิสัยทัศน์ขององค์กร) = การตั้งเป้าหมายเป็นผู้นำตลาด (market leader)" },
      { id:'P6', text:"Which of the following would be the best title for this passage? (Passage about package sizes shrinking)", options:["Shoppers are in favor of lower product prices", "Consumers are spending less on food products", "Shrinkflation now becomes a global phenomenon", "Manufactures experience a decline in product sales"], correctAnswer:"Shrinkflation now becomes a global phenomenon", explanation:"จากเนื้อเรื่องพูดถึง Shrinkflation ที่เกิดขึ้นทั่วโลก" },
      { id:'P7', text:"Which of the following is NOT a cause of shrinkflation mentioned?", options:["Higher packaging costs", "Higher raw material costs", "Higher demand for labor", "Higher transportation charges"], correctAnswer:"Higher demand for labor", explanation:"ในเนื้อเรื่องพูดถึง labor costs แต่ไม่ได้บอกเรื่อง higher demand for labor" },
      { id:'P8', text:"They managed ________ the finish line despite the extreme heat and exhaustion.", options:["reach", "reaching", "to reaching", "to reach"], correctAnswer:"to reach", explanation:"manage + to-infinitive (manage to do something)" },
      { id:'P9', text:"We are really looking forward to ________ you at the farewell party next Friday.", options:["see", "seeing", "to see", "seen"], correctAnswer:"seeing", explanation:"look forward to + V-ing/Noun (to ตัวนี้เป็น preposition)" },
      { id:'P10', text:"She enjoys ________ novels before going to bed every night.", options:["to read", "reading", "read", "to reading"], correctAnswer:"reading", explanation:"enjoy + V-ing (ชื่นชอบการทำอะไรบางอย่าง)" }
    ];
  } else if (mid === 6) {
    // Module 6: Daily Vocabulary
    questions = [
      { id:'DQ1', text:"The team ________ five members.", options:["consist of", "consists of", "assist", "insist"], correctAnswer:"consists of", explanation:"consist of แปลว่า ประกอบด้วย ประธาน The team เป็นเอกพจน์ กริยาต้องเติม s" },
      { id:'DQ2', text:"I study hard ________ pass the exam.", options:["in order to", "because", "unless", "even though"], correctAnswer:"in order to", explanation:"in order to แปลว่า เพื่อที่จะ ตามด้วย V.infinitive" },
      { id:'DQ3', text:"COVID-19 is a global ________.", options:["pandemic", "epidemic", "plague", "outbreak"], correctAnswer:"pandemic", explanation:"pandemic หมายถึง การระบาดใหญ่ที่แพร่ขยายไปทั่วโลก" },
      { id:'DQ4', text:"She works as a ________ for a Japanese company.", options:["translator", "transformer", "transmitter", "transit"], correctAnswer:"translator", explanation:"translator แปลว่า นักแปล" },
      { id:'DQ5', text:"You will fail ________ you study.", options:["unless", "if", "whether", "provided"], correctAnswer:"unless", explanation:"unless แปลว่า ถ้าไม่ (if not) ใช้เพื่อแสดงเงื่อนไขที่จำเป็น" }
    ];
  }

  return { success: true, data: questions };
}

/**
 * Get Flashcards for a Module - Real Vocabulary Content
 */
function getFlashcards(moduleId) {
  var mid = Number(moduleId);
  var cards = [];

  if (mid === 1) {
    cards = [
      { id:'FC1', vocab:'Diligence', pronun:'/dil-i-juhns/', meaning:'ความขยันหมั่นเพียร', example:'Her diligence paid off when she got the scholarship.' },
      { id:'FC2', vocab:'Perseverance', pronun:'/pur-suh-veer-uhns/', meaning:'ความอุตสาหะ', example:'Success requires perseverance and hard work.' },
      { id:'FC3', vocab:'Accomplish', pronun:'/uh-kom-plish/', meaning:'ทำสำเร็จ', example:'She accomplished her goal of graduating with honors.' },
      { id:'FC4', vocab:'Determine', pronun:'/dih-tur-min/', meaning:'ตัดสินใจ, กำหนด', example:'We need to determine the cause of the problem.' },
      { id:'FC5', vocab:'Consequence', pronun:'/kon-suh-kwens/', meaning:'ผลที่ตามมา', example:'Every action has a consequence.' },
      { id:'FC6', vocab:'Significant', pronun:'/sig-nif-i-kuhnt/', meaning:'สำคัญ, มีนัยสำคัญ', example:'There has been a significant improvement.' }
    ];
  } else if (mid === 2) {
    cards = [
      { id:'FC7', vocab:'Conditional', pronun:'/kuhn-dish-uh-nl/', meaning:'เงื่อนไข, ประโยคเงื่อนไข', example:'Conditional sentences use "if" clauses.' },
      { id:'FC8', vocab:'Passive Voice', pronun:'/pas-iv vois/', meaning:'กรรมวาจก (ถูกกระทำ)', example:'The cake was made by my mother.' },
      { id:'FC9', vocab:'Tense', pronun:'/tens/', meaning:'กาล (Past/Present/Future)', example:'Use the correct tense to express time.' },
      { id:'FC10', vocab:'Subordinate', pronun:'/suh-bor-duh-nit/', meaning:'อนุประโยค, รอง', example:'A subordinate clause cannot stand alone.' },
      { id:'FC11', vocab:'Conjunction', pronun:'/kuhn-jungk-shuhn/', meaning:'คำเชื่อม (and, but, or)', example:'Use conjunctions to connect ideas.' },
      { id:'FC12', vocab:'Inference', pronun:'/in-fur-uhns/', meaning:'การอนุมาน, สรุป', example:'Make an inference based on the given clues.' }
    ];
  } else if (mid === 3) {
    cards = [
      { id:'FC13', vocab:'Under the weather', pronun:'idiom', meaning:'ไม่สบาย, ป่วยเล็กน้อย', example:'I am feeling under the weather today.' },
      { id:'FC14', vocab:'Break the ice', pronun:'idiom', meaning:'เริ่มสนทนา, ละลายพฤติกรรม', example:'Tell a joke to break the ice.' },
      { id:'FC15', vocab:'Hit the nail on the head', pronun:'idiom', meaning:'พูดถูกจุด, ตรงประเด็น', example:'You hit the nail on the head with your analysis.' },
      { id:'FC16', vocab:'Once in a blue moon', pronun:'idiom', meaning:'นานๆ ครั้ง', example:'We go to that restaurant once in a blue moon.' },
      { id:'FC17', vocab:'Piece of cake', pronun:'idiom', meaning:'ง่ายมาก', example:'The test was a piece of cake!' },
      { id:'FC18', vocab:'Call it a day', pronun:'idiom', meaning:'เลิกทำงาน, พอแค่นี้', example:'Let us call it a day and go home.' }
    ];
  } else if (mid === 4) {
    cards = [
      { id:'FC19', vocab:'Subject-Verb Agreement', pronun:'grammar rule', meaning:'ประธาน-กริยาต้องสอดคล้อง', example:'She plays (NOT play) tennis every day.' },
      { id:'FC20', vocab:'Gerund', pronun:'/jer-uhnd/', meaning:'V-ing ที่ทำหน้าที่เป็นคำนาม', example:'Swimming is good exercise.' },
      { id:'FC21', vocab:'Infinitive', pronun:'/in-fin-i-tiv/', meaning:'to + V1', example:'I want to learn English.' },
      { id:'FC22', vocab:'Relative Clause', pronun:'grammar rule', meaning:'อนุประโยคขยายนาม (who/which/that)', example:'The man who called you is my uncle.' },
      { id:'FC23', vocab:'Participle', pronun:'/paar-tuh-si-pl/', meaning:'V-ing/V3 ทำหน้าที่เป็น adj.', example:'The broken window needs to be fixed.' },
      { id:'FC24', vocab:'Preposition', pronun:'/prep-uh-zish-uhn/', meaning:'คำบุพบท (in, on, at, by)', example:'She arrived at the station on time.' }
    ];
  } else if (mid === 5) {
    cards = [
      { id:'PFC1', vocab:'Under the weather', pronun:'/uhn-der thuh weth-er/', meaning:'รู้สึกไม่ค่อยสบาย ป่วย', example:"I won't go to school today, I'm feeling a bit under the weather." },
      { id:'PFC2', vocab:'Consider', pronun:'/kuhn-sid-er/', meaning:'พิจารณา คิดทบทวน', example:"I am considering moving abroad next year." },
      { id:'PFC3', vocab:'Shrinkflation', pronun:'/shringk-fley-shuhn/', meaning:'การลดปริมาณสินค้าแต่ขายราคาเดิม', example:"Many companies use shrinkflation to hide price increases." },
      { id:'PFC4', vocab:'Manage to', pronun:'/man-ij too/', meaning:'จัดการทำสำเร็จ (แม้ยากลำบาก)', example:"They managed to reach the finish line despite the heat." },
      { id:'PFC5', vocab:'Look forward to', pronun:'/look fawr-werd too/', meaning:'ตั้งตารอคอย (+ V.ing/Noun)', example:"I am looking forward to seeing you at the party." }
    ];
  } else if (mid === 6) {
    cards = [
      { id:'D1', vocab:'as if', pronun:'/az if/', meaning:'ราวกับว่า', example:'He acts as if he knows everything.' },
      { id:'D2', vocab:'now that', pronun:'/nou th a t/', meaning:'ด้วยเหตุที่', example:'Now that you are here, we can start.' },
      { id:'D3', vocab:'as well as', pronun:'/az wel az/', meaning:'คือและ', example:'She speaks French as well as English.' },
      { id:'D4', vocab:'besides', pronun:'/bi-sahydz/', meaning:'นอกจากนี้', example:'Besides milk, we need some bread.' },
      { id:'D5', vocab:'as soon as', pronun:'/az soon az/', meaning:'ทันทีที่', example:'Call me as soon as you arrive.' },
      { id:'D6', vocab:'in order to', pronun:'/in awr-der too/', meaning:'เพื่อที่จะ', example:'I study hard in order to pass the exam.' },
      { id:'D7', vocab:'in spite of', pronun:'/in spahyt uhv/', meaning:'ทั้งๆที่', example:'We went out in spite of the rain.' },
      { id:'D8', vocab:'while', pronun:'/hwahyl/', meaning:'ขณะที่', example:'I read a book while waiting.' },
      { id:'D9', vocab:'because / since / as', pronun:'-', meaning:'เพราะว่า', example:'We stayed home because it rained.' },
      { id:'D10', vocab:'after / before', pronun:'-', meaning:'หลังจาก / ก่อนหน้า', example:'Wash your hands before eating.' },
      { id:'D11', vocab:'if / in case', pronun:'-', meaning:'ถ้า / เผื่อว่า', example:'Take an umbrella in case it rains.' },
      { id:'D12', vocab:'whether', pronun:'/hweth-er/', meaning:'หรือไม่', example:'I do not know whether he will come.' },
      { id:'D13', vocab:'unless', pronun:'/uhn-les/', meaning:'ถ้าไม่เช่นนั้น', example:'You will fail unless you study.' },
      { id:'D14', vocab:'provided', pronun:'/pruh-vahy-did/', meaning:'โดยมีเงื่อนไข', example:'You can go provided you finish homework.' },
      { id:'D15', vocab:'so / thus / hence / therefore', pronun:'-', meaning:'ดังนั้น', example:'He was sick, therefore he stayed home.' },
      { id:'D16', vocab:'How do you feel? / How do you like?', pronun:'-', meaning:'คุณคิดว่ายังไง', example:'How do you feel about the new policy?' },
      { id:'D17', vocab:'What happened? / What is wrong?', pronun:'-', meaning:'เกิดอะไรขึ้น', example:'What happened to your car?' },
      { id:'D18', vocab:'assist', pronun:'/uh-sist/', meaning:'ช่วยเหลือ', example:'I can assist you with this project.' },
      { id:'D19', vocab:'consist of', pronun:'/kuhn-sist uhv/', meaning:'ประกอบด้วย', example:'The team consists of five members.' },
      { id:'D20', vocab:'insist / persist', pronun:'/in-sist/', meaning:'ยืนกราน', example:'He insisted on paying for dinner.' },
      { id:'D21', vocab:'resist', pronun:'/ri-zist/', meaning:'ต่อต้าน', example:'I cannot resist eating chocolate.' },
      { id:'D22', vocab:'exist', pronun:'/ig-zist/', meaning:'ยังมีชีวิต คงอยู่', example:'Do aliens exist?' },
      { id:'D23', vocab:'outbreak / spread', pronun:'-', meaning:'เริ่มแพร่กระจาย', example:'There was an outbreak of flu.' },
      { id:'D24', vocab:'epidemic', pronun:'/ep-i-dem-ik/', meaning:'การระบาด (ระดับหนึ่ง)', example:'The flu epidemic spread quickly.' },
      { id:'D25', vocab:'plague', pronun:'/pleyg/', meaning:'โรคระบาดรุนแรง', example:'The bubonic plague killed millions.' },
      { id:'D26', vocab:'pandemic', pronun:'/pan-dem-ik/', meaning:'ระบาดขยายทั่วโลก', example:'COVID-19 is a global pandemic.' },
      { id:'D27', vocab:'transparent', pronun:'/trans-pair-uhnt/', meaning:'โปร่งใส', example:'The glass is transparent.' },
      { id:'D28', vocab:'transformer', pronun:'/trans-fawr-mer/', meaning:'หม้อแปลง', example:'The transformer broke during the storm.' },
      { id:'D29', vocab:'transmit', pronun:'/trans-mit/', meaning:'ถ่ายทอด ส่งผ่าน', example:'Mosquitoes transmit malaria.' },
      { id:'D30', vocab:'transact', pronun:'/tran-sakt/', meaning:'ดำเนินการทางธุรกิจ', example:'We transact business online.' },
      { id:'D31', vocab:'transfer', pronun:'/trans-fur/', meaning:'โอนย้าย', example:'I will transfer the money tomorrow.' },
      { id:'D32', vocab:'translator', pronun:'/trans-ley-ter/', meaning:'นักแปล', example:'She works as a translator.' },
      { id:'D33', vocab:'transit', pronun:'/tran-sit/', meaning:'เดินทางผ่าน', example:'The goods are in transit.' },
      { id:'D34', vocab:'transmigrate', pronun:'/trans-mahy-greyt/', meaning:'ย้ายถิ่นฐาน', example:'Birds transmigrate in winter.' },
      { id:'D35', vocab:'progress', pronun:'/prog-res/', meaning:'ก้าวหน้า', example:'We are making good progress.' },
      { id:'D36', vocab:'produce', pronun:'/pruh-doos/', meaning:'สร้าง, ผลิต', example:'This factory produces cars.' },
      { id:'D37', vocab:'proceed', pronun:'/pruh-seed/', meaning:'ดำเนินต่อไป', example:'Please proceed with your presentation.' },
      { id:'D38', vocab:'proclaim', pronun:'/proh-kleym/', meaning:'ประกาศชัด', example:'The king proclaimed a holiday.' },
      { id:'D39', vocab:'promise', pronun:'/prom-is/', meaning:'สัญญา', example:'I promise to help you.' },
      { id:'D40', vocab:'prohibit', pronun:'/proh-hib-it/', meaning:'ห้าม, ยับยั้ง', example:'Smoking is prohibited here.' },
      { id:'D41', vocab:'prosperous', pronun:'/pros-per-uhs/', meaning:'เจริญ มั่งคั่ง', example:'They live in a prosperous country.' },
      { id:'D42', vocab:'professional', pronun:'/pruh-fesh-uh-nl/', meaning:'ชำนาญ, ถนัด, มืออาชีพ', example:'He is a professional photographer.' },
      { id:'D43', vocab:'devote', pronun:'/dih-voht/', meaning:'อุทิศ', example:'She devotes her time to charity.' },
      { id:'D44', vocab:'delete', pronun:'/dih-leet/', meaning:'ลบทิ้ง', example:'Please delete this file.' },
      { id:'D45', vocab:'decompose', pronun:'/dee-kuhm-pohz/', meaning:'เสื่อมสลาย เน่าเปื่อย', example:'Leaves decompose in the soil.' },
      { id:'D46', vocab:'declare', pronun:'/dih-klair/', meaning:'ประกาศ', example:'He declared his love for her.' },
      { id:'D47', vocab:'defeat', pronun:'/dih-feet/', meaning:'พิชิต เอาชนะ', example:'Our team defeated the champions.' },
      { id:'D48', vocab:'decease', pronun:'/dih-sees/', meaning:'ล้มตาย', example:'Upon his decease, his son took over.' },
      { id:'D49', vocab:'denote', pronun:'/dih-noht/', meaning:'ชี้ให้เห็น', example:'A red sky denotes good weather tomorrow.' },
      { id:'D50', vocab:'detain', pronun:'/dih-teyn/', meaning:'กักตัว', example:'The police detained the suspect.' },
      { id:'D51', vocab:'depress', pronun:'/dih-pres/', meaning:'มีความทุกข์ ทำให้หดหู่', example:'The sad news depressed me.' },
      { id:'D52', vocab:'dehydrate', pronun:'/dee-hahy-dreyt/', meaning:'ขจัดน้ำออกไป ทำให้แห้ง', example:'Runners can dehydrate quickly.' },
      { id:'D53', vocab:'deregulate', pronun:'-', meaning:'ยกเลิกกฎควบคุม', example:'The government deregulated the airline industry.' },
      { id:'D54', vocab:'deject', pronun:'/dih-jekt/', meaning:'ทำให้ผิดหวัง สลดใจ', example:'Failure dejected him.' },
      { id:'D55', vocab:'decay', pronun:'/dih-key/', meaning:'ผุพัง เน่าเปื่อย', example:'Sugar causes tooth decay.' },
      { id:'D56', vocab:'derange', pronun:'/dih-reynj/', meaning:'ก่อกวน วุ่นวาย', example:'The shocking news deranged him.' },
      { id:'D57', vocab:'decline', pronun:'/dih-klahyn/', meaning:'ลดลง ปฏิเสธ', example:'Sales declined this year.' },
      { id:'D58', vocab:'return', pronun:'/ri-turn/', meaning:'คืนกลับมา', example:'Please return the book.' },
      { id:'D59', vocab:'restart', pronun:'/ree-stahrt/', meaning:'เริ่มใหม่อีกครั้ง', example:'I need to restart my computer.' },
      { id:'D60', vocab:'repair', pronun:'/ri-pair/', meaning:'ซ่อมแซม', example:'Can you repair my car?' },
      { id:'D61', vocab:'replace', pronun:'/ri-pleys/', meaning:'เอามาแทนที่', example:'We will replace the broken window.' },
      { id:'D62', vocab:'rearrange', pronun:'/ree-uh-reynj/', meaning:'จัดใหม่อีกที', example:'Let us rearrange the furniture.' },
      { id:'D63', vocab:'repaint', pronun:'/ree-peynt/', meaning:'ทาสีใหม่', example:'I want to repaint my room.' },
      { id:'D64', vocab:'recreate', pronun:'/ree-kree-eyt/', meaning:'สร้างใหม่', example:'We tried to recreate the recipe.' },
      { id:'D65', vocab:'rebuild', pronun:'/ree-bild/', meaning:'สร้างใหม่ ซ่อมแซม', example:'They rebuilt the house after the fire.' }
    ];
  }

  return { success: true, data: cards };
}

/**
 * Upload Profile Image
 */
function uploadProfileImage(userId, base64Data, filename) {
  try {
    const folder = DriveApp.getRootFolder();
    const folders = folder.getFoldersByName('ProfileImages');
    let imgFolder;
    if (folders.hasNext()) {
      imgFolder = folders.next();
    } else {
      imgFolder = folder.createFolder('ProfileImages');
    }
    
    const parts = base64Data.split(',');
    const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), parts[0].match(/:(.*?);/)[1], userId + '_' + filename);
    const file = imgFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Use direct image URL format (not the Drive view URL)
    const fileId = file.getId();
    const directUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
    
    DB.updateData('Students', 'UserID', userId, { ProfileImage: directUrl });
    
    return { success: true, url: directUrl };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function getModules() {
  try {
    const modules = DB.getDataAsObjects('Modules');
    if (modules && modules.length > 0) {
      modules.sort((a, b) => (a.Order || 0) - (b.Order || 0));
      return modules.map(m => ({
        id: m.ModuleID,
        title: m.Title,
        desc: m.Description
      }));
    }
  } catch(e) {}
  
  // Fallback default modules
  return [
    { id: 1, title: "Vocab 1-5", desc: "คำศัพท์ที่ออกสอบบ่อยชุดที่ 1-5" },
    { id: 2, title: "Mid 1.69", desc: "แนวข้อสอบกลางภาค 1/69" },
    { id: 3, title: "Functional English", desc: "บทสนทนาและสำนวนในชีวิตจริง" },
    { id: 4, title: "Grammar Master", desc: "ตะลุยโจทย์ไวยากรณ์" },
    { id: 5, title: "Parallel Midterm", desc: "แนวข้อสอบเสมือนจริง" },
    { id: 6, title: "คลังคำศัพท์ประจำวัน", desc: "รวมศัพท์จำเป็นท่องจำง่าย" }
  ];
}

