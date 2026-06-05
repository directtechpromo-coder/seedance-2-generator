import { signIn } from "next-auth/react";

<button onClick={() => signIn("credentials", { callbackUrl: "/" })}>
  Continue as Test User
</button>
