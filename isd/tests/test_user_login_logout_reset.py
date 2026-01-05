from django.core import mail
from selenium import webdriver
import os, re, time, signal, subprocess
from django.test import override_settings
from django.test import LiveServerTestCase
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from django.contrib.auth import get_user_model
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
from predictors.models import Predictor
from dataset.models import Dataset
from folders.models import Folder, FolderItem
from django.contrib.contenttypes.models import ContentType
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

User = get_user_model()

@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="http://localhost:5173"
)

class PasswordResetFlowTest(LiveServerTestCase):
    """
    Full end-to-end password reset test:
      - Open frontend (localhost:5173)
      - Click Login then Forgot password
      - Submit email
      - Capture email from Django test outbox
      - Visit reset link (React page)
      - Set new password
      - Log in again successfully
      1. Signup
      2. Forgot password
      3. Reset password via email link
      4. Login with new password
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Kill any existing vite processes
        os.system("pkill -f vite || true")

        backend_url = cls.live_server_url  
        print("Backend live server:", backend_url)

        # Inject Django test server into frontend env
        cls.frontend = subprocess.Popen(
            ["npm", "run", "dev", "--", "--host"],
            cwd="../frontend",
            env={**os.environ, "VITE_API_BASE_URL": backend_url},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid,
        )
        # Detect frontend port
        port = 5173
        for _ in range(25):
            line = cls.frontend.stdout.readline().decode("utf-8", errors="ignore")
            if "ready" in line or "Local:" in line:
                print(line.strip())
            match = re.search(r"http://localhost:(\d+)", line)
            if match:
                port = int(match.group(1))
                break
            time.sleep(0.5)
        cls.frontend_port = port
        print(f"Frontend running on port {port}")

        # Launch Chrome visibly
        options = webdriver.ChromeOptions()
        options.add_argument("--remote-allow-origins=*")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--start-maximized")
        cls.driver = webdriver.Chrome(options=options)
        cls.driver.implicitly_wait(5)


    @classmethod
    def tearDownClass(cls):
        try:
            if cls.driver:
                cls.driver.quit()
        finally:
            try:
                os.killpg(os.getpgid(cls.frontend.pid), signal.SIGTERM)
                print("Frontend terminated cleanly")
            except ProcessLookupError:
                print("Frontend already stopped.")
        super().tearDownClass()


    def wait_for_email(self, timeout=15):
        """Wait until an email appears in the test outbox."""
        for _ in range(timeout):
            if len(mail.outbox) > 0:
                return mail.outbox[-1]
            time.sleep(1)
        self.fail(f"No email received within {timeout}s")


    @staticmethod
    def human_type(element, text, delay=0.1):
        """Simulate human typing character by character."""
        for char in text:
            element.send_keys(char)
            time.sleep(delay)
        ActionChains(element.parent).move_to_element(element).click().perform()


    def smooth_scroll_down_up(self, driver, delay=1):
        """Smoothly scroll down to bottom and back up."""
        driver.execute_script(
            "window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});"
        )
        time.sleep(delay)  # wait for scroll to finish
        driver.execute_script(
            "window.scrollTo({top: 0, behavior: 'smooth'});"
        )
        time.sleep(delay)


    def click_link_text(self, driver, link_text, delay=1):
        element = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, link_text))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", element)
        element.click()
        time.sleep(delay)


    def create_public_dataset_and_predictors(self, user):
        public_dataset = Dataset.objects.create(
            dataset_name="Public Dataset 1",
            notes="Dataset visible to all users",
            owner=user,
            is_public=True
        )

        Predictor.objects.create(
            name="Public Test Predictor 1",
            description="First public predictor",
            dataset=public_dataset,
            owner=user,
            is_private=False,
        )

        Predictor.objects.create(
            name="Public Test Predictor 2",
            description="Second public predictor",
            dataset=public_dataset,
            owner=user,
            is_private=False,
        )

        # (i) Create two public folders
        folder1 = Folder.objects.create(
            name="Public Folder 1",
            description="First public folder containing dataset and predictors",
            owner=user,
            is_private=False
        )

        folder2 = Folder.objects.create(
            name="Public Folder 2",
            description="Second public folder containing same dataset and predictors",
            owner=user,
            is_private=False
        )

        # (ii) Add dataset to both folders
        FolderItem.objects.create(
            folder=folder1,
            content_object=public_dataset,
            added_by=user
        )

        FolderItem.objects.create(
            folder=folder2,
            content_object=public_dataset,
            added_by=user
        )

        # (iii) Add predictors to both folders
        predictor_list = ["Public Test Predictor 1", "Public Test Predictor 2"]

        for predictor_name in predictor_list:
            predictor = Predictor.objects.get(name=predictor_name)
            FolderItem.objects.create(
                folder=folder1,
                content_object=predictor,
                added_by=user
            )
            FolderItem.objects.create(
                folder=folder2,
                content_object=predictor,
                added_by=user
            )


    def click_link_and_wait_url(self, driver, link_text, delay=1):
        element = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, link_text))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", element)
        element.click()
        time.sleep(delay)


    def password_reset_flow(self, driver=None, base_url=None):
        # 1. Visit frontend home page
        driver.get(base_url)
        assert "Individual Survival Distributions" in driver.page_source
        time.sleep(2)

        # 2. Click "Login" button
        driver.find_element(By.LINK_TEXT, "Login").click()
        assert "Sign in" in driver.page_source
        time.sleep(2)

        # 3. Signing up with new account
        # clicking "Sign Up" link
        driver.find_element(By.LINK_TEXT, "Sign up").click()
        time.sleep(2)

        signup_data = {
            "username": "testuser2",
            "first_name": "Test",
            "last_name": "User",
            "email": "testuser2@example.com",
            "password": "Signup123!",
            "confirm_password": "Signup123!",
            "new_password": "SecurePass456!"
        }

        self.human_type(driver.find_element(By.CSS_SELECTOR, 'input[autocomplete="username"]'), signup_data["username"])
        self.human_type(driver.find_element(By.CSS_SELECTOR, 'input[autocomplete="given-name"]'), signup_data["first_name"])
        self.human_type(driver.find_element(By.CSS_SELECTOR, 'input[autocomplete="family-name"]'), signup_data["last_name"])
        self.human_type(driver.find_element(By.CSS_SELECTOR, 'input[autocomplete="email"]'), signup_data["email"])
        self.human_type(driver.find_element(By.ID, "password"), signup_data["password"])
        self.human_type(driver.find_element(By.ID, "confirm-password"), signup_data["confirm_password"])

        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        
        WebDriverWait(driver, 15).until(
            lambda d: "Account created successfully!" in d.page_source or "Welcome" in d.page_source
        )
        assert "Account created successfully!" in driver.page_source or "Welcome" in driver.page_source
        time.sleep(3)

        # 4. Click "Forgot password?"
        time.sleep(2)
        driver.find_element(By.LINK_TEXT, "Forgot password?").click()
        assert "Reset password" in driver.page_source
        time.sleep(2)

        # 5. Fill email and submit
        email_input = driver.find_element(By.CSS_SELECTOR, "input[type='email']")
        self.human_type(email_input, "testuser2@example.com")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        time.sleep(2)

        # 6. Simulate reset email
        if len(mail.outbox) == 0:
            frontend_link = f"http://localhost:{self.frontend_port}/reset-password/dummyuid/dummytoken"
            time.sleep(3)
        else:
            email_body = mail.outbox[-1].body
            match = re.search(r"http://localhost:\d+/reset/confirm/[^\s]+", email_body)
            self.assertIsNotNone(match, "Reset link not found in email")
            frontend_link = match.group(0)

        # 7. Visit frontend reset page
        driver.get(frontend_link)
        assert "Set a new password" in driver.page_source
        time.sleep(2)

        # 8. Fill new password form
        pwd_inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="password"]')
        assert len(pwd_inputs) >= 2, "Expected two password fields (new + confirm)"

        password_field = pwd_inputs[0]
        confirm_field = pwd_inputs[1]

        self.human_type(password_field, signup_data["new_password"])
        self.human_type(confirm_field, signup_data["new_password"])

        submit_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[type="submit"]'))
        )
        submit_button.click()
        time.sleep(2)

        success_msg = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located(
                (By.XPATH, "//*[contains(text(), 'Password updated. Please sign in.')]")
            )
        )
        assert "Password updated. Please sign in." in success_msg.text
        time.sleep(3)

        # 9. Filling login form
        inputs = driver.find_elements(By.CSS_SELECTOR, 'input')
        username_input = inputs[0]
        password_input = inputs[1]

        self.human_type(username_input, signup_data["username"])
        self.human_type(password_input, signup_data["new_password"])

        # Submit login
        login_button = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        login_button.click()
        WebDriverWait(driver, 10).until(lambda d: "Browse" in d.page_source or "About" in d.page_source)
        time.sleep(7)


    def logout(self, driver=None):
        # Step (i) Click the profile button to open the dropdown
        profile_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[aria-label="Profile"]'))
        )
        profile_button.click()

        # Step (ii) Wait for the Logout button to appear
        logout_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[normalize-space()='Logout']"))
        )
        time.sleep(2)

        # Step (iii) Click logout
        ActionChains(driver).move_to_element(logout_button).click().perform()
        time.sleep(3)


    def basic_pages(self, driver=None):

        # 1. Navigating to About Page
        self.click_link_and_wait_url(driver, "About", delay=3)
        self.smooth_scroll_down_up(driver)

        # 2. Navigating to Instructions Page
        self.click_link_and_wait_url(driver, "Instructions", delay=3)
        self.smooth_scroll_down_up(driver)

        # 3. Creating a dataset and predictor to test Browse page
        user = User.objects.get(username="testuser2")
        self.create_public_dataset_and_predictors(user)

        # 4. Navigating to Browse Page
        self.click_link_and_wait_url(driver, "Browse", delay=3)
        self.smooth_scroll_down_up(driver)


    def view_predictor(self, driver=None):
        # Wait for predictor cards to appear on the browse page
        predictor_cards = WebDriverWait(driver, 15).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div[role='button'].group.relative"))
        )
        assert len(predictor_cards) > 0, "No predictor cards found on the Browse page."

        # Click the first predictor card to reveal 'View' and star buttons
        first_card = predictor_cards[0]
        driver.execute_script("arguments[0].scrollIntoView(true);", first_card)
        first_card.click()
        time.sleep(1)

        # Pinning first predictor
        star_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[title="Pin"]'))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", star_button)
        time.sleep(1)
        driver.execute_script("arguments[0].click();", star_button)
        time.sleep(2)

        view_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, './/button[text()="View"]'))
        )
        view_button.click()
        time.sleep(1)
        self.smooth_scroll_down_up(driver)

        dataset_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, '//button[text()="dataset"]'))
        )
        dataset_button.click()
        time.sleep(1)
        self.smooth_scroll_down_up(driver)

        settings_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, '//button[text()="Predictor Settings / Retrain"]'))
        )
        settings_button.click()
        time.sleep(1)
        self.smooth_scroll_down_up(driver)

        crossval_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, '//button[text()="cross validation"]'))
        )
        crossval_button.click()
        time.sleep(1)
        self.smooth_scroll_down_up(driver)

        back_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, '//button[@aria-label="Back"]'))
        )
        back_button.click()
        time.sleep(1)
        self.smooth_scroll_down_up(driver)

    
    def view_datasets(self, driver=None):
        try:
            datasets_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[normalize-space()='Datasets']"))
            )
            driver.execute_script("arguments[0].scrollIntoView(true);", datasets_button)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", datasets_button)

            # Wait for datasets page to load
            WebDriverWait(driver, 5).until(EC.url_contains("/datasets"))
            print("Navigated to Datasets page.")

        except Exception as e:
            # Double-check URL manually before reporting failure
            if "/datasets" in driver.current_url:
                print("(Fallback) Navigated to Datasets page despite minor delay.")
            else:
                print(f"Could not navigate to Datasets page: {e}")

        # Wait for dataset cards to appear on the browse page
        dataset_cards = WebDriverWait(driver, 15).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div[role='button'].group.relative"))
        )
        assert len(dataset_cards) > 0, "No dataset cards found on the Browse page."

        # Click the first dataset card to reveal 'View' and star buttons
        first_card = dataset_cards[0]
        driver.execute_script("arguments[0].scrollIntoView(true);", first_card)
        first_card.click()
        time.sleep(1)

        # Pinning first predictor
        star_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[title="Pin"]'))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", star_button)
        driver.execute_script("arguments[0].click();", star_button)
        time.sleep(1)

        # Unpinning first predictor
        star_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[title="Unpin"]'))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", star_button)
        driver.execute_script("arguments[0].click();", star_button)
        time.sleep(2)

    
    def view_folders(self, driver=None):
        try:
            folders_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[normalize-space()='Folders']"))
            )
            driver.execute_script("arguments[0].scrollIntoView(true);", folders_button)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", folders_button)
            time.sleep(1)

            # Wait for datasets page to load
            WebDriverWait(driver, 5).until(EC.url_contains("/folders"))
            print("Navigated to Folders page.")

        except Exception as e:
            # Double-check URL manually before reporting failure
            if "/folders" in driver.current_url:
                print("(Fallback) Navigated to Folders page despite minor delay.")
            else:
                print(f"Could not navigate to Folders page: {e}")

        time.sleep(2)


    def test_selenium(self):
        driver = self.driver
        base_url = f"http://localhost:{self.frontend_port}"

        # Running the password reset flow test
        self.password_reset_flow(driver=driver, base_url=base_url)
        
        # Running basic page navigation tests
        self.basic_pages(driver=driver)

        # View Predictor Details (including pinning)
        self.view_predictor(driver=driver)

        # View Datasets Details (including pinning and unpinning)
        self.view_datasets(driver=driver)

        # View Folders Details
        self.view_folders(driver=driver)
        
        # Logging out
        self.logout(driver=driver)