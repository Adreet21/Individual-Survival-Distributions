"""
URL configuration for isd project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.urls import include, path
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path('admin/password/forgot/',TemplateView.as_view(template_name="registration/forgot_password.html"),name='forgot_password'),
    path('auth/reset-password/<uidb64>/<token>/',TemplateView.as_view(template_name="registration/reset_password.html"),name='reset_password_frontend'),
    
    # Django admin
    path('admin/', admin.site.urls),
    path('admin/auth/', include('django.contrib.auth.urls')),

    # Base API routes
    path('api/', include('core.urls')),

    # Authentication (JWT register/login/logout)
    path('api/auth/', include('authapp.urls')),

    # Profile and user management
    path('api/accounts/', include('accounts.urls')),

    # Main application modules
    path('api/datasets/', include('dataset.urls')),
    path('api/predictors/', include('predictors.urls')),
    path('api/predictions/', include('predictions.urls')),
    path('api/folders/', include('folders.urls')),
    
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    path('accounts/', include('django.contrib.auth.urls')),

    # Built-in password reset views
    path('password_reset/', auth_views.PasswordResetView.as_view(), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),

]

# Serve media files during development
# Note: In production, media files should be served by the web server (nginx/apache)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
