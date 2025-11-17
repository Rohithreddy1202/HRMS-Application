let currentUser = null;
let loginUserType = 'employee'; // Default to employee
let currentLeaveRequest = null; // Store the current request for the comment popup

// Base URL for your Python Flask backend
const API_BASE_URL = 'http://127.0.0.1:5000'; // Make sure this matches your Flask server's address
const HOLIDAYS = [
  '2025-01-26', '2025-03-14', '2025-03-31', '2025-04-18', '2025-08-15',
  '2025-10-02', '2025-10-20', '2025-12-25'
];

// --- Helper function for making API requests with exponential backoff ---
async function makeApiRequest(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status !== 401) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error);
      if (i < retries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
}

// --- Initialize ---
function initializeApplication() {
    console.log("HRMS Application Loaded - Backend Mode");
    document.getElementById("appContainer").style.display = "none";
    document.querySelector(".main").style.display = "flex";
    document.getElementById('bellIcon')?.addEventListener('click', toggleNotifications);
    document.getElementById('submitCommentBtn')?.addEventListener('click', submitCommentAction);
}

// --- Function to show Admin Login Form ---
function showAdminForm() {
  loginUserType = 'admin';
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("employeeForm").style.display = "flex";
  const loginBox = document.querySelector('#employeeForm .login-box');
  if (loginBox) loginBox.style.display = 'block';
  document.querySelector("#employeeForm .login-header").textContent = "ADMIN LOGIN";
  const registerLinkPara = document.querySelector("#employeeForm .login-box form p");
  if (registerLinkPara) registerLinkPara.style.display = "none";
  document.getElementById("loginDropdown").classList.remove("show");
}

// --- Function to show Employee Login Form ---
function showEmployeeForm() {
  loginUserType = 'employee';
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("employeeForm").style.display = "flex";
  const loginBox = document.querySelector('#employeeForm .login-box');
  if (loginBox) loginBox.style.display = 'block';
  document.querySelector("#employeeForm .login-header").textContent = "EMPLOYEE LOGIN";
  const registerLinkPara = document.querySelector("#employeeForm .login-box form p");
  if (registerLinkPara) registerLinkPara.style.display = "none";
  document.getElementById("loginDropdown").classList.remove("show");
}

function toggleSectionEditMode(sectionId, isEditing) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const inputs = section.querySelectorAll('input, select, textarea');
    const editBtn = section.querySelector('.accordion-header .toggle-btn:first-of-type');
    const saveBtn = section.querySelector('.accordion-header .toggle-btn:last-of-type');
    inputs.forEach(input => {
        const isFixedField = ['edit-email', 'edit-joindate'].includes(input.id);
        if (!isFixedField) input.disabled = !isEditing;
    });
    if (isEditing) {
        editBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
    } else {
        editBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
    }
}

// --- LOGIN (Backend Integration) - MODIFIED ---
document.getElementById("loginForm")?.addEventListener("submit", async function (event) {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const response = await makeApiRequest(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, user_type: loginUserType })
    });

    // NEW: Check for forced password change
    if (response.force_change === true) {
      document.getElementById('force-change-user-id').value = response.user_id;
      document.getElementById('forceChangePasswordPopup').style.display = 'flex';
    } 
    // EXISTING: Handle normal login
    else if (response.user) {
      currentUser = response.user;
      document.querySelector(".sidebar").style.display = "none";
      document.querySelector(".main").style.display = "none";
      document.getElementById("appContainer").style.display = "flex";

      if (currentUser.user_type === 'admin') {
        document.querySelector(".app-sidebar").classList.add("hidden");
        document.querySelector(".admin-sidebar").classList.remove("hidden");
        document.getElementById("signOutTrigger").textContent = `Admin: ${currentUser.first_name}`;
        showSection('admin-dashboard-section');
      } else {
        document.querySelector(".app-sidebar").classList.remove("hidden");
        document.querySelector(".admin-sidebar").classList.add("hidden");
        fillUserEverywhere(currentUser);
        fetchAndRenderNotifications(currentUser.id);
        showSection('dashboard1');
      }
    } else {
      showCustomAlert(`❌ ${response.message || "Invalid email or password!"}`);
    }
  } catch (error) {
    showCustomAlert(`❌ Login failed: ${error.message}`);
  }
});

