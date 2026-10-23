import type { ComponentProps } from "react";
import { GoogleLogin } from "@/components/pages/google-login";
import { getLocalAccountOptions } from "@/lib/auth/local-auth";

export function LoginScreen(props: Readonly<Omit<ComponentProps<typeof GoogleLogin>, "localAccounts">>) {
  return <GoogleLogin {...props} localAccounts={getLocalAccountOptions()} />;
}
