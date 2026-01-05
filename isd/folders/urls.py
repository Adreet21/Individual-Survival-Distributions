"""
URL configuration for folders app.

The DefaultRouter automatically creates the following endpoints:
- GET /api/folders/ - List folders
- POST /api/folders/ - Create folder
- GET /api/folders/{id}/ - Retrieve folder details
- PUT /api/folders/{id}/ - Update folder
- PATCH /api/folders/{id}/ - Partial update folder
- DELETE /api/folders/{id}/ - Delete folder
- POST /api/folders/{id}/items/ - Add item to folder (custom action)
- DELETE /api/folders/{id}/items/remove/ - Remove item from folder (custom action)
- GET /api/folders/{id}/items/ - List folder items (custom action)

- GET /api/folders/permissions/ - List folder permissions
- POST /api/folders/permissions/ - Grant folder permission
- DELETE /api/folders/permissions/{id}/ - Revoke folder permission
"""

from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import FolderViewSet, FolderPermissionViewSet, PinnedFolderViewSet, list_public_folders, get_public_folder_contents

router = DefaultRouter()
router.register("permissions", FolderPermissionViewSet, basename="folder-permission")
router.register("pins", PinnedFolderViewSet, basename="pinned-folder")
router.register("", FolderViewSet, basename="folder")

urlpatterns = [
    path("public/", list_public_folders, name="public-folders"),
    path("public/<int:folder_id>/", get_public_folder_contents, name="public-folder-contents"),
] + router.urls