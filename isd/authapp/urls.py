from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import RegisterView, LogoutView, UserForgotPasswordView, UserResetPasswordView, ForgotPasswordView, ResetPasswordView

router = DefaultRouter()

urlpatterns = [
    # Register a new user
    path('register/', RegisterView.as_view(), name='register'),

    # Obtain JWT access and refresh tokens (login)
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),

    # Refresh expired JWT access token using the refresh token
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Blacklist refresh token (logout)
    path('logout/', LogoutView.as_view(), name='logout'),

    # Password reset workflow
    path('user/password/forgot/', UserForgotPasswordView.as_view(), name='user_forgot_password_api'),
    path('user/password/reset/<uidb64>/<token>/', UserResetPasswordView.as_view(), name='user_reset_password_api'),

    path('password/forgot/', ForgotPasswordView.as_view(), name='forgot_password_api'),
    path('password/reset/<uidb64>/<token>/', ResetPasswordView.as_view(), name='reset_password'),
    
]
