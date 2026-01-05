/**
 * ----------------------------------------------------------------------------------
 * PrivacyBadge
 * ----------------------------------------------------------------------------------
 * - Shared pill for Public / Private visibility
 * - Used in Browse cards, FolderCard headers, FolderSelector preview, etc.
 * - Gives consistent color and improves contrast/readability
 */

export default function PrivacyBadge({ isPublic }: { isPublic: boolean }) {
  return (
    <span
      className={
        isPublic
          ? "inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700"
          : "inline-flex items-center rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
      }
    >
      {isPublic ? "Public" : "Private"}
    </span>
  );
}
