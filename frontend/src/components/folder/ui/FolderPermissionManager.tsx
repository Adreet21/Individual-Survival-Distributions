/**
 * ----------------------------------------------------------------------------------
 * FolderPermissionManager
 * ----------------------------------------------------------------------------------
 * - Advanced folder permission management interface
 * - Shows detailed permission information with granted dates
 * - Allows bulk permission operations
 * - Provides permission history and audit information
 * - Used within folder settings or admin interfaces
 */

import { useState, useEffect } from "react";
import { 
  getFolderPermissions, 
  revokeFolderPermission,
  type Folder, 
  type FolderPermission 
} from "../../../lib/folders";

export interface FolderPermissionManagerProps {
  folder: Folder;
  onPermissionsUpdated?: () => void;
  showAdvancedOptions?: boolean;
}

export default function FolderPermissionManager({
  folder,
  onPermissionsUpdated,
  showAdvancedOptions = false,
}: FolderPermissionManagerProps) {
  const [permissions, setPermissions] = useState<FolderPermission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadPermissions();
  }, [folder.folder_id]);

  const loadPermissions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const folderPermissions = await getFolderPermissions(folder.folder_id);
      setPermissions(folderPermissions);
    } catch (err: any) {
      setError("Failed to load permissions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokePermission = async (permission: FolderPermission) => {
    try {
      setError(null);
      await revokeFolderPermission(folder.folder_id, permission.user.id);
      
      // Update local state
      setPermissions(prev => prev.filter(p => p.user.id !== permission.user.id));
      setSelectedPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(permission.user.id);
        return newSet;
      });
      
      onPermissionsUpdated?.();
    } catch (err: any) {
      setError(`Failed to revoke access from ${permission.user.username}`);
    }
  };

  const handleBulkRevoke = async () => {
    if (selectedPermissions.size === 0) return;

    try {
      setError(null);
      const permissionsToRevoke = permissions.filter(p => 
        selectedPermissions.has(p.user.id)
      );

      // Revoke permissions sequentially
      for (const permission of permissionsToRevoke) {
        await revokeFolderPermission(folder.folder_id, permission.user.id);
      }

      // Update local state
      setPermissions(prev => 
        prev.filter(p => !selectedPermissions.has(p.user.id))
      );
      setSelectedPermissions(new Set());
      
      onPermissionsUpdated?.();
    } catch (err: any) {
      setError("Failed to revoke some permissions");
      // Reload to get current state
      loadPermissions();
    }
  };

  const handleSelectAll = () => {
    if (selectedPermissions.size === permissions.length) {
      setSelectedPermissions(new Set());
    } else {
      setSelectedPermissions(new Set(permissions.map(p => p.user.id)));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Header with Bulk Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Folder Permissions</h3>
          <p className="text-sm text-gray-600">
            {permissions.length} user{permissions.length !== 1 ? 's' : ''} with access
          </p>
        </div>
        
        {showAdvancedOptions && permissions.length > 0 && (
          <div className="flex items-center gap-2">
            {selectedPermissions.size > 0 && (
              <button
                onClick={handleBulkRevoke}
                className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
              >
                Revoke Selected ({selectedPermissions.size})
              </button>
            )}
            <button
              onClick={loadPermissions}
              className="text-sm border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Permissions List */}
      {permissions.length === 0 ? (
        <div className="text-center py-8 border border-gray-200 rounded-md">
          <div className="text-gray-500">
            <div className="text-lg mb-2">👥</div>
            <div className="text-sm">No shared permissions</div>
            <div className="text-xs text-gray-400 mt-1">
              This folder is only accessible to you
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          {/* Table Header */}
          {showAdvancedOptions && (
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedPermissions.size === permissions.length && permissions.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All
                </span>
              </div>
            </div>
          )}

          {/* Permissions */}
          <div className="divide-y divide-gray-200">
            {permissions.map((permission) => (
              <div
                key={permission.user.id}
                className={`p-4 ${
                  selectedPermissions.has(permission.user.id) ? 'bg-blue-50' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {showAdvancedOptions && (
                      <input
                        type="checkbox"
                        checked={selectedPermissions.has(permission.user.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedPermissions);
                          if (e.target.checked) {
                            newSet.add(permission.user.id);
                          } else {
                            newSet.delete(permission.user.id);
                          }
                          setSelectedPermissions(newSet);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    )}
                    
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                      {permission.user.username.charAt(0).toUpperCase()}
                    </div>
                    
                    <div>
                      <div className="font-medium text-sm">{permission.user.username}</div>
                      {permission.user.email && (
                        <div className="text-xs text-gray-500">{permission.user.email}</div>
                      )}
                      {showAdvancedOptions && (
                        <div className="text-xs text-gray-400 mt-1">
                          Granted {formatDate(permission.granted_at)}
                          {permission.granted_by && (
                            <span> by {permission.granted_by.username}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded capitalize">
                      {permission.permission_type}
                    </span>
                    <button
                      onClick={() => handleRevokePermission(permission)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permission Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="text-sm text-blue-800">
          <div className="font-medium mb-2">Permission Details</div>
          <ul className="text-xs space-y-1 text-blue-700">
            <li>• <strong>View:</strong> Can see the folder and access all items within it</li>
            <li>• Users automatically gain access to individual items in the folder</li>
            <li>• Removing folder access also removes access to contained items</li>
            <li>• Only folder owners can modify folder contents and permissions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}