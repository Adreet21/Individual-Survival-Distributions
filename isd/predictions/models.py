from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from predictors.models import Predictor
from dataset.models import Dataset


# ----------------------------
# Prediction Model
# ----------------------------
class Prediction(models.Model):
    """Stores saved prediction results from running predictors on datasets."""
    
    prediction_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="predictions")
    predictor = models.ForeignKey(Predictor, on_delete=models.CASCADE, related_name="predictions")
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="predictions")
    name = models.CharField(max_length=200, help_text="User-provided name for this prediction")
    is_labeled = models.BooleanField(
        default=False,
        help_text="Whether this prediction was made on a labeled dataset with time and censored columns"
    )
    
    # Store the full prediction response from ML API
    prediction_data = models.JSONField(
        help_text="Complete prediction response including survival curves, statistics, etc."
    )
    
    # Extracted statistics for quick access
    c_index = models.FloatField(
        null=True,
        blank=True,
        help_text="Concordance index from prediction results"
    )
    ibs_score = models.FloatField(
        null=True,
        blank=True,
        help_text="Integrated Brier Score from prediction results"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ["-created_at"]  # Most recent first
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["predictor"]),
            models.Index(fields=["dataset"]),
            models.Index(fields=["-created_at"]),
        ]
        verbose_name = "Prediction"
        verbose_name_plural = "Predictions"
    
    def __str__(self):
        return f"{self.name} ({self.user.username})"
