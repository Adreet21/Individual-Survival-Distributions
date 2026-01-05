"""
URL configuration for predictors app (including ML API integration)
Place this in: predictors/urls.py
"""
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    PredictorViewSet,
    PredictorPermissionViewSet,
    PinnedPredictorViewSet,
    list_public_predictors,
    resolve_username,
    predictor_cv_predictions,
    predictor_full_predictions,
    # ML API views
    ml_health_check,
    ml_retrain_model,
    ml_retrain_model_async,
    ml_predict,
    ml_list_models,
    # Predictor-specific ML views
    train_predictor_model,
    predict_with_predictor,
    ml_predict,
    get_training_status,
    # Predictor comparison views
    get_comparable_predictors,
    compare_predictors_cv_stats,
)

router = DefaultRouter()
router.register("permissions", PredictorPermissionViewSet, basename="predictor-permission")
router.register("pins", PinnedPredictorViewSet, basename="pinned-predictor")
router.register("", PredictorViewSet, basename="predictors")

urlpatterns = [
    # Existing predictor views
    path("public/", list_public_predictors, name="public-predictors"),
    path("resolve-username/", resolve_username, name="resolve-username"),
    path("<int:predictor_id>/cv-predictions/", predictor_cv_predictions, name="predictor-cv-predictions"),
    path("<int:predictor_id>/full-predictions/", predictor_full_predictions, name="predictor-full-predictions"),
    path("<int:predictor_id>/training-status/", get_training_status, name="predictor-training-status"),

    # Predictor comparison routes
    path("<int:predictor_id>/comparable-predictors/", get_comparable_predictors, name="comparable-predictors"),
    path("compare-cv-stats/", compare_predictors_cv_stats, name="compare-cv-stats"),

    # ===================================
    # NEW: ML API Integration Routes
    # ===================================
    path("ml/health/", ml_health_check, name="ml-health"),
    path("ml/retrain/", ml_retrain_model, name="ml-retrain"),
    path("ml/retrain-async/", ml_retrain_model_async, name="ml-retrain-async"),
    path("<int:predictor_id>/ml/predict/", ml_predict, name="ml-predict"),
    path("ml/models/", ml_list_models, name="ml-list-models"),
] + router.urls
