import { buildTeamPosterPdf } from "@/lib/team-poster/team-poster.server";
import fs from "fs";

async function main() {
  const pdf = await buildTeamPosterPdf({
    inviteUrl: "https://clubero.app/register?invite=test-token-12345",
    teamName: "USAG UCKANGE U15",
    clubName: "USAG UCKANGE",
    lang: "fr",
  });
  fs.writeFileSync("/tmp/poster-test.pdf", pdf);
  console.log("PDF written to /tmp/poster-test.pdf");
}

main().catch(console.error);
