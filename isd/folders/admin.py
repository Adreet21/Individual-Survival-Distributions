from django.contrib import admin
from .models import Folder, FolderItem, FolderPermission


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'is_private', 'item_count', 'created_at')
    list_filter = ('is_private', 'created_at', 'owner')
    search_fields = ('name', 'description', 'owner__username')
    readonly_fields = ('folder_id', 'created_at', 'updated_at', 'item_count', 'public_item_count')
    
    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'owner', 'is_private')
        }),
        ('Metadata', {
            'fields': ('folder_id', 'created_at', 'updated_at', 'item_count', 'public_item_count'),
            'classes': ('collapse',)
        }),
    )


@admin.register(FolderItem)
class FolderItemAdmin(admin.ModelAdmin):
    list_display = ('folder', 'content_type', 'object_id', 'content_object', 'added_by', 'added_at')
    list_filter = ('content_type', 'added_at', 'folder__owner')
    search_fields = ('folder__name', 'added_by__username')
    readonly_fields = ('added_at',)


@admin.register(FolderPermission)
class FolderPermissionAdmin(admin.ModelAdmin):
    list_display = ('folder', 'user', 'permission_type', 'granted_by', 'granted_at')
    list_filter = ('permission_type', 'granted_at', 'folder__owner')
    search_fields = ('folder__name', 'user__username', 'granted_by__username')
    readonly_fields = ('granted_at',)