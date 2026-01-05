"""
Utility tests for environment configuration and setup.
Tests environment variable loading and configuration validation.
"""

from django.test import TestCase
from django.conf import settings
import os
from pathlib import Path


class EnvironmentConfigurationTests(TestCase):
    """Test suite for environment configuration."""
    
    def test_env_file_exists_or_settings_configured(self):
        """Test that either .env file exists or settings are configured."""
        env_path = Path(settings.BASE_DIR) / '.env'
        # Either .env exists or we have some basic settings configured
        has_env_file = env_path.exists()
        has_configured_settings = hasattr(settings, 'SECRET_KEY') and settings.SECRET_KEY
        self.assertTrue(has_env_file or has_configured_settings, 
                       "Either .env file should exist or settings should be configured")

    def test_email_configuration_present(self):
        """Test that email configuration is present in some form."""
        # Check if email settings are configured (either from .env or settings)
        has_email_config = (
            hasattr(settings, 'EMAIL_HOST') or 
            hasattr(settings, 'EMAIL_BACKEND')
        )
        self.assertTrue(has_email_config, "Some email configuration should be present")
    
    def test_database_configuration(self):
        """Test that database configuration is properly loaded."""
        db_config = settings.DATABASES['default']
        self.assertIsNotNone(db_config.get('NAME'))
        self.assertIsNotNone(db_config.get('USER'))
        self.assertIsNotNone(db_config.get('HOST'))
        self.assertIsNotNone(db_config.get('PORT'))
    
    def test_secret_key_configured(self):
        """Test that SECRET_KEY is configured."""
        self.assertIsNotNone(settings.SECRET_KEY)
        self.assertNotEqual(settings.SECRET_KEY, "")
        self.assertGreater(len(settings.SECRET_KEY), 20)  # Should be reasonably long
    
    def test_debug_setting(self):
        """Test that DEBUG setting is properly configured."""
        # In tests, DEBUG should typically be False or controlled
        self.assertIsInstance(settings.DEBUG, bool)
    
    def test_media_configuration(self):
        """Test that media file configuration is set up."""
        self.assertIsNotNone(settings.MEDIA_ROOT)
        self.assertIsNotNone(settings.MEDIA_URL)
        self.assertEqual(settings.MEDIA_URL, '/media/')
    
    def test_static_configuration(self):
        """Test that static file configuration is set up."""
        self.assertIsNotNone(settings.STATIC_URL)
        # Accept both '/static/' and 'static/' as valid
        self.assertIn(settings.STATIC_URL, ['/static/', 'static/'])