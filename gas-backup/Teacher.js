/**
 * Teacher Dashboard Logic
 */

function getTeacherDashboardData(teacherId) {
  try {
    // 1. Get class analytics
    const students = DB.findMany('Students', 'Role', 'Student');
    const allScores = DB.getDataAsObjects('Scores');
    
    // Process top students
    let studentXpMap = {};
    students.forEach(s => studentXpMap[s.UserID] = { name: s.FirstName + ' ' + s.LastName, class: s.Class, xp: 0 });
    
    allScores.forEach(score => {
      if(studentXpMap[score.UserID]) {
        studentXpMap[score.UserID].xp += (score.Score * 10);
      }
    });

    let ranking = Object.values(studentXpMap).sort((a, b) => b.xp - a.xp);
    
    // Risk Students (XP < 500)
    let riskStudents = ranking.filter(s => s.xp < 500);
    
    return {
      success: true,
      data: {
        totalStudents: students.length,
        avgScore: "75%",
        topStudents: ranking.slice(0, 5),
        riskStudents: riskStudents.slice(0, 5)
      }
    };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
