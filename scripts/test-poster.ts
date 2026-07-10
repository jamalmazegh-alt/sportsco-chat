import { buildTeamPosterPdf } from "../src/lib/team-poster/team-poster.server";
import { writeFileSync } from "fs";

async function main() {
  const bytes = await buildTeamPosterPdf({
    inviteUrl: "https://clubero.app/register?invite=test-token-12345",
    teamName: "U15 R1",
    clubName: "FC Test",
    lang: "fr",
  });
  writeFileSync("/tmp/poster-test.pdf", bytes);
  console.log("PDF written to /tmp/poster-test.pdf");
}

main().catch(console.error);
