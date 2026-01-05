"""
User account management unit tests.
Tests for user profile operations and password change functionality.
"""

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from rest_framework_simplejwt.tokens import AccessToken


class UserProfileTests(APITestCase):
    """
    Tests for user profile operations (/me/) and password change (/change-password/).
    """
    def setUp(self):
        # Create test user
        self.user = User.objects.create_user(
            username="john",
            email="john@example.com",
            password="OldPass123!"
        )

        # Authenticate via JWT
        token = AccessToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Endpoint URLs
        self.me_url = reverse("user-me")  # /api/accounts/users/me/
        self.change_password_url = reverse("user-change-password")  # /api/accounts/users/change-password/

    # -------------------------------
    # /me/ Endpoint Tests
    # -------------------------------

    def test_get_profile(self):
        """Authenticated user can view their own profile."""
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "john")
        self.assertEqual(response.data["email"], "john@example.com")

    def test_update_profile(self):
        """Authenticated user can update first and last name."""
        data = {"first_name": "John", "last_name": "Doe"}
        response = self.client.patch(self.me_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "John")
        self.assertEqual(self.user.last_name, "Doe")

    def test_unauthenticated_cannot_access_me(self):
        """Unauthenticated users cannot access /me/."""
        self.client.credentials()  # Remove JWT
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordChangeTests(APITestCase):
    """Tests for password change functionality."""
    
    def setUp(self):
        # Create test user
        self.user = User.objects.create_user(
            username="john",
            email="john@example.com",
            password="OldPass123!"
        )

        # Authenticate via JWT
        token = AccessToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Endpoint URLs
        self.change_password_url = reverse("user-change-password")  # /api/accounts/users/change-password/

    def test_change_password_success(self):
        """User can change password with correct old password."""
        data = {
            "old_password": "OldPass123!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "NewStrongPass123!"
        }
        response = self.client.post(self.change_password_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("Password changed successfully", response.data["detail"])

        # Verify password actually changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStrongPass123!"))

    def test_change_password_incorrect_old(self):
        """Should fail if old password is incorrect."""
        data = {
            "old_password": "WrongPass!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "NewStrongPass123!"
        }
        response = self.client.post(self.change_password_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("old_password", response.data)

    def test_change_password_mismatch(self):
        """Should fail if new and confirm passwords don't match."""
        data = {
            "old_password": "OldPass123!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "DifferentPass123!"
        }
        response = self.client.post(self.change_password_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)

    def test_unauthenticated_cannot_change_password(self):
        """Unauthenticated users cannot change password."""
        self.client.credentials()
        data = {
            "old_password": "OldPass123!",
            "new_password": "NewStrongPass123!",
            "confirm_password": "NewStrongPass123!"
        }
        response = self.client.post(self.change_password_url, data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)