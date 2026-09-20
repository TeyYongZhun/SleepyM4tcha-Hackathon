import { Mail } from "lucide-react";

/** Right side while no email is selected. On small screens the list fills the screen instead. */
export default function NoEmailSelected() {
  return (
    <div className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 text-ink-soft lg:flex">
      <Mail size={34} strokeWidth={1.6} aria-hidden />
      <p className="text-[13.5px]">Select a message to read it.</p>
    </div>
  );
}
