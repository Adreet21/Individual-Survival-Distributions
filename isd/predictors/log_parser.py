"""
Parse ML API logs for real-time training progress.
This provides accurate progress instead of time-based estimates.
"""
import re
import os
from typing import Optional, Dict


def parse_ml_api_logs_for_progress(log_file_path: str) -> Optional[Dict[str, int]]:
    """
    Parse the ML API log file to extract current training progress.

    Looks for trange output like:
    "Experiment:  30%|███       | 3/10 [00:15<00:35,  5.07s/it]"

    Returns:
        Dict with 'current_experiment' and 'total_experiments', or None if not found
    """
    if not os.path.exists(log_file_path):
        return None

    try:
        # Read the last 100 lines of the log file for recent progress
        with open(log_file_path, 'r') as f:
            # Seek to end and read backwards efficiently
            f.seek(0, 2)  # Go to end
            file_size = f.tell()

            # Read last ~10KB (should contain recent progress)
            read_size = min(10240, file_size)
            f.seek(max(0, file_size - read_size))
            recent_logs = f.read()

        # Parse tqdm/trange progress bar format
        # Pattern: "Experiment:  30%|███       | 3/10 [00:15<00:35,  5.07s/it]"
        # or simpler: "3/10"
        patterns = [
            r'Experiment:.*?\|\s*(\d+)/(\d+)\s*\[',  # Full tqdm format
            r'(\d+)/(\d+)\s*\[.*?it\]',              # Partial format
            r'Experiment.*?(\d+)/(\d+)',              # Minimal format
        ]

        current = None
        total = None

        for pattern in patterns:
            matches = list(re.finditer(pattern, recent_logs))
            if matches:
                # Get the last match (most recent progress)
                last_match = matches[-1]
                current = int(last_match.group(1))
                total = int(last_match.group(2))
                break

        if current is not None and total is not None:
            return {
                'current_experiment': current,
                'total_experiments': total,
                'completed_experiments': current  # Experiments completed so far
            }

        return None

    except Exception as e:
        # Log parsing failed, return None to fall back to estimation
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"Failed to parse ML API logs: {str(e)}")
        return None


def get_ml_api_log_path() -> Optional[str]:
    """
    Get the path to the ML API log file.
    Checks common locations based on project structure.

    Returns:
        Path to log file, or None if not found
    """
    # Primary path: unified logs folder (after merged PR)
    primary_path = '/home/ubuntu/f25project-DeptofComputingScience/.logs/ml_api.log'

    if os.path.exists(primary_path):
        return primary_path

    # Fallback paths for other setups
    possible_paths = [
        '/home/ubuntu/f25project-DeptofComputingScience/.logs/mlapi.log',
        '/home/ubuntu/f25project-DeptofComputingScience/.logs/app.log',
        '/home/ubuntu/MakeSurvivalCalibratedAgain-MTLR-API/logs/app.log',
        '/home/ubuntu/MakeSurvivalCalibratedAgain-MTLR-API/.logs/app.log',
    ]

    for path in possible_paths:
        if os.path.exists(path):
            return path

    return None
