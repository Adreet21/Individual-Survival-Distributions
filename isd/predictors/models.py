from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
from dataset.models import Dataset
from folders.models import Folder
from django.utils import timezone


# ----------------------------
# Predictor Model
# ----------------------------
class Predictor(models.Model):
    """Predictor model for machine learning predictors."""

    predictor_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="predictors")
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name="predictors")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="owned_predictors")
    is_private = models.BooleanField(default=False)  # False = public, True = private
    # The model_id from the ML server
    model_id = models.CharField(
        unique=True,     # if each ML model is used by only one predictor
        null=True,       # predictor might exist before training completes
        blank=True,
        help_text="Unique identifier for the trained model from the ML server."
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Predictor"
        verbose_name_plural = "Predictors"

    # --- ML Model Configuration ---
    # Model & Experiment Settings
    model = models.CharField(
        max_length=50,
        choices=[
            ('MTLR', 'MTLR'),
            ('DeepHit', 'DeepHit'),
            ('CoxPH', 'CoxPH'),
            ('AFT', 'AFT'),
            ('GB', 'GB'),
            ('CoxTime', 'CoxTime'),
            ('CQRNN', 'CQRNN'),
            ('LogNormalNN', 'LogNormalNN'),
            ('KM', 'KM'),
        ],
        default='MTLR',
        help_text='Survival analysis model type'
    )
    post_process = models.CharField(
        max_length=20,
        choices=[('CSD', 'CSD'), ('CSD-iPOT', 'CSD-iPOT')],
        default='CSD',
        help_text='Post-processing method for predictions'
    )
    n_exp = models.PositiveIntegerField(default=1, help_text='Number of experimental runs')
    seed = models.IntegerField(default=0, help_text='Random seed for reproducibility')
    time_bins = models.PositiveIntegerField(
        null=True, 
        blank=True,
        help_text='Number of time bins (for MTLR, CoxPH, CQRNN, LogNormalNN)'
    )
    
    # Conformalization Settings
    error_f = models.CharField(
        max_length=50,
        default='Quantile',
        help_text='Error function for conformal prediction'
    )
    decensor_method = models.CharField(
        max_length=20,
        choices=[
            ('uncensored', 'Uncensored'),
            ('margin', 'Margin'),
            ('PO', 'PO'),
            ('sampling', 'Sampling'),
        ],
        default='uncensored',
        help_text='Method for handling censored data'
    )
    mono_method = models.CharField(
        max_length=20,
        choices=[
            ('ceil', 'Ceil'),
            ('floor', 'Floor'),
            ('bootstrap', 'Bootstrap'),
        ],
        default='ceil',
        help_text='Method for ensuring monotonicity'
    )
    interpolate = models.CharField(
        max_length=20,
        choices=[('Linear', 'Linear'), ('Pchip', 'Pchip')],
        default='Pchip',
        help_text='Interpolation method for predictions'
    )
    n_quantiles = models.PositiveIntegerField(default=49, help_text='Number of quantiles')
    use_train = models.BooleanField(default=True, help_text='Include training data in conformal prediction')
    n_sample = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Number of samples when using sampling decensor method'
    )
    
    # Neural Network Architecture (for applicable models)
    neurons = models.JSONField(
        default=list,
        help_text='Hidden layer sizes as array, e.g. [64, 64]'
    )
    norm = models.BooleanField(default=True, help_text='Use batch normalization')
    dropout = models.FloatField(default=0.4, help_text='Dropout rate (0-1)')
    activation = models.CharField(
        max_length=20,
        choices=[
            ('ReLU', 'ReLU'),
            ('LeakyReLU', 'LeakyReLU'),
            ('PReLU', 'PReLU'),
            ('Tanh', 'Tanh'),
            ('Sigmoid', 'Sigmoid'),
            ('ELU', 'ELU'),
            ('SELU', 'SELU'),
        ],
        default='ReLU',
        help_text='Activation function'
    )
    
    # Training Hyperparameters (for neural network models)
    n_epochs = models.PositiveIntegerField(default=10000, help_text='Maximum training iterations')
    early_stop = models.BooleanField(default=True, help_text='Enable early stopping')
    batch_size = models.PositiveIntegerField(default=128, help_text='Batch size for training')
    lr = models.FloatField(default=0.001, help_text='Learning rate')
    weight_decay = models.FloatField(default=0.0, help_text='L2 regularization strength')
    lam = models.FloatField(
        null=True,
        blank=True,
        help_text='Lambda parameter for LogNormalNN d-calibration'
    )
    
    # --- System Settings ---
    allow_admin_access = models.BooleanField(default=False)

    # --- System metadata ---
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    ml_trained_at = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="When the ML model was trained"
    )
    ml_training_status = models.CharField(
        max_length=20,
        choices=[
            ('not_trained', 'Not Trained'),
            ('training', 'Training'),
            ('trained', 'Trained'),
            ('failed', 'Failed'),
        ],
        default='not_trained'
    )
    ml_model_metrics = models.JSONField(
        null=True, 
        blank=True,
        help_text="Performance metrics from ML model training (C-index, IBS, etc.)"
    )
    ml_selected_features = models.JSONField(
        null=True,
        blank=True,
        help_text="List of features used in ML model training"
    )
    ml_training_progress = models.JSONField(
        null=True,
        blank=True,
        help_text="Training progress information (current_epoch, total_epochs, time_per_epoch, etc.)"
    )
    ml_training_error = models.TextField(
        null=True,
        blank=True,
        help_text="Error message if training failed"
    )

    def __str__(self):
        return self.name

# ----------------------------
# PinnedPredictor Model
# ----------------------------
class PinnedPredictor(models.Model):
    """Tracks which predictors a user has pinned for quick access."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,related_name="pinned_predictors")
    predictor = models.ForeignKey(Predictor, on_delete=models.CASCADE, related_name="pinned_by")
    pinned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "predictors_pinnedpredictor"
        unique_together = ("user", "predictor")  # prevent duplicate pins
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["predictor"]),
        ]
        verbose_name = "Pinned Predictor"
        verbose_name_plural = "Pinned Predictors"
        ordering = ['-pinned_at'] # order by most recent

    def __str__(self):
        return f"{self.user.username} pinned {self.predictor.name}"

# ----------------------------
# PredictorPermission Model
# ----------------------------
class PredictorPermission(models.Model):
    """Grants access permissions to predictors for specific users."""
    ROLE_CHOICES = [
        ("owner", "Owner"),
        ("viewer", "Viewer"),
    ]

    predictor = models.ForeignKey(Predictor, on_delete=models.CASCADE, related_name="permissions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="predictor_permissions")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="viewer")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("predictor", "user")
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["predictor"]),
        ]
        verbose_name = "Predictor Permission"
        verbose_name_plural = "Predictor Permissions"

    def __str__(self):
        return f"{self.user.username} - {self.predictor.name}"
