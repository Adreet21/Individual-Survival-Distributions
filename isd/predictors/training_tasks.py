"""
Celery tasks for async ML model training with real-time log-based progress tracking.

This module uses Celery for production-grade async task processing:
- Task persistence across server restarts
- Distributed execution
- Built-in retry mechanisms
- Progress tracking via database updates
"""

import os
import json
import logging
import requests
import time
import re
from celery import shared_task, current_task
from django.conf import settings
from .models import Predictor
from .log_parser import get_ml_api_log_path

logger = logging.getLogger(__name__)


def _parse_experiment_progress(log_path, file_position):
    """
    Parse new log entries for experiment progress.

    Returns:
        tuple: (current_experiment, total_experiments, new_file_position)
        Returns (None, None, file_position) if no progress found
    """
    try:
        with open(log_path, 'r') as f:
            # Seek to last known position
            f.seek(file_position)
            new_lines = f.read()
            new_position = f.tell()

        if not new_lines:
            return None, None, file_position

        # Look for experiment progress in new lines
        # Pattern: "Experiment:  90%|█████████ | 9/10 [00:39<00:04,  4.03s/it]"
        pattern = r'Experiment:.*?\|\s*(\d+)/(\d+)\s*\['
        matches = list(re.finditer(pattern, new_lines))

        if matches:
            # Get the last (most recent) match in new lines
            last_match = matches[-1]
            current = int(last_match.group(1))
            total = int(last_match.group(2))
            return current, total, new_position

        return None, None, new_position

    except Exception as e:
        logger.debug(f"Error parsing log progress: {e}")
        return None, None, file_position


