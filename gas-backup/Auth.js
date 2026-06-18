/**
 * Authentication and User Management
 */

function generateId() {
  return 'USR-' + Utilities.getUuid();
}

/**
 * Handle student registration
 * Called from frontend via google.script.run
 */
function registerStudent(formData) {
  try {
    // 1. Validation
    if (!formData.username || !formData.password || !formData.studentId) {
      return { success: false, message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" };
    }
    
    // 2. Check duplicate username or student ID
    const existingUser = DB.findOne('Students', 'Username', formData.username);
    if (existingUser) {
      return { success: false, message: "Username นี้ถูกใช้งานแล้ว" };
    }
    
    const existingStudentId = DB.findOne('Students', 'StudentID', formData.studentId);
    if (existingStudentId) {
      return { success: false, message: "รหัสนักเรียนนี้ถูกลงทะเบียนแล้ว" };
    }
    
    // 3. Hash password (simple base64 for demonstration in GAS, ideally use SHA)
    const passwordHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, formData.password));
    
    // 4. Prepare data
    const newUser = {
      UserID: generateId(),
      Prefix: formData.prefix,
      FirstName: formData.firstname,
      LastName: formData.lastname,
      Class: formData.className,
      Number: formData.number,
      StudentID: formData.studentId,
      Username: formData.username,
      PasswordHash: passwordHash,
      Role: 'Student',
      CreatedAt: new Date().toISOString(),
      LastLogin: ''
    };
    
    // 5. Insert to DB
    DB.insertData('Students', newUser);
    
    // Initialize student progress/XP here if needed
    
    return { success: true, message: "สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ", user: newUser.UserID };
  } catch (error) {
    Logger.log("Register Error: " + error.toString());
    return { success: false, message: "เกิดข้อผิดพลาด: " + error.toString() };
  }
}

/**
 * Handle user login
 */
function loginUser(username, password) {
  try {
    // Hardcoded Admin Intercept
    if (username === 'admin123456' && password === 'admin123456') {
      return { 
        success: true, 
        message: "เข้าสู่ระบบแอดมินสำเร็จ", 
        user: { 
          UserID: 'ADMIN-001', 
          Username: 'admin123456', 
          Role: 'Admin', 
          FirstName: 'Super', 
          LastName: 'Admin',
          Class: 'Staff',
          Number: '0'
        } 
      };
    }
    
    const user = DB.findOne('Students', 'Username', username);
    if (!user) {
      return { success: false, message: "ไม่พบ Username นี้" };
    }
    
    const passwordHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password));
    if (user.PasswordHash !== passwordHash) {
      return { success: false, message: "รหัสผ่านไม่ถูกต้อง" };
    }
    
    // Update last login (in a real app, you'd find the row and update it)
    // For now, we return success and user data
    
    // Remove password hash from response
    delete user.PasswordHash;
    
    return { success: true, message: "เข้าสู่ระบบสำเร็จ", user: user };
  } catch (error) {
    Logger.log("Login Error: " + error.toString());
    return { success: false, message: "เกิดข้อผิดพลาด: " + error.toString() };
  }
}
