from django.contrib import admin
from .models import Predictor, PredictorPermission


@admin.register(Predictor)
class PredictorAdmin(admin.ModelAdmin):
    list_display = ('predictor_id', 'name', 'dataset', 'owner')
    list_filter = ('dataset', 'owner')
    search_fields = ('name', 'description')


@admin.register(PredictorPermission)
class PredictorPermissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'predictor', 'user')
    list_filter = ('predictor', 'user')
