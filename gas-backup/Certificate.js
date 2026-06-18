/**
 * Certificate Generation System
 */

function generateCertificate(userId, moduleName) {
  try {
    const user = DB.findOne('Students', 'UserID', userId);
    if (!user) throw new Error("User not found");

    const dateStr = new Date().toLocaleDateString('th-TH', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // Create HTML template for Certificate
    const htmlContent = `
      <div style="width: 800px; height: 600px; padding: 40px; text-align: center; border: 10px solid #78B3CE; box-sizing: border-box; font-family: sans-serif;">
        <h1 style="color: #78B3CE; font-size: 48px; margin-bottom: 10px;">Certificate of Completion</h1>
        <h2 style="color: #555; margin-bottom: 40px;">โรงเรียนกระทุ่มแบน "วิเศษสมุทคุณ"</h2>
        
        <p style="font-size: 24px;">This is to certify that</p>
        <h2 style="font-size: 36px; color: #333; border-bottom: 2px solid #ccc; display: inline-block; padding-bottom: 10px; margin-bottom: 30px;">
          ${user.Prefix} ${user.FirstName} ${user.LastName}
        </h2>
        
        <p style="font-size: 20px;">has successfully completed the module</p>
        <h3 style="font-size: 28px; color: #C3B1E1; margin-bottom: 40px;">${moduleName}</h3>
        
        <p style="font-size: 18px;">Awarded on ${dateStr}</p>
        
        <div style="margin-top: 50px; display: flex; justify-content: space-between; padding: 0 50px;">
          <div style="text-align: center;">
            <div style="width: 100px; height: 100px; border: 2px dashed #ccc; margin: 0 auto; line-height: 100px; font-size: 12px; color: #aaa;">[ QR CODE ]</div>
          </div>
          <div style="text-align: center; margin-top: 40px;">
            <p style="border-top: 1px solid #333; padding-top: 10px; font-weight: bold;">Teacher Signature</p>
          </div>
        </div>
      </div>
    `;

    // Convert to PDF
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML).getAs(MimeType.PDF).setName(`Certificate_${user.StudentID}_${moduleName}.pdf`);
    
    // Save to Google Drive
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    const fileUrl = file.getUrl();

    // Log to DB
    DB.insertData('Certificates', {
      CertID: 'CERT-' + Utilities.getUuid(),
      UserID: userId,
      ModuleID: moduleName, // using name for simplicity
      PDFLink: fileUrl,
      GeneratedAt: new Date().toISOString()
    });

    return { success: true, url: fileUrl };
  } catch(e) {
    Logger.log("Certificate Error: " + e.toString());
    return { success: false, message: e.toString() };
  }
}
