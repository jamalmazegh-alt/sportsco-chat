import PhoneInputBase from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (val: string) => void;
  defaultCountry?: any;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = "FR",
  placeholder,
  className,
  id,
  disabled,
}: Props) {
  return (
    <PhoneInputBase
      id={id}
      international
      defaultCountry={defaultCountry}
      value={value || undefined}
      onChange={(v) => onChange(v ?? "")}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "phone-input flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm gap-2",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    />
  );
}
