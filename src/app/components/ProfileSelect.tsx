import { PROFILE_LABELS } from "@/lib/judge/policy";
import { PROFILES, type Profile } from "@/lib/judge/types";

interface ProfileSelectProps {
  value: Profile;
  onChange: (profile: Profile) => void;
  id?: string;
  className?: string;
}

export function ProfileSelect({ value, onChange, id, className }: ProfileSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as Profile)}
      className={`rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${className ?? ""}`}
    >
      {PROFILES.map((profile) => (
        <option key={profile} value={profile}>
          {PROFILE_LABELS[profile]}
        </option>
      ))}
    </select>
  );
}
