from django.urls import path
from .views import HealthCheckView, APIRootView

urlpatterns = [
    path('', APIRootView.as_view(), name='api-root'),
    path('health/', HealthCheckView.as_view(), name='health-check'),
]
