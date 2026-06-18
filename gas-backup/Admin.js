/**
 * Admin CMS Logic - Universal Database Editor API
 */

/**
 * Get all available table names
 */
function adminGetTables() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheets = ss.getSheets();
    let tables = [];
    for (let i = 0; i < sheets.length; i++) {
      tables.push(sheets[i].getName());
    }
    return { success: true, data: tables };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Get all data and headers for a specific table
 */
function adminGetTableData(tableName) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(tableName);
    if (!sheet) return { success: false, message: "Table not found" };
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow === 0 || lastCol === 0) {
       return { success: true, headers: [], data: [] };
    }
    
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    let data = [];
    
    if (lastRow > 1) {
       const rawData = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
       for (let i = 0; i < rawData.length; i++) {
         let rowObj = {};
         for (let j = 0; j < headers.length; j++) {
           rowObj[headers[j]] = rawData[i][j];
         }
         data.push(rowObj);
       }
    }
    
    return { success: true, headers: headers, data: data };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Update a specific row in a table
 */
function adminUpdateRow(tableName, idColumn, idValue, rowData) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(tableName);
    if (!sheet) return { success: false, message: "Table not found" };
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idIndex = headers.indexOf(idColumn);
    
    if (idIndex === -1) return { success: false, message: "ID column not found" };
    
    const dataRange = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), sheet.getLastColumn());
    const data = dataRange.getValues();
    
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][idIndex]) === String(idValue)) {
        // Update row
        for (let j = 0; j < headers.length; j++) {
          if (rowData[headers[j]] !== undefined) {
             sheet.getRange(i + 2, j + 1).setValue(rowData[headers[j]]);
          }
        }
        return { success: true, message: "Row updated successfully" };
      }
    }
    return { success: false, message: "Row not found" };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Insert a new row into a table
 */
function adminInsertRow(tableName, rowData) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(tableName);
    if (!sheet) return { success: false, message: "Table not found" };
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let newRow = [];
    
    for (let i = 0; i < headers.length; i++) {
      // Auto-generate ID if it's an ID column and empty
      let val = rowData[headers[i]] || '';
      if (val === '' && headers[i].indexOf('ID') !== -1 && i === 0) {
        val = tableName.substring(0, 3).toUpperCase() + '-' + Utilities.getUuid().substring(0, 8);
      }
      newRow.push(val);
    }
    
    sheet.appendRow(newRow);
    return { success: true, message: "Row inserted successfully" };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Delete a specific row
 */
function adminDeleteRow(tableName, idColumn, idValue) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(tableName);
    if (!sheet) return { success: false, message: "Table not found" };
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idIndex = headers.indexOf(idColumn);
    
    if (idIndex === -1) return { success: false, message: "ID column not found" };
    
    const data = sheet.getRange(2, idIndex + 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues();
    
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(idValue)) {
        sheet.deleteRow(i + 2);
        return { success: true, message: "Row deleted successfully" };
      }
    }
    return { success: false, message: "Row not found" };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Export scores by class to CSV format
 */
function adminExportScoresCSV(className) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    
    // Get Students
    const studentSheet = ss.getSheetByName('Students');
    if (!studentSheet) return { success: false, message: "Students table not found" };
    const studentsData = studentSheet.getDataRange().getValues();
    const sHeaders = studentsData[0];
    
    // Get Scores
    const scoreSheet = ss.getSheetByName('Scores');
    if (!scoreSheet) return { success: false, message: "Scores table not found" };
    const scoresData = scoreSheet.getDataRange().getValues();
    const scHeaders = scoresData[0];
    
    // Find column indexes
    const sIdIdx = sHeaders.indexOf('UserID');
    const sClassIdx = sHeaders.indexOf('Class');
    const sNumIdx = sHeaders.indexOf('Number');
    const sFNameIdx = sHeaders.indexOf('FirstName');
    const sLNameIdx = sHeaders.indexOf('LastName');
    
    const scUserIdIdx = scHeaders.indexOf('UserID');
    const scTypeIdx = scHeaders.indexOf('QuizType');
    const scRefIdx = scHeaders.indexOf('ReferenceID');
    const scScoreIdx = scHeaders.indexOf('Score');
    const scMaxIdx = scHeaders.indexOf('MaxScore');
    const scTimeIdx = scHeaders.indexOf('Timestamp');
    
    // Filter students by class
    let filteredStudents = [];
    for (let i = 1; i < studentsData.length; i++) {
      if (studentsData[i][sClassIdx] == className || className === 'ALL') {
        filteredStudents.push(studentsData[i]);
      }
    }
    
    if (filteredStudents.length === 0) {
       return { success: false, message: "No students found in class: " + className };
    }
    
    // Build CSV Content
    let csvContent = "Class,Number,First Name,Last Name,Quiz Type,Module ID,Score,Max Score,Timestamp\n";
    
    for (let i = 0; i < filteredStudents.length; i++) {
      let st = filteredStudents[i];
      let stId = st[sIdIdx];
      
      // Find all scores for this student
      let hasScores = false;
      for (let j = 1; j < scoresData.length; j++) {
        let sc = scoresData[j];
        if (sc[scUserIdIdx] === stId) {
          csvContent += `"${st[sClassIdx]}","${st[sNumIdx]}","${st[sFNameIdx]}","${st[sLNameIdx]}","${sc[scTypeIdx]}","${sc[scRefIdx]}","${sc[scScoreIdx]}","${sc[scMaxIdx]}","${sc[scTimeIdx]}"\n`;
          hasScores = true;
        }
      }
      
      if (!hasScores) {
        csvContent += `"${st[sClassIdx]}","${st[sNumIdx]}","${st[sFNameIdx]}","${st[sLNameIdx]}","No Data","","0","0",""\n`;
      }
    }
    
    return { success: true, csvData: csvContent, filename: "Scores_" + className + ".csv" };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
