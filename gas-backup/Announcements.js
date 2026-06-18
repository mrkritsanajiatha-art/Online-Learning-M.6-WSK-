/**
 * Announcement System
 */

function getAnnouncements() {
  try {
    const announcements = DB.getDataAsObjects('Announcements');
    // Sort by Date descending
    announcements.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    return { success: true, data: announcements };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function createAnnouncement(title, content, author, priority) {
  try {
    DB.insertData('Announcements', {
      AnnounceID: 'ANN-' + Utilities.getUuid(),
      Title: title,
      Content: content,
      Date: new Date().toISOString(),
      Author: author,
      Priority: priority || 'Normal'
    });
    return { success: true, message: "Announcement created successfully." };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
