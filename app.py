from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime
import uuid
import random
import string
import os
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from flask_mail import Mail, Message

# --- Load Environment Variables ---
load_dotenv()

app = Flask(__name__)
CORS(app)

# --- SECURE: Email Configuration from Environment Variables ---
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_USERNAME')

mail = Mail(app)

DATABASE = 'hrms.db'

# --- SECURE: Admin Configuration from Environment Variables ---
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@gmail.com')
ADMIN_PASSWORD_HASH = generate_password_hash(os.getenv('ADMIN_PASSWORD_RAW', '123'))

# --- Database Initialization and Helper Functions ---
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Employee Table - MODIFIED to include force_password_change
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, gender TEXT, dob TEXT,
            permanent_address TEXT, current_address TEXT, pan_number TEXT,
            aadhar_number TEXT, contactnumber TEXT, alternate_contact_number TEXT,
            alternate_contact_person TEXT, alternate_contact_relation TEXT,
            emergency_number TEXT, account_number TEXT, ifsc_code TEXT,
            account_holder_name TEXT, branch TEXT, department TEXT,
            reporting_manager1 TEXT, reporting_manager1_mail TEXT,
            reporting_manager2 TEXT, reporting_manager2_mail TEXT,
            employee_role TEXT, employment_status TEXT, join_date TEXT,
            personal_email TEXT,
            user_type TEXT NOT NULL DEFAULT 'employee',
            force_password_change INTEGER NOT NULL DEFAULT 0
        )
    ''')
    # Attendance Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance_records (
            record_id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, date TEXT NOT NULL,
            login_time TEXT NOT NULL, work_location TEXT, logout_time TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
    ''')
    # Notifications Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id TEXT PRIMARY KEY, employee_id TEXT NOT NULL,
            message TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
    ''')
    # Leave Applications Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leave_applications (
            record_id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            leave_type TEXT NOT NULL,
            from_date TEXT NOT NULL,
            to_date TEXT,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'Pending',
            comment TEXT,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            leave_days INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
    ''')
    # Leave Balance Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leave_balances (
            employee_id TEXT PRIMARY KEY,
            sick_leave INTEGER DEFAULT 8,
            casual_leave INTEGER DEFAULT 18,
            earned_leave INTEGER DEFAULT 0,
            paternity_leave INTEGER DEFAULT 0,
            wfh INTEGER DEFAULT 12,
            compoff INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
    ''')
    # Holiday Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS holidays (
            date TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
    ''')
    # Comp-off Requests table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS compoff_requests (
            record_id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            work_date TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'Pending',
            comment TEXT,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
    ''')
    holidays = [
        ('2025-01-26', 'Republic Day'), ('2025-03-14', 'Holi'),
        ('2025-03-31', 'Id-ul-Fitr'), ('2025-04-18', 'Good Friday'),
        ('2025-08-15', 'Independence Day'), ('2025-10-02', 'Mahatma Gandhi\'s Birthday / Dussehra'),
        ('2025-10-20', 'Diwali'), ('2025-12-25', 'Christmas Day'),
    ]
    cursor.executemany('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)', holidays)
    conn.commit()
    conn.close()

def create_notification(conn, employee_id, message):
    try:
        cursor = conn.cursor()
        notification_id = str(uuid.uuid4())
        cursor.execute(
            'INSERT INTO notifications (notification_id, employee_id, message) VALUES (?, ?, ?)',
            (notification_id, employee_id, message)
        )
    except sqlite3.Error as e:
        print(f"Database error creating notification: {e}")

with app.app_context():
    init_db()

# --- API Endpoints ---
@app.route('/register', methods=['POST'])
def register_employee():
    data = request.get_json()
    required_fields = ["first_name", "last_name", "email", "password"]
    if not all(field in data for field in required_fields):
        return jsonify({"message": "Missing required fields"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT email FROM employees WHERE email = ?", (data['email'],))
        if cursor.fetchone():
            return jsonify({"message": "Email already exists"}), 409
        cursor.execute("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) FROM employees WHERE id LIKE 'SSQ-%'")
        last_id_num = cursor.fetchone()[0]
        new_id_num = (last_id_num if last_id_num else 1000) + 1
        new_id = f"SSQ-{new_id_num}"
        hashed_password = generate_password_hash(data['password'])
        cursor.execute('''
            INSERT INTO employees (
                id, first_name, last_name, email, password, gender, dob,
                permanent_address, current_address, pan_number, aadhar_number,
                contactnumber, alternate_contact_number, alternate_contact_person,
                alternate_contact_relation, emergency_number, account_number,
                ifsc_code, account_holder_name, branch, department,
                reporting_manager1, reporting_manager1_mail,
                reporting_manager2, reporting_manager2_mail,
                employee_role, employment_status, join_date, personal_email, force_password_change
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ''', (
            new_id, data['first_name'], data['last_name'], data['email'], hashed_password,
            data.get('gender'), data.get('dob'), data.get('permanent_address'),
            data.get('current_address'), data.get('pan_number'), data.get('aadhar_number'),
            data.get('contactnumber'), data.get('alternate_contact_number'),
            data.get('alternate_contact_person'), data.get('alternate_contact_relation'),
            data.get('emergency_number'), data.get('account_number'), data.get('ifsc_code'),
            data.get('account_holder_name'), data.get('branch'), data.get('department'),
            data.get('reporting_manager1'), data.get('reporting_manager1_mail'),
            data.get('reporting_manager2'), data.get('reporting_manager2_mail'),
            data.get('employee_role'), data.get('employment_status'), data.get('join_date'),
            data.get('personal_email')
        ))
        cursor.execute("INSERT INTO leave_balances (employee_id) VALUES (?)", (new_id,))
        conn.commit()
        return jsonify({"message": "Registration successful!", "id": new_id}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/login', methods=['POST'])
def login_employee():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    user_type = data.get('user_type')

    if not all([username, password, user_type]):
        return jsonify({"message": "Email, password, and user_type are required"}), 400

    if user_type == 'admin':
        if username == ADMIN_EMAIL and check_password_hash(ADMIN_PASSWORD_HASH, password):
            admin_user = {"id": "ADMIN-001", "first_name": "Admin", "last_name": "User", "email": ADMIN_EMAIL, "user_type": "admin"}
            return jsonify({"message": "Admin login successful!", "user": admin_user}), 200
        else:
            return jsonify({"message": "Invalid Admin credentials"}), 401
    elif user_type == 'employee':
        if username == ADMIN_EMAIL:
            return jsonify({"message": "Invalid employee credentials"}), 401
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM employees WHERE email = ?", (username,))
        employee = cursor.fetchone()
        conn.close()
        if employee and check_password_hash(employee['password'], password):
            # MODIFIED: Check the force_password_change flag
            if employee['force_password_change'] == 1:
                return jsonify({
                    "message": "Password change required",
                    "force_change": True,
                    "user_id": employee['id']
                }), 200
            employee_dict = dict(employee)
            employee_dict.pop('password', None)
            return jsonify({"message": "Login successful!", "user": employee_dict}), 200
        else:
            return jsonify({"message": "Invalid employee credentials"}), 401
    else:
        return jsonify({"message": "Invalid user type specified"}), 400

# NEW Endpoint
@app.route('/force-change-password', methods=['PUT'])
def force_change_password():
    data = request.get_json()
    user_id = data.get('user_id')
    new_password = data.get('new_password')
    if not user_id or not new_password:
        return jsonify({"message": "User ID and new password are required"}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        hashed_new_password = generate_password_hash(new_password)
        cursor.execute(
            "UPDATE employees SET password = ?, force_password_change = 0 WHERE id = ?",
            (hashed_new_password, user_id)
        )
        if cursor.rowcount == 0:
            return jsonify({"message": "Employee not found"}), 404
        create_notification(conn, user_id, "Your password was successfully set on first login.")
        conn.commit()
        cursor.execute("SELECT * FROM employees WHERE id = ?", (user_id,))
        employee = cursor.fetchone()
        employee_dict = dict(employee)
        employee_dict.pop('password', None)
        return jsonify({
            "message": "Password updated successfully! Logging in...",
            "user": employee_dict
        }), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email')
    if not email:
        return jsonify({"message": "Email is required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM employees WHERE email = ?", (email,))
    employee = cursor.fetchone()
    if employee:
        new_password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
        hashed_new_password = generate_password_hash(new_password)
        try:
            # MODIFIED: Also set force_password_change to 1 on reset
            cursor.execute("UPDATE employees SET password = ?, force_password_change = 1 WHERE email = ?", (hashed_new_password, email))
            create_notification(conn, employee['id'], "Your password was reset via email request.")
            conn.commit()
            msg = Message('Your HRMS Password has been Reset', recipients=[email])
            msg.body = f"""Hello {employee['first_name']},
            Your password for the HRMS portal has been reset.
            Your new temporary password is: {new_password}
            Please log in with this password. You will be required to set a new password immediately.
            Thank you,
            HRMS System"""
            mail.send(msg)
            return jsonify({"message": "A new password has been sent to your email address."}), 200
        except Exception as e:
            conn.rollback()
            return jsonify({"message": f"Failed to reset password. Error: {e}"}), 500
        finally:
            conn.close()
    else:
        conn.close()
        return jsonify({"message": "If an account with that email exists, a new password has been sent."}), 200

@app.route('/profile/change-password/<string:employee_id>', methods=['PUT'])
def change_password(employee_id):
    data = request.get_json()
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    if not all([old_password, new_password]):
        return jsonify({"message": "Old and new passwords are required"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM employees WHERE id = ?", (employee_id,))
        employee = cursor.fetchone()
        if not employee:
            return jsonify({"message": "Employee not found"}), 404
        if not check_password_hash(employee['password'], old_password):
            return jsonify({"message": "Incorrect old password"}), 400
        hashed_new_password = generate_password_hash(new_password)
        cursor.execute("UPDATE employees SET password = ? WHERE id = ?", (hashed_new_password, employee_id))
        create_notification(conn, employee_id, "Your password was changed successfully.")
        conn.commit()
        return jsonify({"message": "Password updated successfully!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/profile/<string:employee_id>', methods=['GET'])
def get_employee_profile(employee_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM employees WHERE id = ?", (employee_id,))
    employee = cursor.fetchone()
    conn.close()
    if employee:
        employee_dict = dict(employee)
        employee_dict.pop('password', None)
        return jsonify(employee_dict), 200
    else:
        return jsonify({"message": "Employee not found"}), 404

@app.route('/profile/<string:employee_id>', methods=['PUT'])
def update_employee_profile(employee_id):
    data = request.get_json()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM employees WHERE id = ?", (employee_id,))
        if not cursor.fetchone():
            return jsonify({"message": "Employee not found"}), 404
        set_clauses = []
        update_values = []
        allowed_keys = [
            'first_name', 'last_name', 'gender', 'dob', 'permanent_address', 'current_address',
            'pan_number', 'aadhar_number', 'contactnumber', 'alternate_contact_number',
            'alternate_contact_person', 'alternate_contact_relation', 'emergency_number',
            'account_number', 'ifsc_code', 'account_holder_name', 'branch', 'department',
            'reporting_manager1', 'reporting_manager1_mail', 'reporting_manager2',
            'reporting_manager2_mail', 'employee_role', 'employment_status', 'join_date'
        ]
        for key, value in data.items():
            if key in allowed_keys:
                set_clauses.append(f"{key} = ?")
                update_values.append(value)
        if not set_clauses:
            return jsonify({"message": "No valid fields to update"}), 400
        update_query = f"UPDATE employees SET {', '.join(set_clauses)} WHERE id = ?"
        update_values.append(employee_id)
        cursor.execute(update_query, tuple(update_values))
        create_notification(conn, employee_id, "Your profile details have been updated.")
        conn.commit()
        cursor.execute("SELECT * FROM employees WHERE id = ?", (employee_id,))
        updated_employee = cursor.fetchone()
        updated_employee_dict = dict(updated_employee)
        updated_employee_dict.pop('password', None)
        return jsonify({"message": "Profile updated successfully!", "user": updated_employee_dict}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/notifications/<string:employee_id>', methods=['GET'])
def get_notifications(employee_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT message, is_read FROM notifications WHERE employee_id = ? ORDER BY timestamp DESC",
        (employee_id,)
    )
    notifications = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(notifications), 200

@app.route('/notifications/mark-read/<string:employee_id>', methods=['PUT'])
def mark_notifications_as_read(employee_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE notifications SET is_read = 1 WHERE employee_id = ? AND is_read = 0",
            (employee_id,)
        )
        conn.commit()
        return jsonify({"message": f"{cursor.rowcount} notifications marked as read."}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/leave-application', methods=['POST'])
def submit_leave_application():
    data = request.get_json()
    employee_id, leave_type, from_date, to_date, description, leave_days = \
        data.get('employee_id'), data.get('leave_type'), data.get('from_date'), data.get('to_date'), data.get('description'), data.get('leave_days')
    if not all([employee_id, leave_type, from_date, leave_days is not None]):
        return jsonify({"message": "Missing required fields for leave application"}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        record_id = str(uuid.uuid4())
        cursor.execute(
            '''INSERT INTO leave_applications (record_id, employee_id, leave_type, from_date, to_date, description, leave_days)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (record_id, employee_id, leave_type, from_date, to_date, description, leave_days)
        )
        create_notification(conn, employee_id, f"Your request for {leave_days} days of {leave_type} has been submitted.")
        conn.commit()
        return jsonify({"message": f"{leave_days} days of {leave_type} application submitted successfully!"}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/leave-applications/<string:employee_id>', methods=['GET'])
def get_leave_applications(employee_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM leave_applications WHERE employee_id = ? ORDER BY submitted_at DESC",
        (employee_id,)
    )
    applications = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(applications), 200

@app.route('/leave-balance/<string:employee_id>', methods=['GET'])
def get_leave_balance(employee_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            SELECT leave_type, SUM(leave_days) as total_availed
            FROM leave_applications WHERE employee_id = ? AND status = 'Approved' GROUP BY leave_type
        ''', (employee_id,))
        availed_leaves = {row['leave_type']: row['total_availed'] for row in cursor.fetchall()}
        cursor.execute('SELECT * FROM leave_balances WHERE employee_id = ?', (employee_id,))
        balance_record = cursor.fetchone()
        if not balance_record:
            cursor.execute("INSERT INTO leave_balances (employee_id) VALUES (?)", (employee_id,))
            conn.commit()
            cursor.execute('SELECT * FROM leave_balances WHERE employee_id = ?', (employee_id,))
            balance_record = cursor.fetchone()
        allotted_balances = dict(balance_record)
        allotted_balances.pop('employee_id', None)
        final_balances = {}
        for leave_type in allotted_balances:
            availed = availed_leaves.get(leave_type.replace('_', ' ').title(), 0)
            balance = allotted_balances[leave_type] - availed
            final_balances[leave_type] = {'allotted': allotted_balances[leave_type], 'availed': availed, 'balance': balance}
        return jsonify(final_balances), 200
    except sqlite3.Error as e:
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/admin/leave-requests', methods=['GET'])
def get_pending_leave_requests():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''SELECT l.*, e.first_name, e.last_name, e.email, e.reporting_manager1, e.reporting_manager2
           FROM leave_applications l JOIN employees e ON l.employee_id = e.id
           WHERE l.status = 'Pending' ORDER BY l.submitted_at ASC'''
    )
    requests = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(requests), 200

@app.route('/admin/leave-action/<string:record_id>', methods=['PUT'])
def process_leave_action(record_id):
    data = request.get_json()
    action = data.get('action')
    comment = data.get('comment')
    if action not in ['Approved', 'Rejected']:
        return jsonify({"message": "Invalid action"}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT employee_id, leave_type, leave_days FROM leave_applications WHERE record_id = ?", (record_id,))
        leave_request = cursor.fetchone()
        if not leave_request:
            return jsonify({"message": "Leave request not found"}), 404
        employee_id, leave_type, leave_days = leave_request['employee_id'], leave_request['leave_type'], leave_request['leave_days']
        cursor.execute("UPDATE leave_applications SET status = ?, comment = ? WHERE record_id = ?", (action, comment, record_id))
        conn.commit()
        message = f"Your request for {leave_days} days of {leave_type} has been {action.lower()}."
        if comment:
            message += f" Admin comment: {comment}"
        create_notification(conn, employee_id, message)
        conn.commit()
        return jsonify({"message": "Leave request processed successfully!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/compoff-request', methods=['POST'])
def submit_compoff_request():
    data = request.get_json()
    employee_id, work_date, description = data.get('employee_id'), data.get('work_date'), data.get('description')
    if not all([employee_id, work_date]):
        return jsonify({"message": "Missing required fields for comp-off request"}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        record_id = str(uuid.uuid4())
        cursor.execute(
            '''INSERT INTO compoff_requests (record_id, employee_id, work_date, description)
               VALUES (?, ?, ?, ?)''',
            (record_id, employee_id, work_date, description)
        )
        create_notification(conn, employee_id, f"Your request to earn a comp-off for working on {work_date} has been submitted for approval.")
        conn.commit()
        return jsonify({"message": "Comp-off request submitted successfully!"}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/admin/compoff-requests', methods=['GET'])
def get_pending_compoff_requests():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''SELECT l.*, e.first_name, e.last_name, e.email
           FROM compoff_requests l JOIN employees e ON l.employee_id = e.id
           WHERE l.status = 'Pending' ORDER BY l.submitted_at ASC'''
    )
    requests = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(requests), 200

@app.route('/admin/compoff-action/<string:record_id>', methods=['PUT'])
def process_compoff_action(record_id):
    data = request.get_json()
    action = data.get('action')
    comment = data.get('comment')
    if action not in ['Approved', 'Rejected']:
        return jsonify({"message": "Invalid action"}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT employee_id, work_date FROM compoff_requests WHERE record_id = ?", (record_id,))
        compoff_request = cursor.fetchone()
        if not compoff_request:
            return jsonify({"message": "Comp-off request not found"}), 404
        employee_id, work_date = compoff_request['employee_id'], compoff_request['work_date']
        cursor.execute("UPDATE compoff_requests SET status = ?, comment = ? WHERE record_id = ?", (action, comment, record_id))
        if action == 'Approved':
            cursor.execute("UPDATE leave_balances SET compoff = compoff + 1 WHERE employee_id = ?", (employee_id,))
            message = f"Your request to earn a comp-off for working on {work_date} has been approved. Your balance has been updated."
        else:
            message = f"Your request to earn a comp-off for working on {work_date} has been rejected."
        if comment:
            message += f" Admin comment: {comment}"
        create_notification(conn, employee_id, message)
        conn.commit()
        return jsonify({"message": "Comp-off request processed successfully!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/admin/reset-employee-password', methods=['PUT'])
def admin_reset_employee_password():
    data = request.get_json()
    email = data.get('email')
    new_password = data.get('new_password')

    if not email or not new_password:
        return jsonify({"message": "Email and new password are required"}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM employees WHERE email = ?", (email,))
        employee = cursor.fetchone()

        if not employee:
            return jsonify({"message": "Employee not found with that email"}), 404

        employee_id = employee['id']
        hashed_new_password = generate_password_hash(new_password)

        # Update password and force change on next login
        cursor.execute(
            "UPDATE employees SET password = ?, force_password_change = 1 WHERE id = ?",
            (hashed_new_password, employee_id)
        )

        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({"message": "Failed to update password"}), 500

        # Create a notification for the employee
        create_notification(conn, employee_id, "Your password was reset by an administrator.")
        conn.commit()

        return jsonify({"message": f"Password for {email} has been reset successfully."}), 200

    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/admin/dashboard-stats', methods=['GET'])
def get_dashboard_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM employees")
        employee_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM leave_applications WHERE status = 'Pending'")
        pending_leaves = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM compoff_requests WHERE status = 'Pending'")
        pending_compoffs = cursor.fetchone()[0]
        return jsonify({"employee_count": employee_count, "pending_leaves": pending_leaves, "pending_compoffs": pending_compoffs}), 200
    except sqlite3.Error as e:
        return jsonify({"message": f"Database error: {e}"}), 500
    finally:
        conn.close()

@app.route('/attendance/login', methods=['POST'])
def attendance_login():
    data = request.get_json()
    employee_id, date_str, work_location, employee_name = data.get('employee_id'), data.get('date'), data.get('work_location'), data.get('employee_name')
    if not all([employee_id, date_str, work_location, employee_name]):
        return jsonify({"message": "Missing required attendance login fields"}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        record_id = str(uuid.uuid4())
        login_time = datetime.now().strftime('%H:%M:%S')
        cursor.execute('INSERT INTO attendance_records (record_id, employee_id, date, login_time, work_location) VALUES (?, ?, ?, ?, ?)',
                       (record_id, employee_id, date_str, login_time, work_location))
        conn.commit()
        return jsonify({"message": "Login recorded successfully!", "record": {"record_id": record_id, "employee_id": employee_id, "date": date_str, "login_time": login_time, "employee_name": employee_name, "work_location": work_location, "logout_time": None}}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error recording login: {e}"}), 500
    finally:
        conn.close()

@app.route('/attendance/logout/<string:record_id>', methods=['PUT'])
def attendance_logout(record_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        logout_time = datetime.now().strftime('%H:%M:%S')
        cursor.execute("UPDATE attendance_records SET logout_time = ? WHERE record_id = ? AND logout_time IS NULL", (logout_time, record_id))
        if cursor.rowcount == 0:
            return jsonify({"message": "Attendance record not found or already logged out"}), 404
        conn.commit()
        return jsonify({"message": "Logout recorded successfully!", "logout_time": logout_time}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"message": f"Database error recording logout: {e}"}), 500
    finally:
        conn.close()

@app.route('/attendance/<string:employee_id>', methods=['GET'])
def get_employee_attendance(employee_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''SELECT ar.record_id, ar.date, ar.login_time, ar.work_location, ar.logout_time, e.first_name, e.last_name
                      FROM attendance_records ar JOIN employees e ON ar.employee_id = e.id
                      WHERE ar.employee_id = ? ORDER BY ar.date DESC, ar.login_time DESC''', (employee_id,))
    records = cursor.fetchall()
    conn.close()
    attendance_list = []
    for record in records:
        record_dict = dict(record)
        record_dict['employee_name'] = f"{record_dict.pop('first_name')} {record_dict.pop('last_name')}"
        attendance_list.append(record_dict)
    return jsonify(attendance_list), 200

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)