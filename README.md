# Human Resource Management System (HRMS)

A full-stack web application designed to streamline and automate core HR processes. This HRMS provides distinct modules for employees and administrators, offering a comprehensive suite of tools for managing personnel, leaves, attendance, and more, all through an intuitive web interface.

---
##  Screenshots

| Login Page | Employee Dashboard | Admin Dashboard |
| :---: | :---: | :---: |
|  |  | 

[Image of the admin dashboard]
 |
| **Leave Application Popup** | **Admin Leave Requests** | **Register New Employee** |
|  |  |  |

---
## Features

### 🧑‍💼 Employee Module
* **Dashboard**: A personalized welcome screen for employees.
* **Profile Management**: Employees can view and edit their personal, contact, bank, and work details.
* **Leave Management**:
    * Apply for various leave types (Sick, Casual, WFH).
    * View detailed application history and status.
    * Check current leave balances in real-time.
    * Request to earn "Compensatory Off" for working on holidays.
* **Attendance Tracking**: Employees can log their daily check-in and check-out times and view their complete attendance history.
* **Secure Password Management**: Users can securely change their own passwords from within their session.
* **Notifications**: Receive real-time updates on leave approvals, password resets, and other important events.

### 👑 Admin Module
* **Admin Dashboard**: Get a quick overview of key metrics like total employees and the number of pending leave/comp-off requests.
* **Employee Registration**: A simplified form to quickly register new employees with essential details like name, email, password, and reporting structure.
* **Request Management**: View, approve, or reject pending leave and compensatory time-off requests with the ability to add comments.
* **Password Administration**: Admins can securely reset any employee's password. For security, the employee is required to set a new password on their next login.

---
## Technology Stack

* **Backend**: **Python** with the **Flask** micro-framework.
* **Frontend**: **HTML5**, **CSS3**, and vanilla **JavaScript** for client-side logic.
* **Database**: **SQLite** for lightweight and serverless data storage.
* **Email Notifications**: **Flask-Mail** with a Gmail SMTP server for sending password reset emails.
* **Dependencies**: `Flask`, `Flask-Cors`, `Flask-Mail`, `python-dotenv`, `Werkzeug`.

---
## Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

* Python 3.8 or higher
* A web browser
* A Google Account (to create an App Password for sending emails)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/hrms-application.git](https://github.com/your-username/hrms-application.git)
    cd hrms-application
    ```

2.  **Create and activate a virtual environment:**
    This keeps your project dependencies isolated.
    ```bash
    # For Windows
    python -m venv venv
    venv\Scripts\activate

    # For macOS/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install the required packages:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a file named `.env` in the root project directory. This file will store your sensitive credentials securely.
    ```env
    # Admin credentials for the application
    ADMIN_EMAIL="admin@example.com"
    ADMIN_PASSWORD_RAW="your_secure_admin_password"

    # Gmail credentials for sending password reset emails
    MAIL_USERNAME="your-email@gmail.com"
    MAIL_PASSWORD="your-google-app-password"
    ```
    **Important**: For `MAIL_PASSWORD`, you must generate a **Google App Password**. Your regular Google password will not work if you have 2-Step Verification enabled. [Learn how to create an App Password](https://support.google.com/accounts/answer/185833).

5.  **Initialize the Database and Run the Server:**
    ```bash
    python app.py
    ```
    This command will create the `hrms.db` file if it doesn't exist and start the backend server, which will be accessible at `http://127.0.0.1:5000`.

6.  **Launch the Frontend:**
    Simply open the `hello.html` file in your web browser. The application is now ready to use!

---
## Usage

* **Admin Login**: Use the credentials you set in the `.env` file to log in as an administrator.
* **Employee Registration**: As an admin, navigate to the "Register Employee" section to create new employee accounts.
* **Employee Login**: Use the credentials created by the admin to log in as an employee. New employees will be prompted to set a new password upon their first login.

