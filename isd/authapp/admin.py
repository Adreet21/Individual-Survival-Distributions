from django.contrib import admin
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin


class UserAdmin(BaseUserAdmin):
    """Enhanced UserAdmin showing groups as roles."""
    
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff', 'get_groups')
    list_filter = ('is_staff', 'is_superuser', 'is_active', 'groups')
    
    def get_groups(self, obj):
        return ', '.join([group.name for group in obj.groups.all()]) or 'No groups'
    get_groups.short_description = 'Roles/Groups'


# Re-register UserAdmin with our customizations
admin.site.unregister(User)
admin.site.register(User, UserAdmin)
