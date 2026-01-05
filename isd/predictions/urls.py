"""
URL configuration for predictions app
"""
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import PredictionViewSet

router = DefaultRouter()
router.register("", PredictionViewSet, basename="prediction")

urlpatterns = router.urls
