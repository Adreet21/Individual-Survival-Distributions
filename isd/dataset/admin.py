from django.contrib import admin
from django.contrib import messages
from .models import Dataset, DatasetPermission


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = ('dataset_id', 'dataset_name', 'owner', 'has_file', 'uploaded_at')
    list_filter = ('owner', 'is_public', 'time_unit', 'uploaded_at')
    search_fields = ('dataset_name', 'owner__username')
    readonly_fields = ('uploaded_at', 'file_size')
    actions = ['delete_selected_with_files']
    
    def delete_selected_with_files(self, request, queryset):
        """Custom bulk delete action that properly handles file cleanup."""
        deleted_count, file_errors = Dataset.bulk_delete_with_files(queryset)
        
        if file_errors:
            error_msg = f"Deleted {deleted_count} datasets but encountered {len(file_errors)} file cleanup errors."
            self.message_user(request, error_msg, level=messages.WARNING)
            for error in file_errors[:5]:  # Show first 5 errors
                self.message_user(request, f"File cleanup error: {error}", level=messages.ERROR)
            if len(file_errors) > 5:
                self.message_user(request, f"... and {len(file_errors) - 5} more file cleanup errors", level=messages.ERROR)
        else:
            self.message_user(request, f"Successfully deleted {deleted_count} datasets and their associated files.")
    
    delete_selected_with_files.short_description = "Delete selected datasets (with file cleanup)"
    
    def delete_queryset(self, request, queryset):
        """Override the default delete_queryset to use our bulk delete method."""
        deleted_count, file_errors = Dataset.bulk_delete_with_files(queryset)
        
        if file_errors:
            error_msg = f"Deleted {deleted_count} datasets but encountered {len(file_errors)} file cleanup errors."
            self.message_user(request, error_msg, level=messages.WARNING)
        else:
            self.message_user(request, f"Successfully deleted {deleted_count} datasets and their associated files.")


@admin.register(DatasetPermission)
class DatasetPermissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'dataset', 'user')
    list_filter = ('dataset', 'user')
