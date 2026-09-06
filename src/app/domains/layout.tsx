import { auth } from "@clerk/nextjs/server";
import { DomainsProviders } from "./providers";

/**
 * Sends signed-out visitors to sign-in; the API guards the data on its own. The
 * query cache is scoped to this segment so a new sign-in never starts from
 * another account's rows.
 */
export default async function DomainsLayout({
  children,
}: LayoutProps<"/domains">) {
  await auth.protect();
  return <DomainsProviders>{children}</DomainsProviders>;
}
