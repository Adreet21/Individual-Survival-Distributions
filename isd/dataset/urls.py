"""
URL configuration for dataset app.

The DefaultRouter automatically creates the following endpoints:
- GET /api/datasets/ - List datasets
- POST /api/datasets/ - Create dataset (with file upload)
- GET /api/datasets/{id}/ - Retrieve dataset details
- PUT /api/datasets/{id}/ - Update dataset
- PATCH /api/datasets/{id}/ - Partial update dataset
- DELETE /api/datasets/{id}/ - Delete dataset
- GET /api/datasets/{id}/download/ - Download dataset file (custom action)

- GET /api/datasets/permissions/ - List dataset permissions
- POST /api/datasets/permissions/ - Grant dataset permission
- DELETE /api/datasets/permissions/{id}/ - Revoke dataset permission
"""

from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import DatasetViewSet, DatasetPermissionViewSet, PinnedDatasetViewSet, list_public_datasets, ml_train_model, ml_train_model_async

router = DefaultRouter()

router.register("permissions", DatasetPermissionViewSet, basename="dataset-permission")
router.register("pins", PinnedDatasetViewSet, basename="pinned-dataset")
router.register("", DatasetViewSet, basename="dataset")

urlpatterns = [
    path("public/", list_public_datasets, name="public-datasets"),
    path("<int:dataset_id>/ml/train/", ml_train_model, name="ml-train"),
    path("<int:dataset_id>/ml/train-async/", ml_train_model_async, name="ml-train-async"),
] + router.urls