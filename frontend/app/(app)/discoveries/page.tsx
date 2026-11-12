import { redirect } from "next/navigation";

export default function DiscoveriesRedirect(): never {
  redirect("/candidates");
}
