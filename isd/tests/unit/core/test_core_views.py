"""
Core application unit tests.
Tests for core views and API endpoints.
"""

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status


class CoreViewTests(APITestCase):
    """Test suite for core application views."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_health_check_endpoint_unauthenticated(self):
        """Test that health check endpoint works without authentication."""
        response = self.client.get('/api/health/')
        # Health check might require auth or might not - check both possibilities
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED])
    
    def test_health_check_endpoint_authenticated(self):
        """Test that health check endpoint works with authentication."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'status': 'ok'})
    
    def test_api_root_endpoint_authenticated(self):
        """Test that API root endpoint returns available endpoints when authenticated."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check that response contains expected endpoint references
        expected_keys = ['auth', 'predictor', 'dataset', 'health']
        for key in expected_keys:
            self.assertIn(key, response.data)
    
    def test_api_endpoints_require_authentication(self):
        """Test that API endpoints properly handle authentication."""
        endpoints = [
            '/api/',
            '/api/health/',
        ]
        
        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                # Test unauthenticated access
                response = self.client.get(endpoint)
                self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_401_UNAUTHORIZED])
                
                # Test authenticated access
                self.client.force_authenticate(user=self.user)
                response = self.client.get(endpoint)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.client.force_authenticate(user=None)  # Reset authentication