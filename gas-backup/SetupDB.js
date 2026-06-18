/**
 * Configuration for Google Sheets Database
 */
const CONFIG = {
  SHEET_ID: '1tGmZqJIwVbY2nBxsTczxXJXy2KzIpui6lpmgTPC3BIo',
  DRIVE_FOLDER_ID: '13pyW21eOFlSQAO9lUbhT722oyWxeVfq8'
};

/**
 * Initialize Database structure
 * Run this function ONCE from the GAS editor to create all required sheets and headers
 */
function initializeDatabase() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  
  const tables = {
    'Students': ['UserID', 'Prefix', 'FirstName', 'LastName', 'Class', 'Number', 'StudentID', 'Username', 'PasswordHash', 'Role', 'CreatedAt', 'LastLogin', 'ProfileImage'],
    'Modules': ['ModuleID', 'Title', 'Description', 'Order'],
    'Chapters': ['ChapterID', 'ModuleID', 'Title', 'Order'],
    'Lessons': ['LessonID', 'ChapterID', 'Title', 'Content', 'VideoURL', 'Order'],
    'Flashcards': ['CardID', 'ModuleID', 'ChapterID', 'Vocabulary', 'Pronunciation', 'Meaning', 'Example', 'ThaiTranslation'],
    'QuizBank': ['QuestionID', 'ModuleID', 'ChapterID', 'Type', 'Pattern', 'Context', 'Question', 'ChoiceA', 'ChoiceB', 'ChoiceC', 'ChoiceD', 'CorrectAnswer', 'Explanation'],
    'Scores': ['ScoreID', 'UserID', 'QuizType', 'ReferenceID', 'Score', 'MaxScore', 'TimeSpent', 'Timestamp'],
    'Progress': ['ProgressID', 'UserID', 'ModuleID', 'ChapterID', 'LessonID', 'Status', 'Timestamp'],
    'Badges': ['BadgeID', 'UserID', 'BadgeName', 'EarnedAt'],
    'Certificates': ['CertID', 'UserID', 'ModuleID', 'PDFLink', 'GeneratedAt'],
    'Announcements': ['AnnounceID', 'Title', 'Content', 'Date', 'Author', 'Priority'],
    'Logs': ['LogID', 'UserID', 'Action', 'Details', 'Timestamp'],
    'Settings': ['Key', 'Value']
  };

  for (const sheetName in tables) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // Set headers if the sheet is empty or headers are missing
    const headers = tables[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9ead3");
    
    // Freeze top row
    sheet.setFrozenRows(1);
  }
  
  Logger.log("Database initialized successfully!");
}

/**
 * Seed Database with default Modules
 * Run this function ONCE to populate the Modules table if it's empty
 */
function seedDatabase() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName('Modules');
  
  if (sheet && sheet.getLastRow() <= 1) {
    const modules = [
      [1, 'Vocab 1-5', 'คำศัพท์ที่ออกสอบบ่อยชุดที่ 1-5', 1],
      [2, 'Mid 1.69', 'แนวข้อสอบกลางภาค 1/69', 2],
      [3, 'Functional English', 'ทบทวนโครงสร้างประโยค', 3],
      [4, 'Grammar Master', 'ตะลุยโจทย์ไวยากรณ์', 4]
    ];
    
    sheet.getRange(2, 1, modules.length, 4).setValues(modules);
    Logger.log("Seeded default modules!");
    Logger.log("Modules already exist or sheet not found.");
  }
}

/**
 * Fix Old Profile Image URLs from /view to /d/ID
 * Run this ONCE to fix old images that are not loading.
 */
function fixProfileImages() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName('Students');
  if (!sheet) return;
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const profileColIdx = headers.indexOf('ProfileImage') + 1;
  if (profileColIdx === 0) return;
  
  const profiles = sheet.getRange(2, profileColIdx, lastRow - 1, 1).getValues();
  let updated = 0;
  
  for (let i = 0; i < profiles.length; i++) {
    const url = profiles[i][0];
    if (url && url.indexOf('/view') !== -1) {
      // Extract ID from https://drive.google.com/file/d/ID/view...
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)\//);
      if (match && match[1]) {
        const newUrl = 'https://lh3.googleusercontent.com/d/' + match[1];
        sheet.getRange(i + 2, profileColIdx).setValue(newUrl);
        updated++;
      }
    }
  }
  
  Logger.log("Fixed " + updated + " profile images.");
}
