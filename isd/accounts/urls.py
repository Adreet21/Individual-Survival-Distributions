from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, search_users
from predictors.views import resolve_username

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path('users/search/', search_users, name='search_users'),
    path('', include(router.urls)),
    path("resolve/", resolve_username, name="resolve-username"),
]