@shared_task(bind=True, name='predictors.train_model')
def train_model_task(self, predictor_id, dataset_path, parameters):
    """
    Celery task to train an ML model with real-time progress tracking.

    This task:
    1. Sends dataset to ML API for training
    2. Monitors ML API logs for real-time progress
    3. Updates predictor model with progress information
    4. Downloads model artifacts on completion

    Args:
        predictor_id: The predictor ID to update with progress
        dataset_path: Path to the dataset file
        parameters: Training parameters dict

    Returns:
        dict: Training results including model_id and metrics
    """
    try:
        predictor = Predictor.objects.get(predictor_id=predictor_id)
        predictor.ml_training_status = 'training'
        predictor.ml_training_progress = {
            'current_experiment': 0,
            'total_experiments': parameters.get('n_exp', 10),
            'status': 'preparing',
            'message': 'Preparing dataset and initializing model...',
            'estimated_progress': 0,
            'elapsed_seconds': 0,
            'progress_source': 'initializing',
            'task_id': self.request.id  # Store Celery task ID
        }
        predictor.save()

        # Get ML API URL
        ml_api_url = os.environ.get("ML_API_URL", "http://localhost:5000")
        train_url = f"{ml_api_url}/train"

        # Prepare the payload
        data = {
            'parameters': json.dumps(parameters),
        }

        # Check if we can access ML API logs
        ml_log_path = get_ml_api_log_path()
        use_log_parsing = ml_log_path is not None

        if use_log_parsing:
            # Get current file size to track new entries
            log_file_position = os.path.getsize(ml_log_path)
            logger.info(f"Using log-based progress tracking from: {ml_log_path} (starting at position {log_file_position})")
        else:
            log_file_position = 0
            logger.info("Log file not found, using time-based estimation")

        # Start training request
        with open(dataset_path, 'rb') as f_bin:
            files = {'dataset': (os.path.basename(dataset_path), f_bin, 'text/csv')}

            # Track progress variables
            n_exp = parameters.get('n_exp', 10)
            start_time = time.time()
            current_exp = 0
            total_exp = n_exp
            last_log_exp = 0

            # Timing tracking for ETA
            first_exp_start_time = None
            first_exp_duration = None
            experiment_times = []
            estimated_seconds_per_experiment = 4.0

            # Make the request with streaming/timeout handling
            # We'll use a separate thread approach but within Celery task
            import threading
            result = {'response': None, 'error': None}

            def make_request():
                try:
                    result['response'] = requests.post(train_url, data=data, files=files, timeout=3600)
                except Exception as e:
                    result['error'] = e

            request_thread = threading.Thread(target=make_request)
            request_thread.start()

            # Monitor progress while training
            while request_thread.is_alive():
                elapsed = time.time() - start_time
                time.sleep(1)  # Update every 1 second

                # Try to get progress from logs
                if use_log_parsing:
                    log_exp, log_total, log_file_position = _parse_experiment_progress(
                        ml_log_path,
                        log_file_position
                    )

                    if log_exp is not None:
                        # New progress found in logs
                        prev_exp = current_exp
                        current_exp = log_exp
                        total_exp = log_total
                        last_log_exp = log_exp
                        progress_source = "log"

                        # Track experiment completion times for ETA
                        if prev_exp != current_exp:
                            if prev_exp == 0 and current_exp == 1:
                                first_exp_start_time = elapsed
                            elif prev_exp > 0 and current_exp > prev_exp:
                                experiment_times.append(elapsed)
                                if first_exp_duration is None and len(experiment_times) == 1:
                                    first_exp_duration = elapsed - (first_exp_start_time or 0)
                    else:
                        # No new progress in logs
                        if last_log_exp > 0:
                            current_exp = last_log_exp
                            progress_source = "log"
                        else:
                            current_exp = min(int(elapsed / estimated_seconds_per_experiment), n_exp)
                            progress_source = "estimated"
                else:
                    # No logs available, estimate based on time
                    current_exp = min(int(elapsed / estimated_seconds_per_experiment), n_exp)
                    progress_source = "estimated"

                # Calculate progress percentage
                completed = max(0, current_exp - 1) if current_exp <= total_exp else total_exp
                progress_percent = min(99, int((completed / total_exp) * 100)) if total_exp > 0 else 0

                # Calculate ETA
                eta_seconds = None
                if len(experiment_times) >= 2:
                    avg_time_per_exp = (elapsed - (first_exp_start_time or 0)) / len(experiment_times)
                    remaining_experiments = total_exp - current_exp
                    eta_seconds = int(avg_time_per_exp * remaining_experiments)
                elif first_exp_duration is not None and current_exp > 0:
                    remaining_experiments = total_exp - current_exp
                    eta_seconds = int(first_exp_duration * remaining_experiments)

                # Update predictor progress
                predictor.refresh_from_db()
                progress_data = {
                    'current_experiment': current_exp,
                    'total_experiments': total_exp,
                    'status': 'training',
                    'message': f'Training model (fold {current_exp}/{total_exp})...',
                    'estimated_progress': progress_percent,
                    'elapsed_seconds': int(elapsed),
                    'progress_source': progress_source,
                    'task_id': self.request.id
                }

                if eta_seconds is not None:
                    progress_data['eta_seconds'] = eta_seconds

                predictor.ml_training_progress = progress_data
                predictor.save()

                # Update Celery task state (for Celery's built-in progress tracking)
                self.update_state(
                    state='PROGRESS',
                    meta={
                        'current': completed,
                        'total': total_exp,
                        'percent': progress_percent,
                        'eta_seconds': eta_seconds
                    }
                )

            request_thread.join()

        # Check training result
        if result['error']:
            raise result['error']

        ml_response = result['response']

        if ml_response.ok:
            ml_data = ml_response.json()

            # Download model artifacts
            model_id = ml_data.get('model_id')
            if model_id:
                try:
                    from dataset.views import _download_model_artifacts
                    _download_model_artifacts(ml_data, model_id)
                except Exception as download_error:
                    logger.error(f"Failed to download model artifacts for {model_id}: {str(download_error)}")

            # Update predictor with success
            predictor.refresh_from_db()
            predictor.ml_training_status = 'trained'
            predictor.model_id = model_id
            predictor.ml_trained_at = ml_data.get('trained_at')
            predictor.ml_model_metrics = ml_data.get('metrics', {})
            predictor.ml_selected_features = ml_data.get('selected_features')
            predictor.ml_training_progress = {
                'current_experiment': n_exp,
                'total_experiments': n_exp,
                'status': 'completed',
                'message': 'Training completed successfully!',
                'estimated_progress': 100,
                'elapsed_seconds': int(time.time() - start_time),
                'progress_source': 'completed',
                'task_id': self.request.id
            }
            predictor.ml_training_error = None
            predictor.save()

            logger.info(f"Training completed successfully for predictor {predictor_id}")

            return {
                'status': 'success',
                'predictor_id': predictor_id,
                'model_id': model_id,
                'metrics': ml_data.get('metrics', {}),
                'trained_at': ml_data.get('trained_at')
            }
        else:
            raise Exception(f"ML API training failed: {ml_response.text}")

    except Exception as e:
        logger.error(f"Training failed for predictor {predictor_id}: {str(e)}")
        try:
            predictor.refresh_from_db()
            predictor.ml_training_status = 'failed'
            predictor.ml_training_error = str(e)
            predictor.ml_training_progress = {
                'status': 'failed',
                'message': f'Training failed: {str(e)}',
                'task_id': self.request.id
            }
            predictor.save()
        except Exception as update_error:
            logger.error(f"Failed to update predictor status: {str(update_error)}")

        # Re-raise exception so Celery marks task as failed
        raise


def get_training_status(predictor_id):
    """
    Get the current training status for a predictor.

    Returns:
        dict: Status information including progress
    """
    try:
        predictor = Predictor.objects.get(predictor_id=predictor_id)
        return {
            'status': predictor.ml_training_status,
            'progress': predictor.ml_training_progress,
            'error': predictor.ml_training_error,
            'model_id': predictor.model_id,
            'metrics': predictor.ml_model_metrics,
        }
    except Predictor.DoesNotExist:
        return {
            'status': 'not_found',
            'error': f'Predictor {predictor_id} not found'
        }
