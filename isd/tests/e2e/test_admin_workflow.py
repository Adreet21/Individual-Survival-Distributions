"""
End-to-end tests for admin workflow.
Tests complete user workflows including login, logout, and password reset.
"""

import time, re
# Note: This test requires pytest for advanced features, but can run with Django's test runner
from django.core import mail
from django.contrib.auth.models import User
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support import expected_conditions as EC


@pytest.fixture(scope="function")
def driver():
    """Set up Chrome WebDriver for testing."""
    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    yield driver
    driver.quit()


@pytest.fixture
def admin_user(db):
    """Create an admin user in the test DB."""
    user = User.objects.create_superuser(
        username="testadmin",
        email="testadmin@example.com",
        password="adminpass123"
    )
    return user


def test_admin_login_logout_reset(live_server, driver, admin_user):
    """Simulate typing, login, logout, forget password and resetting password in Django admin."""

    driver.get(f"{live_server.url}/admin/login/")
    time.sleep(2)

    # 1. Click "Forgot password?" link
    forgot_link = driver.find_element(By.LINK_TEXT, "Forgot your password?")
    forgot_link.click()
    time.sleep(2)

    # 2. Enter admin email slowly
    email_field = driver.find_element(By.NAME, "email")
    for c in admin_user.email:
        email_field.send_keys(c)
        time.sleep(0.2)

    # 3. Submit forgot password form
    driver.find_element(By.XPATH, "//button[text()='Send Reset Link']").click()
    time.sleep(2)

    # 4. Confirm message visible
    assert "Password reset link sent if that email exists." in driver.page_source

    # 5. Grab reset link from test email backend
    assert len(mail.outbox) == 1, "No emails captured"
    email_body = mail.outbox[0].body

    match = re.search(r'https?://[^ ]+/auth/reset-password/\S+', email_body)
    assert match, f"No reset link found in email body:\n{email_body}"
    reset_link = match.group(0)

    # 6. Visit the reset link
    driver.get(reset_link)
    time.sleep(2)

    # 7. Type new password slowly
    new_password = "NewSecurePass456!"
    password_field = driver.find_element(By.NAME, "password")
    confirm_field = driver.find_element(By.NAME, "password2")
    for c in new_password:
        password_field.send_keys(c)
        time.sleep(0.2)
    for c in new_password:
        confirm_field.send_keys(c)
        time.sleep(0.2)

    driver.find_element(By.XPATH, "//button[text()='Set new password']").click()
    time.sleep(2)

    # 8. Confirm reset success
    assert "Password has been reset. You may now log in." in driver.page_source

    # 9. Go back to login page
    driver.get(f"{live_server.url}/admin/login/")
    time.sleep(2)

    # 10. Log in with new password slowly
    username_field = driver.find_element(By.NAME, "username")
    password_field = driver.find_element(By.NAME, "password")

    for c in admin_user.username:
        username_field.send_keys(c)
        time.sleep(0.2)
    for c in new_password:
        password_field.send_keys(c)
        time.sleep(0.2)

    driver.find_element(By.CSS_SELECTOR, "input[type='submit']").click()

    # 11. Confirm dashboard loads 
    time.sleep(2)
    assert "Site administration" in driver.page_source

    # 12. Log out by clicking a button
    logout_button = driver.find_element(By.XPATH, "//form[@id='logout-form']//button[@type='submit']")
    logout_button.click()

    # 13. Wait for logout to complete
    time.sleep(2)
    assert "Log in" in driver.page_source or "username" in driver.page_source
    time.sleep(2)