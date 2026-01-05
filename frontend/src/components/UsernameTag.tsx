export default function UsernameTag({ name }: { name: string }) {
  return (
    <div className="inline-block rounded-tl-md px-4 py-1 text-[12px] font-medium bg-neutral-700 text-white">
      {name}
    </div>
  );
}
