"""
Authentication and authorization unit tests.
Tests for user registration, login, logout, token refresh, and password reset.
"""

import uuid
from django.core import mail
from django.urls import reverse
from rest_framework import status
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.tokens import default_token_generator


def unique_user(username_base="user"):
    """Helper function to create unique users for testing."""
    username = f"{username_base}_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"
    return User.objects.create_user(username=username, email=email, password="StrongPassword123!")


class AuthenticationTests(APITestCase):
    """Test suite for authentication functionality."""
    
    def setUp(self):
        self.register_url = reverse('register')
        self.login_url = reverse('token_obtain_pair')
        self.logout_url = '/api/auth/logout/'
        self.refresh_url = reverse('token_refresh')
        # User testing
        self.forgot_password_url = reverse('user_forgot_password_api')
        self.reset_password_url_name = 'user_reset_password_api'
        # Admin testing
        self.forgot_url = reverse('forgot_password_api')

    def test_register_user(self):
        """Ensure a new user can register successfully."""
        username = f"testuser_{uuid.uuid4().hex[:6]}"
        email = f"{username}@example.com"
        user_data = {
            "username": username,
            "email": email,
            "password": "StrongPassword123!",
            "password2": "StrongPassword123!"
        }
        response = self.client.post(self.register_url, user_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username=username).exists())

    def test_login_user(self):
        """Ensure a registered user can log in and receive tokens"""
        user = unique_user()
        response = self.client.post(self.login_url, {
            "username": user.username,
            "password": "StrongPassword123!"
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_logout_user(self):
        """Ensure a user can log out and blacklist refresh token"""
        user = unique_user()
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

        response = self.client.post(self.logout_url, {"refresh": str(refresh)}, format='json')
        self.assertIn(response.status_code, [status.HTTP_205_RESET_CONTENT, status.HTTP_200_OK])

    def test_refresh_token(self):
        """Ensure refresh token can be used to get new access token"""
        user = unique_user()
        refresh = RefreshToken.for_user(user)

        response = self.client.post(self.refresh_url, {"refresh": str(refresh)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)


class PasswordResetTests(APITestCase):
    """Test suite for password reset functionality."""
    
    def setUp(self):
        self.forgot_password_url = reverse('user_forgot_password_api')
        self.reset_password_url_name = 'user_reset_password_api'
        self.forgot_url = reverse('forgot_password_api')
       
    def test_forgot_password_sends_email(self):
        """Ensure forgot password sends reset email"""
        user = unique_user()
        response = self.client.post(self.forgot_password_url, {"email": user.email}, format='json')

        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_202_ACCEPTED])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("reset", mail.outbox[0].body.lower())

    def test_reset_password_success(self):
        """Ensure password can be reset with valid token and new password"""
        user = unique_user()
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = reverse(self.reset_password_url_name, kwargs={'uidb64': uid, 'token': token})

        new_password_data = {
            "password": "NewPass123!",
            "password2": "NewPass123!"
        }

        response = self.client.post(reset_url, new_password_data, format='json')
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPass123!"))

    def test_password_reset_email_sent(self):
        """POST valid email 200 OK"""
        user = unique_user()
        response = self.client.post(self.forgot_url, {"email": user.email}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_password_reset_invalid_email(self):
        """POST invalid email still 200 OK"""
        response = self.client.post(self.forgot_url, {"email": "noone@example.com"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_password_reset_confirm(self):
        """POST valid uid + password 200 OK"""
        user = unique_user()
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = reverse('reset_password', kwargs={'uidb64': uidb64, 'token': token})

        response = self.client.post(reset_url, {"password": "newsecurepassword"}, format='json')

        # API should return 200 if success
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password("newsecurepassword"))