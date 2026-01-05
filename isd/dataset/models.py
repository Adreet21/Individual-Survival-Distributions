from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# ----------------------------
# Dataset Model
# ----------------------------
class Dataset(models.Model):
    """Dataset model for storing dataset information."""
    
    TIME_UNIT_CHOICES = [
        ('year', 'Year'),
        ('month', 'Month'),
        ('day', 'Day'),
        ('hour', 'Hour'),
    ]
    
    dataset_id = models.AutoField(primary_key=True)
    dataset_name = models.CharField(max_length=200)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_datasets')
    allow_admin_access = models.BooleanField(default=True, help_text="Allow admins to access this dataset")
    
    # File-related fields
    file_path = models.CharField(max_length=500, null=True, blank=True, help_text="Relative path to uploaded file")
    original_filename = models.CharField(max_length=255, null=True, blank=True, help_text="Original filename as uploaded by user")
    file_size = models.BigIntegerField(null=True, blank=True, help_text="File size in bytes")
    
    # Metadata fields
    notes = models.TextField(blank=True, default='', help_text="Optional notes about the dataset")
    time_unit = models.CharField(
        max_length=10,
        choices=TIME_UNIT_CHOICES,
        default='month',
        help_text="Time unit for survival analysis"
    )
    is_public = models.BooleanField(default=False, help_text="Whether the dataset is publicly visible")
    allow_admin_access = models.BooleanField(default=False, help_text="Allow administrators to access this dataset")
    uploaded_at = models.DateTimeField(auto_now_add=True, help_text="Timestamp when dataset was created")
    
    class Meta:
        indexes = [
            models.Index(fields=['is_public']),
            models.Index(fields=['owner', 'uploaded_at']),
        ]
        ordering = ['-uploaded_at']  # Default ordering: most recent first
    
    def __str__(self):
        return f"{self.dataset_name} ({self.owner.username})"
    
    def get_file_display_name(self):
        """Return the original filename for display purposes."""
        return self.original_filename or "No file uploaded"
    
    def has_file(self):
        """Check if dataset has an associated file."""
        return bool(self.file_path and self.original_filename)
    
    def get_file_size_display(self):
        """Return human-readable file size."""
        if not self.file_size:
            return "Unknown size"
        
        # Convert bytes to human readable format
        file_size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if file_size < 1024.0:
                return f"{file_size:.1f} {unit}"
            file_size /= 1024.0
        return f"{file_size:.1f} TB"
    
    def delete(self, *args, **kwargs):
        """Override delete to clean up associated files."""
        # Import here to avoid circular imports
        from .file_utils import FileStorageManager
        
        # Log the deletion attempt
        logger.info(f"Deleting dataset {self.dataset_id}: {self.dataset_name}")
        
        # Delete associated file before deleting the model instance
        if self.file_path:
            logger.info(f"Attempting to delete file: {self.file_path}")
            storage_manager = FileStorageManager()
            try:
                success = storage_manager.delete_file(self.file_path)
                if not success:
                    logger.warning(f"Failed to delete file {self.file_path} for dataset {self.dataset_id}")
                else:
                    logger.info(f"Successfully deleted file {self.file_path} for dataset {self.dataset_id}")
            except Exception as e:
                logger.error(f"Error deleting file {self.file_path} for dataset {self.dataset_id}: {str(e)}")
                # Continue with model deletion even if file deletion fails
        else:
            logger.info(f"No file path associated with dataset {self.dataset_id}")
        
        # Call the parent delete method
        super().delete(*args, **kwargs)
    
    @classmethod
    def bulk_delete_with_files(cls, queryset):
        """
        Bulk delete datasets with proper file cleanup.
        
        This method calls the individual model's delete() method for each instance
        to ensure proper file cleanup.
        
        Args:
            queryset: QuerySet of Dataset objects to delete
            
        Returns:
            tuple: (deleted_count, file_cleanup_errors)
        """
        file_cleanup_errors = []
        deleted_count = 0
        
        # Delete each instance individually to ensure the model's delete() method is called
        for dataset in queryset:
            try:
                dataset.delete()
                deleted_count += 1
            except Exception as e:
                error_msg = f"Error deleting dataset {dataset.dataset_id}: {str(e)}"
                file_cleanup_errors.append(error_msg)
                logger.error(error_msg)
        
        return deleted_count, file_cleanup_errors


class DatasetStatistics(models.Model):
    """Cached analytics for a dataset so we do not recompute on every request."""

    dataset = models.OneToOneField(
        Dataset,
        on_delete=models.CASCADE,
        related_name="statistics"
    )
    computed_at = models.DateTimeField(auto_now=True)
    general_stats = models.JSONField(default=dict, blank=True)
    feature_correlations = models.JSONField(default=list, blank=True)
    event_time_histogram = models.JSONField(default=list, blank=True)
    schema_version = models.CharField(max_length=20, default="v1")

    class Meta:
        verbose_name = "Dataset Statistics"
        verbose_name_plural = "Dataset Statistics"

    def __str__(self):
        return f"Statistics for dataset {self.dataset.dataset_id}"


# ----------------------------
# PinnedDataset Model
# ----------------------------
class PinnedDataset(models.Model):
    """Model for users to pin datasets for quick access."""
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='pinned_datasets')
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name='pinned_by')
    pinned_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'dataset_pinneddataset'
        unique_together = ('user', 'dataset')
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['dataset']),
        ]
        verbose_name = "Pinned Dataset"
        verbose_name_plural = "Pinned Datasets"
        ordering = ['-pinned_at']   # order by most recent
    
    def __str__(self):
        return f"{self.user.username} pinned {self.dataset.dataset_name}"

class DatasetPermission(models.Model):
    """Permission model for dataset access control."""
    
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name='permissions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='dataset_permissions')
    
    class Meta:
        unique_together = ('dataset', 'user')
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['dataset']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.dataset.dataset_name}"