// --- NEW: Handle Force Password Change Form ---
document.getElementById('forceChangePasswordForm')?.addEventListener('submit', async function(event) {
    event.preventDefault();
    const userId = document.getElementById('force-change-user-id').value;
    const newPassword = document.getElementById('force-new-password').value;
    const confirmPassword = document.getElementById('force-confirm-password').value;

    if (newPassword.length < 8) {
        showCustomAlert('❌ New password must be at least 8 characters long.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showCustomAlert('❌ New passwords do not match.');
        return;
    }

    try {
        const response = await makeApiRequest(`${API_BASE_URL}/force-change-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, new_password: newPassword })
        });

        if (response.user) {
            showCustomAlert('✅ Password set successfully! Logging you in...');
            document.getElementById('forceChangePasswordPopup').style.display = 'none';
            this.reset();
            
            // Re-use the successful login logic
            currentUser = response.user;
            document.querySelector(".sidebar").style.display = "none";
            document.querySelector(".main").style.display = "none";
            document.getElementById("appContainer").style.display = "flex";
            document.querySelector(".app-sidebar").classList.remove("hidden");
            document.querySelector(".admin-sidebar").classList.add("hidden");
            fillUserEverywhere(currentUser);
            fetchAndRenderNotifications(currentUser.id);
            showSection('dashboard1');
        } else {
            showCustomAlert(`❌ Password change failed: ${response.message || 'An unknown error occurred.'}`);
        }
    } catch (error) {
        showCustomAlert(`❌ An error occurred: ${error.message}`);
    }
});

// --- Fill Profile, Leave, etc. ---
function fillUserEverywhere(user) {
    const setInputValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA' ? element.value = value || "" : element.textContent = value || "N/A";
    };
    setInputValue("ProfileName", `${user.first_name} ${user.last_name}`);
    setInputValue("welcomeName", user.first_name);
    setInputValue("welcomeName1", `${user.first_name}  ${user.last_name}`);
    setInputValue("edit-firstName", user.first_name);
    setInputValue("edit-lastName", user.last_name);
    setInputValue("edit-gender", user.gender);
    setInputValue("edit-dob", user.dob);
    setInputValue("edit-permanentaddress", user.permanent_address);
    setInputValue("edit-currentaddress", user.current_address);
    setInputValue("edit-pannumber", user.pan_number);
    setInputValue("edit-aadharnumber", user.aadhar_number);
    setInputValue("edit-email", user.email);
    setInputValue("edit-contactnumber", user.contactnumber);
    setInputValue("edit-alternatecontactnumber", user.alternate_contact_number);
    setInputValue("edit-alternatecontactperson", user.alternate_contact_person);
    setInputValue("edit-alternatecontactrelation", user.alternate_contact_relation);
    setInputValue("edit-emergencynumber", user.emergency_number);
    setInputValue("edit-accountnumber", user.account_number);
    setInputValue("edit-ifscCode", user.ifsc_code);
    setInputValue("edit-accountholdername", user.account_holder_name);
    setInputValue("edit-branch", user.branch);
    setInputValue("edit-department", user.department);
    setInputValue("edit-reportingmanager1", user.reporting_manager1);
    setInputValue("edit-reportingmanager1mail", user.reporting_manager1_mail);
    setInputValue("edit-reportingmanager2", user.reporting_manager2);
    setInputValue("edit-reportingmanager2mail", user.reporting_manager2_mail);
    setInputValue("edit-employeerole", user.employee_role);
    setInputValue("edit-employment_status", user.employment_status);
    setInputValue("edit-joindate", user.join_date);

    document.querySelectorAll(".username").forEach(el => el.textContent = `${user.first_name} ${user.last_name}`);
    const attendanceNameInput = document.getElementById("attendanceEmployeeName");
    if (attendanceNameInput) attendanceNameInput.value = `${user.first_name} ${user.last_name}`;
    const attendanceDateInput = document.getElementById("attendanceDate");
    if (attendanceDateInput) {
        const today = new Date(), yyyy = today.getFullYear(), mm = String(today.getMonth() + 1).padStart(2, '0'), dd = String(today.getDate()).padStart(2, '0');
        attendanceDateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    ['leave', 'wfh', 'compoff-earn'].forEach(prefix => {
        setInputValue(`${prefix}-officialmail`, user.email);
        setInputValue(`${prefix}-empcode`, user.id);
        setInputValue(`${prefix}-fullname`, `${user.first_name} ${user.last_name}`);
        setInputValue(`${prefix}-reportingmanager1`, user.reporting_manager1);
        setInputValue(`${prefix}-reportingmanager1mail`, user.reporting_manager1_mail);
        setInputValue(`${prefix}-reportingmanager2`, user.reporting_manager2);
        setInputValue(`${prefix}-reportingmanager2mail`, user.reporting_manager2_mail);
    });
}

// --- Save Profile Changes ---
async function saveProfileChanges(sectionId) {
    if (!currentUser || !currentUser.id) {
        showCustomAlert("No user is logged in.");
        return;
    }
    let updatedFields = {};
    switch (sectionId) {
        case 'personal-details': updatedFields = { first_name: document.getElementById("edit-firstName").value, last_name: document.getElementById("edit-lastName").value, gender: document.getElementById("edit-gender").value, dob: document.getElementById("edit-dob").value, permanent_address: document.getElementById("edit-permanentaddress").value, current_address: document.getElementById("edit-currentaddress").value, pan_number: document.getElementById("edit-pannumber").value, aadhar_number: document.getElementById("edit-aadharnumber").value }; break;
        case 'contact-details': updatedFields = { contactnumber: document.getElementById("edit-contactnumber").value, alternate_contact_number: document.getElementById("edit-alternatecontactnumber").value, alternate_contact_person: document.getElementById("edit-alternatecontactperson").value, alternate_contact_relation: document.getElementById("edit-alternatecontactrelation").value, emergency_number: document.getElementById("edit-emergencynumber").value }; break;
        case 'bank-details': updatedFields = { account_number: document.getElementById("edit-accountnumber").value, ifsc_code: document.getElementById("edit-ifsccode").value, account_holder_name: document.getElementById("edit-accountholdername").value, branch: document.getElementById("edit-branch").value }; break;
        case 'work-details': updatedFields = { department: document.getElementById("edit-department").value, reporting_manager1: document.getElementById("edit-reportingmanager1").value, reporting_manager2: document.getElementById("edit-reportingmanager2").value, employee_role: document.getElementById("edit-employeerole").value, employment_status: document.getElementById("edit-employment_status").value, join_date: document.getElementById("edit-joindate").value }; break;
        default: return;
    }
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/profile/${currentUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedFields) });
        currentUser = response.user;
        toggleSectionEditMode(sectionId, false);
        fillUserEverywhere(currentUser);
        showCustomAlert(`✅ ${sectionId.replace('-', ' ')} updated successfully!`);
        fetchAndRenderNotifications(currentUser.id);
    } catch (error) {
        showCustomAlert(`❌ Failed to update ${sectionId.replace('-', ' ')}: ${error.message}`);
    }
}

// --- Dropdown + Show Login Panel ---
document.querySelector(".dropbtn")?.addEventListener("click", () => document.getElementById("loginDropdown").classList.toggle("show"));

window.addEventListener("click", (e) => {
  if (!e.target.matches(".dropbtn")) {
    const dd = document.getElementById("loginDropdown");
    if (dd && dd.classList.contains("show")) dd.classList.remove("show");
  }
  const notificationDropdown = document.getElementById('notificationDropdown'), bellIcon = document.getElementById('bellIcon');
  if (notificationDropdown && !notificationDropdown.classList.contains('hidden') && !bellIcon.contains(e.target) && !notificationDropdown.contains(e.target)) {
      notificationDropdown.classList.add('hidden');
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initializeApplication();
  document.querySelectorAll(".admin-sidebar ul li").forEach(link => {
      link.addEventListener("click", () => showSection(link.getAttribute("data-section")));
  });
});

function getWorkingDays(startDateStr, endDateStr) {
    let count = 0;
    const currentDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        const dateString = currentDate.toISOString().split('T')[0];
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !HOLIDAYS.includes(dateString)) count++;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return count;
}

async function submitLeave() {
    const leaveType = document.getElementById('leave-type-select').value, fromDate = document.getElementById('leave-from-date').value, toDate = document.getElementById('leave-to-date').value, description = document.getElementById('leave-description').value.trim();
    if (!leaveType || !fromDate || !toDate) {
        showCustomAlert("Please select a leave type and both dates.");
        return;
    }
    const leaveDays = getWorkingDays(fromDate, toDate);
    const payload = { employee_id: currentUser.id, leave_type: leaveType, from_date: fromDate, to_date: toDate, description: description, leave_days: leaveDays };
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/leave-application`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        showCustomAlert(`✅ ${response.message}`);
        closePopup();
        loadLeaveHistory(currentUser.id);
        loadLeaveBalance(currentUser.id);
    } catch (error) {
        showCustomAlert(`❌ Submission failed: ${error.message}`);
    }
}

async function submitWFH() {
    const fromDate = document.getElementById('wfh-from-date').value, toDate = document.getElementById('wfh-to-date').value, description = document.getElementById('wfh-description').value.trim();
    if (!fromDate || !toDate) {
        showCustomAlert("Please select both dates.");
        return;
    }
    const leaveDays = getWorkingDays(fromDate, toDate);
    const payload = { employee_id: currentUser.id, leave_type: 'WFH', from_date: fromDate, to_date: toDate, description: description, leave_days: leaveDays };
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/leave-application`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        showCustomAlert(`✅ ${response.message}`);
        closePopup1();
        loadLeaveHistory(currentUser.id);
        loadLeaveBalance(currentUser.id);
    } catch (error) {
        showCustomAlert(`❌ Submission failed: ${error.message}`);
    }
}

async function submitCompoffEarnRequest() {
    const workDate = document.getElementById('compoff-earn-date').value, description = document.getElementById('compoff-earn-description').value.trim();
    if (!workDate) {
        showCustomAlert("Please select the working date.");
        return;
    }
    const dayOfWeek = new Date(workDate).getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !HOLIDAYS.includes(workDate)) {
        showCustomAlert("You can only request comp-off for working on a weekend or a holiday.");
        return;
    }
    const payload = { employee_id: currentUser.id, work_date: workDate, description: description };
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/compoff-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        showCustomAlert(`✅ ${response.message}`);
        closeCompoffEarnPopup();
    } catch (error) {
        showCustomAlert(`❌ Submission failed: ${error.message}`);
    }
}

async function loadLeaveHistory(employeeId) {
    const tableBody = document.querySelector('#leaveHistoryTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6">Loading history...</td></tr>';
    try {
        const history = await makeApiRequest(`${API_BASE_URL}/leave-applications/${employeeId}`, { method: 'GET' });
        tableBody.innerHTML = '';
        if (history && history.length > 0) {
            history.forEach(record => {
                const row = tableBody.insertRow();
                row.insertCell(0).textContent = record.leave_type;
                row.insertCell(1).textContent = record.from_date;
                row.insertCell(2).textContent = record.to_date || 'N/A';
                row.insertCell(3).textContent = record.leave_days;
                row.insertCell(4).textContent = record.description;
                row.insertCell(5).textContent = record.status;
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="6">No history found.</td></tr>';
        }
    } catch (error) {
        console.error("Failed to load leave history:", error);
        tableBody.innerHTML = '<tr><td colspan="6" style="color:red;">Could not load history.</td></tr>';
    }
}

async function loadLeaveBalance(employeeId) {
    try {
        const balances = await makeApiRequest(`${API_BASE_URL}/leave-balance/${employeeId}`, { method: 'GET' });
        const leaveBalanceTable = document.querySelector('#leave-balance-details .activities-table tbody');
        if (leaveBalanceTable) leaveBalanceTable.innerHTML = `<tr><td>Sick Leave</td><td>${balances.sick_leave.allotted}</td><td>${balances.sick_leave.availed}</td><td>${balances.sick_leave.balance}</td></tr><tr><td>Casual Leave</td><td>${balances.casual_leave.allotted}</td><td>${balances.casual_leave.availed}</td><td>${balances.casual_leave.balance}</td></tr>`;
        const wfhBalanceTable = document.querySelector('#wfh-details .activities-table tbody');
        if (wfhBalanceTable) wfhBalanceTable.innerHTML = `<tr><td>WFH</td><td>${balances.wfh.allotted}</td><td>${balances.wfh.availed}</td><td>${balances.wfh.balance}</td></tr>`;
        const compoffBalanceTable = document.querySelector('#compoff-details .activities-table tbody');
        if (compoffBalanceTable) compoffBalanceTable.innerHTML = `<tr><td>Comp-off</td><td>${balances.compoff.allotted}</td><td>${balances.compoff.availed}</td><td>${balances.compoff.balance}</td></tr>`;
    } catch (error) {
        console.error("Failed to load leave balances:", error);
    }
}

async function loadAdminDashboardStats() {
    try {
        const stats = await makeApiRequest(`${API_BASE_URL}/admin/dashboard-stats`, { method: 'GET' });
        document.getElementById('employee-count-widget').textContent = stats.employee_count;
        document.getElementById('pending-leave-widget').textContent = stats.pending_leaves;
        document.getElementById('pending-compoff-widget').textContent = stats.pending_compoffs;
    } catch (error) {
        console.error("Failed to load dashboard stats:", error);
        document.getElementById('employee-count-widget').textContent = "Error";
        document.getElementById('pending-leave-widget').textContent = "Error";
        document.getElementById('pending-compoff-widget').textContent = "Error";
    }
}

async function loadLeaveRequests() {
    const tableBody = document.getElementById('leaveRequestsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="11">Loading leave requests...</td></tr>';
    try {
        const requests = await makeApiRequest(`${API_BASE_URL}/admin/leave-requests`, { method: 'GET' });
        tableBody.innerHTML = '';
        if (requests && requests.length > 0) {
            requests.forEach(request => {
                const row = tableBody.insertRow();
                row.setAttribute('data-record-id', request.record_id);
                row.insertCell(0).textContent = request.employee_id;
                row.insertCell(1).textContent = `${request.first_name} ${request.last_name}`;
                row.insertCell(2).textContent = request.email;
                row.insertCell(3).textContent = request.reporting_manager1 || 'N/A';
                row.insertCell(4).textContent = request.reporting_manager2 || 'N/A';
                row.insertCell(5).textContent = request.leave_type;
                row.insertCell(6).textContent = request.leave_days;
                row.insertCell(7).textContent = request.from_date;
                row.insertCell(8).textContent = request.to_date || 'N/A';
                row.insertCell(9).textContent = request.description;
                const actionCell = row.insertCell(10);
                const approveBtn = document.createElement('button');
                approveBtn.textContent = 'Approve';
                approveBtn.className = 'btn btn-submit';
                approveBtn.style.marginRight = '5px';
                approveBtn.onclick = () => showCommentPopup(request.record_id, 'Approved');
                const rejectBtn = document.createElement('button');
                rejectBtn.textContent = 'Reject';
                rejectBtn.className = 'btn btn-clear';
                rejectBtn.onclick = () => showCommentPopup(request.record_id, 'Rejected');
                actionCell.appendChild(approveBtn);
                actionCell.appendChild(rejectBtn);
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="11">No pending leave requests.</td></tr>';
        }
    } catch (error) {
        console.error("Failed to load leave requests:", error);
        tableBody.innerHTML = '<tr><td colspan="11" style="color:red;">Failed to load leave requests.</td></tr>';
    }
}

async function loadCompoffRequests() {
    const tableBody = document.getElementById('compoffRequestsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6">Loading comp-off requests...</td></tr>';
    try {
        const requests = await makeApiRequest(`${API_BASE_URL}/admin/compoff-requests`, { method: 'GET' });
        tableBody.innerHTML = '';
        if (requests && requests.length > 0) {
            requests.forEach(request => {
                const row = tableBody.insertRow();
                row.setAttribute('data-record-id', request.record_id);
                row.insertCell(0).textContent = request.employee_id;
                row.insertCell(1).textContent = `${request.first_name} ${request.last_name}`;
                row.insertCell(2).textContent = request.email;
                row.insertCell(3).textContent = request.work_date;
                row.insertCell(4).textContent = request.description;
                const actionCell = row.insertCell(5);
                const approveBtn = document.createElement('button');
                approveBtn.textContent = 'Approve';
                approveBtn.className = 'btn btn-submit';
                approveBtn.style.marginRight = '5px';
                approveBtn.onclick = () => showCommentPopup(request.record_id, 'Approved', 'compoff');
                const rejectBtn = document.createElement('button');
                rejectBtn.textContent = 'Reject';
                rejectBtn.className = 'btn btn-clear';
                rejectBtn.onclick = () => showCommentPopup(request.record_id, 'Rejected', 'compoff');
                actionCell.appendChild(approveBtn);
                actionCell.appendChild(rejectBtn);
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="6">No pending comp-off requests.</td></tr>';
        }
    } catch (error) {
        console.error("Failed to load comp-off requests:", error);
        tableBody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load comp-off requests.</td></tr>';
    }
}

function showCommentPopup(recordId, action, type = 'leave') {
    currentLeaveRequest = { recordId, action, type };
    document.getElementById('commentPopup').style.display = 'flex';
}

function closeCommentPopup() {
    document.getElementById('commentPopup').style.display = 'none';
    document.getElementById('commentTextarea').value = '';
    currentLeaveRequest = null;
}

async function submitCommentAction() {
    if (!currentLeaveRequest) return;
    const { recordId, action, type } = currentLeaveRequest;
    const comment = document.getElementById('commentTextarea').value.trim();
    const confirmAction = await showCustomAlert(`Are you sure you want to ${action.toLowerCase()} this ${type} request?`, true);
    if (!confirmAction) return;
    let url = type === 'leave' ? `${API_BASE_URL}/admin/leave-action/${recordId}` : `${API_BASE_URL}/admin/compoff-action/${recordId}`;
    let errorMessage = type === 'leave' ? 'Failed to process leave request:' : 'Failed to process comp-off request:';
    try {
        const response = await makeApiRequest(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment }) });
        if (response.message) {
            showCustomAlert(`✅ ${response.message}`);
            closeCommentPopup();
            if (type === 'leave') loadLeaveRequests();
            else if (type === 'compoff') loadCompoffRequests();
            loadAdminDashboardStats();
        } else {
            showCustomAlert(`❌ An unexpected error occurred.`);
        }
    } catch (error) {
        showCustomAlert(`❌ ${errorMessage} ${error.message}`);
    }
}

document.getElementById('submitCommentBtn')?.addEventListener('click', submitCommentAction);
document.getElementById('closeCommentPopupBtn')?.addEventListener('click', closeCommentPopup);

document.getElementById("adminRegisterForm")?.addEventListener("submit", async function(event) {
    event.preventDefault();
    const formData = {
        first_name: document.getElementById("admin-first_name").value.trim(),
        last_name: document.getElementById("admin-last_name").value.trim(),
        email: document.getElementById("admin-reg_email").value.trim(),
        password: document.getElementById("admin-reg_password").value,
        join_date: document.getElementById("admin-join_date").value,
        personal_email: document.getElementById("admin-email").value.trim(),
        reporting_manager1: document.getElementById("admin-reporting_manager1").value.trim(),
        reporting_manager1_mail: document.getElementById("admin-reporting_manager1_mail").value.trim(),
        reporting_manager2: document.getElementById("admin-reporting_manager2").value.trim(),
        reporting_manager2_mail: document.getElementById("admin-reporting_manager2_mail").value.trim()
    };
    if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
        showCustomAlert("❌ Invalid official email format");
        return;
    }
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        showCustomAlert(`✅ ${response.message}`);
        this.reset();
    } catch (error) {
        showCustomAlert(`❌ Registration failed: ${error.message}`);
    }
});

async function fetchAndRenderNotifications(employeeId) {
    const dropdown = document.getElementById('notificationDropdown'), dot = document.getElementById('notificationDot');
    if (!dropdown || !dot) return;
    try {
        const notifications = await makeApiRequest(`${API_BASE_URL}/notifications/${employeeId}`, { method: 'GET' });
        dropdown.innerHTML = '';
        let hasUnread = false;
        if (notifications && notifications.length > 0) {
            notifications.forEach(n => {
                const newItem = document.createElement('div');
                newItem.className = 'notification-item';
                if (!n.is_read) {
                    newItem.classList.add('unread');
                    hasUnread = true;
                }
                newItem.textContent = n.message;
                dropdown.appendChild(newItem);
            });
        } else {
            dropdown.innerHTML = '<div class="notification-item">No new notifications</div>';
        }
        dot.classList.toggle('hidden', !hasUnread);
    } catch (error) {
        console.error("Failed to fetch notifications:", error);
        dropdown.innerHTML = '<div class="notification-item">Could not load notifications.</div>';
    }
}

async function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown'), dot = document.getElementById('notificationDot');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden') && !dot.classList.contains('hidden')) {
        dot.classList.add('hidden');
        dropdown.querySelectorAll('.notification-item.unread').forEach(item => item.classList.remove('unread'));
        try {
            await makeApiRequest(`${API_BASE_URL}/notifications/mark-read/${currentUser.id}`, { method: 'PUT' });
        } catch (error) {
            console.error("Failed to mark notifications as read:", error);
            dot.classList.remove('hidden');
        }
    }
}

function showForgotPasswordPopup() { document.getElementById('forgotPasswordPopup').style.display = 'flex'; }
function closeForgotPasswordPopup() { document.getElementById('forgotPasswordPopup').style.display = 'none'; }

document.getElementById('forgotPasswordForm')?.addEventListener('submit', async function(event) {
    event.preventDefault();
    const email = document.getElementById('forgot-email').value;
    if (!email) {
        showCustomAlert('Please enter your email address.');
        return;
    }
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
        showCustomAlert(response.message);
        closeForgotPasswordPopup();
    } catch (error) {
        showCustomAlert(`❌ An error occurred: ${error.message}`);
    }
});

const sections = document.querySelectorAll("main.profilee-section > section");
const navLinks = document.querySelectorAll(".app-sidebar ul li");

function showSection(sectionId) {
    sections.forEach(section => section.classList.add("hidden"));
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.remove("hidden");
        if (sectionId === 'events') {
            document.querySelectorAll("#events .content-section").forEach(s => s.classList.add("hidden"));
            const menuButtons = document.getElementById("menuButtons");
            if (menuButtons) menuButtons.style.display = "flex";
        }
        if (sectionId === 'timings' && currentUser) loadAttendanceRecords(currentUser.id);
        if (sectionId === 'leave-application' && currentUser) loadLeaveHistory(currentUser.id);
        if (sectionId === 'leave-balance' && currentUser) loadLeaveBalance(currentUser.id);
        if (sectionId === 'admin-dashboard-section') loadAdminDashboardStats();
        if (sectionId === 'admin-leave-requests') loadLeaveRequests();
        if (sectionId === 'admin-compoff-requests') loadCompoffRequests();
        if (sectionId === 'admin-attendance-records') loadAdminAttendanceRecords();
    }
}

navLinks.forEach(link => link.addEventListener("click", () => showSection(link.getAttribute("data-section"))));

document.querySelectorAll(".accordion").forEach(accordion => {
    accordion.querySelector(".accordion-header").addEventListener("click", (e) => {
        if (e.target.closest('button')) return;
        const body = accordion.querySelector(".accordion-body"), icon = accordion.querySelector("i.fa-chevron-down");
        const isDisplayed = body.style.display === "block";
        body.style.display = isDisplayed ? "none" : "block";
        if (icon) icon.style.transform = isDisplayed ? "rotate(0deg)" : "rotate(180deg)";
    });
});

function showCustomAlert(message, isConfirm = false) {
    const alertOverlay = document.getElementById('customAlert'), alertMessage = document.getElementById('customAlertMessage'), closeBtn = document.getElementById('customAlertCloseBtn'), cancelBtn = document.getElementById('customConfirmCancelBtn');
    alertMessage.textContent = message;
    alertOverlay.style.display = 'flex';
    closeBtn.textContent = isConfirm ? 'Yes' : 'OK';
    cancelBtn.style.display = isConfirm ? 'inline-block' : 'none';
    return new Promise((resolve) => {
        const handleClose = () => { alertOverlay.style.display = 'none'; closeBtn.removeEventListener('click', handleClose); cancelBtn.removeEventListener('click', handleCancel); resolve(true); };
        const handleCancel = () => { alertOverlay.style.display = 'none'; closeBtn.removeEventListener('click', handleClose); cancelBtn.removeEventListener('click', handleCancel); resolve(false); };
        closeBtn.addEventListener('click', handleClose);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

function showLeaveDetails(sectionId) {
    document.querySelectorAll('.profilee-section > section').forEach(section => section.id !== 'leave-balance' && section.classList.add('hidden'));
    document.getElementById('leave-balance').classList.add('hidden');
    const detailSection = document.getElementById(sectionId);
    if (detailSection) detailSection.classList.remove('hidden');
}

function showMainLeaveBalance() {
    ['leave-balance-details', 'wfh-details', 'compoff-details'].forEach(id => document.getElementById(id).classList.add('hidden'));
    const leaveBalanceSection = document.getElementById('leave-balance');
    if (leaveBalanceSection) leaveBalanceSection.classList.remove('hidden');
}

window.showLeaveDetails = showLeaveDetails;
window.showMainLeaveBalance = showMainLeaveBalance;
function openPopup(id = 'popupOverlay') { document.getElementById(id).style.display = 'flex'; }
function closePopup(id = 'popupOverlay') { document.getElementById(id).style.display = 'none'; }
window.openPopup = openPopup;
window.closePopup = closePopup;
window.openPopup1 = () => openPopup('popupOverlay1');
window.closePopup1 = () => closePopup('popupOverlay1');
window.openCompoffEarnPopup = () => openPopup('compoffEarnOverlay');
window.closeCompoffEarnPopup = () => closePopup('compoffEarnOverlay');
window.openPopup3 = () => openPopup('popupOverlay3');
window.closePopup3 = () => closePopup('popupOverlay3');

const menuButtons = document.getElementById("menuButtons"), contentSections = document.querySelectorAll(".content-section");
function showEventsSubSection(subSectionId) {
    const sectionToShow = document.getElementById(subSectionId);
    if (sectionToShow) {
        menuButtons.style.display = "none";
        contentSections.forEach(s => s.classList.add("hidden"));
        sectionToShow.classList.remove("hidden");
    }
}
window.showEventsSubSection = showEventsSubSection;
function goBack() { menuButtons.style.display = "flex"; contentSections.forEach(s => s.classList.add("hidden")); }
function toggleSearchBox(bodyId, iconId) {
    const searchBody = document.getElementById(bodyId), icon = document.getElementById(iconId);
    const isDisplayed = searchBody.style.display === 'block';
    searchBody.style.display = isDisplayed ? 'none' : 'block';
    icon.textContent = isDisplayed ? '▼' : '▲';
}
window.toggleSearchBox = toggleSearchBox;

document.getElementById("signOutTrigger")?.addEventListener("click", async () => {
  if (await showCustomAlert("Are you sure you want to sign out?", true)) {
    currentUser = null;
    window.location.reload();
  }
});

function addAttendanceRow(record) {
    const tableBody = document.querySelector('#attendanceTable tbody');
    if (!tableBody) return;
    const newRow = tableBody.insertRow(0);
    newRow.setAttribute('data-record-id', record.record_id);
    newRow.insertCell(0).textContent = record.date;
    newRow.insertCell(1).textContent = record.login_time;
    newRow.insertCell(2).textContent = record.employee_name;
    newRow.insertCell(3).textContent = record.work_location;
    const actionCell = newRow.insertCell(4), logoutTimeCell = newRow.insertCell(5);
    if (record.logout_time) {
        logoutTimeCell.textContent = record.logout_time;
    } else {
        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Logout';
        logoutButton.className = 'btn btn-logout';
        logoutButton.onclick = () => recordLogout(record.record_id, newRow);
        actionCell.appendChild(logoutButton);
        logoutTimeCell.textContent = 'Active';
    }
}

document.getElementById("recordLoginBtn")?.addEventListener("click", async () => {
    if (!currentUser || !currentUser.id) { showCustomAlert("Please log in to record attendance."); return; }
    const attendanceDate = document.getElementById("attendanceDate").value, attendanceEmployeeName = document.getElementById("attendanceEmployeeName").value, attendanceWorkLocation = document.getElementById("attendanceWorkLocation").value;
    if (!attendanceDate || attendanceWorkLocation === "-select-") { showCustomAlert("Please select a valid date and work location."); return; }
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/attendance/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: currentUser.id, date: attendanceDate, employee_name: attendanceEmployeeName, work_location: attendanceWorkLocation }) });
        if (response.record) {
            addAttendanceRow(response.record);
            showCustomAlert(`✅ Login recorded at ${response.record.login_time} for ${attendanceWorkLocation}`);
        } else {
            showCustomAlert(`❌ Failed to record login: ${response.message || "Unknown error"}`);
        }
    } catch (error) {
        showCustomAlert(`❌ Error recording login: ${error.message}`);
    }
});

async function recordLogout(recordId, rowElement) {
    if (!currentUser || !currentUser.id) { showCustomAlert("Please log in to record attendance."); return; }
    if (!await showCustomAlert("Are you sure you want to record logout for this session?", true)) return;
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/attendance/logout/${recordId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' } });
        if (response.logout_time) {
            rowElement.cells[4].innerHTML = '';
            rowElement.cells[5].textContent = response.logout_time;
            showCustomAlert(`✅ Logout recorded at ${response.logout_time}`);
        } else {
            showCustomAlert(`❌ Failed to record logout: ${response.message || "Unknown error"}`);
        }
    } catch (error) {
        showCustomAlert(`❌ Error recording logout: ${error.message}`);
    }
}

async function loadAttendanceRecords(employeeId) {
    const tableBody = document.querySelector('#attendanceTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6">Loading attendance records...</td></tr>';
    try {
        const records = await makeApiRequest(`${API_BASE_URL}/attendance/${employeeId}`, { method: 'GET' });
        tableBody.innerHTML = '';
        if (records && records.length > 0) {
            records.forEach(addAttendanceRow);
        } else {
            tableBody.innerHTML = '<tr><td colspan="6">No attendance records found.</td></tr>';
        }
    } catch (error) {
        showCustomAlert(`❌ Error loading attendance records: ${error.message}`);
        tableBody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load attendance records.</td></tr>';
    }
}

// NEW: Function to load all attendance records for the admin
async function loadAdminAttendanceRecords() {
    const tableBody = document.getElementById('adminAttendanceTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5">Loading attendance records...</td></tr>';
    try {
        const records = await makeApiRequest(`${API_BASE_URL}/admin/attendance-records`, { method: 'GET' });
        tableBody.innerHTML = ''; // Clear loading message
        if (records && records.length > 0) {
            records.forEach(record => {
                const row = tableBody.insertRow();
                row.insertCell(0).textContent = record.date;
                row.insertCell(1).textContent = record.employee_name;
                row.insertCell(2).textContent = record.login_time;
                row.insertCell(3).textContent = record.work_location;
                row.insertCell(4).textContent = record.logout_time || 'Active'; // Show 'Active' if logout_time is null
            });
        } else {
            tableBody.innerHTML = '<tr><td colspan="5">No attendance records found.</td></tr>';
        }
    } catch (error) {
        console.error("Failed to load admin attendance records:", error);
        tableBody.innerHTML = '<tr><td colspan="5" style="color:red;">Failed to load attendance records.</td></tr>';
    }
}


document.getElementById('changePasswordForm')?.addEventListener('submit', async function(event) {
    event.preventDefault();
    if (!currentUser) { showCustomAlert('❌ You must be logged in to change your password.'); return; }
    const currentPassword = document.getElementById('change-current-password').value, newPassword = document.getElementById('change-new-password').value, confirmPassword = document.getElementById('change-confirm-password').value;
    if (newPassword.length < 8) { showCustomAlert('❌ New password must be at least 8 characters long.'); return; }
    if (newPassword !== confirmPassword) { showCustomAlert('❌ New passwords do not match.'); return; }
    try {
        const response = await makeApiRequest(`${API_BASE_URL}/profile/change-password/${currentUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_password: currentPassword, new_password: newPassword }) });
        if (response.message === "Password updated successfully!") {
            showCustomAlert('✅ Your password has been updated successfully.');
            fetchAndRenderNotifications(currentUser.id);
            this.reset();
        } else {
            showCustomAlert(`❌ Password change failed: ${response.message || 'An unknown error occurred.'}`);
        }
    } catch (error) {
        showCustomAlert(`❌ An error occurred: ${error.message}`);
    }
});

document.getElementById('adminResetPasswordForm')?.addEventListener('submit', async function(event) {
    event.preventDefault();

    const employeeEmail = document.getElementById('admin-reset-email').value.trim();
    const newPassword = document.getElementById('admin-reset-new-password').value;
    const confirmPassword = document.getElementById('admin-reset-confirm-password').value;

    if (!employeeEmail) {
        showCustomAlert('❌ Please enter the employee email.');
        return;
    }
    if (newPassword.length < 8) {
        showCustomAlert('❌ New password must be at least 8 characters long.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showCustomAlert('❌ New passwords do not match.');
        return;
    }

    try {
        const response = await makeApiRequest(`${API_BASE_URL}/admin/reset-employee-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: employeeEmail, new_password: newPassword })
        });

        if (response.message) {
            showCustomAlert(`✅ ${response.message}`);
            this.reset(); // Clear the form on success
        } else {
            showCustomAlert(`❌ Password reset failed: ${response.message || 'An unknown error occurred.'}`);
        }
    } catch (error) {
        showCustomAlert(`❌ An error occurred: ${error.message}`);
    }
});