"""
Celery tasks for the predictors app.

This module imports tasks from training_tasks.py to make them discoverable by Celery.
Celery's autodiscover_tasks() looks for tasks.py by default.
"""

# Import all tasks from training_tasks module
from .training_tasks import train_model_task, get_training_status

# Make tasks discoverable
__all__ = ['train_model_task', 'get_training_status']
