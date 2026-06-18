/**
 * Database Wrapper for Google Sheets
 */

const DB = {
  getSpreadsheet() {
    return SpreadsheetApp.openById(CONFIG.SHEET_ID);
  },

  getSheet(sheetName) {
    return this.getSpreadsheet().getSheetByName(sheetName);
  },

  /**
   * Helper to convert sheet data to array of objects
   */
  getDataAsObjects(sheetName) {
    const sheet = this.getSheet(sheetName);
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // Only headers or empty

    const headers = data[0];
    const rows = data.slice(1);
    
    return rows.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
  },

  /**
   * Insert a new row into a sheet
   */
  insertData(sheetName, dataObj) {
    const sheet = this.getSheet(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowData = headers.map(header => dataObj[header] !== undefined ? dataObj[header] : "");
    
    sheet.appendRow(rowData);
    return true;
  },
  
  /**
   * Find a single record by field name
   */
  findOne(sheetName, fieldName, value) {
    const data = this.getDataAsObjects(sheetName);
    return data.find(item => item[fieldName] == value) || null;
  },

  findMany(sheetName, fieldName, value) {
    const data = this.getDataAsObjects(sheetName);
    return data.filter(item => item[fieldName] == value);
  },

  /**
   * Update fields in a single record
   */
  updateData(sheetName, searchField, searchValue, updates) {
    const sheet = this.getSheet(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return false;
    
    const headers = data[0];
    const searchIndex = headers.indexOf(searchField);
    if (searchIndex === -1) return false;
    
    // Find the row
    for (let i = 1; i < data.length; i++) {
      if (data[i][searchIndex] == searchValue) {
        // Update the row
        for (const key in updates) {
          const colIndex = headers.indexOf(key);
          if (colIndex !== -1) {
            sheet.getRange(i + 1, colIndex + 1).setValue(updates[key]);
          }
        }
        return true; // Updated
      }
    }
    return false; // Not found
  }
};
