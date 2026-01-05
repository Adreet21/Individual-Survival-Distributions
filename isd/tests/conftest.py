"""
Global test configuration and fixtures.
"""

import pytest
import tempfile
import shutil
import os
from django.core.files.storage import default_storage
from django.contrib.auth.models import User


@pytest.fixture(autouse=True)
def use_in_memory_email_backend(settings):
    """Use in-memory email backend for all tests."""
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'


@pytest.fixture
def temp_media_root(settings):
    """Create a temporary media root for file upload tests."""
    temp_dir = tempfile.mkdtemp()
    settings.MEDIA_ROOT = temp_dir
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123'
    )


@pytest.fixture
def admin_user(db):
    """Create an admin user."""
    return User.objects.create_superuser(
        username='admin',
        email='admin@example.com',
        password='adminpass123'
    )


@pytest.fixture(autouse=True)
def cleanup_uploaded_files():
    """Clean up any uploaded files after each test."""
    yield
    # Clean up any test files that might have been created
    try:
        if hasattr(default_storage, 'location'):
            test_files_path = default_storage.location + '/datasets/'
            if os.path.exists(test_files_path):
                shutil.rmtree(test_files_path, ignore_errors=True)
    except:
        pass  # Ignore cleanup errors
