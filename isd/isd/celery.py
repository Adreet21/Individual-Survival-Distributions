"""
Celery configuration for ISD project.

This module sets up Celery for asynchronous task processing, including:
- ML model training with progress tracking
- Background jobs and scheduled tasks

Broker: Redis (default: redis://localhost:6379/0)
Result Backend: Django database (django-celery-results)
"""

import os
from celery import Celery

# Set default Django settings module for Celery
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'isd.settings')

# Create Celery app
app = Celery('isd')

# Load configuration from Django settings with CELERY_ prefix
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all installed apps
from django.conf import settings
app.autodiscover_tasks(lambda: settings.INSTALLED_APPS)


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task to test Celery is working"""
    print(f'Request: {self.request!r}')
