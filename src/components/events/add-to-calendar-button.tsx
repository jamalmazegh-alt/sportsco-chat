import { useTranslation } from "react-i18next";
import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildGoogleCalendarUrl,
  buildIcsContent,
  icsFileName,
  type CalendarEventInput,
} from "@/lib/events/calendar-links";

interface Props {
  event: CalendarEventInput;
  className?: string;
}

export function AddToCalendarButton({ event, className }: Props) {
  const { t } = useTranslation();

  function downloadIcs() {
    const blob = new Blob([buildIcsContent(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFileName(event.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <CalendarPlus className="h-4 w-4" />
          <span>{t("events.addToCalendar", { defaultValue: "Ajouter au calendrier" })}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <a href={buildGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t("events.addToGoogleCalendar", { defaultValue: "Google Agenda" })}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadIcs()}>
          <Download className="h-4 w-4" />
          {t("events.downloadIcs", { defaultValue: "Apple / Outlook (.ics)" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
