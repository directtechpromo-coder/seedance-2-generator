import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = "guest-user-123";
        session.user.credits = 150;
      }
      return session;
    },
    async jwt({ token }) {
      return token;
    },
  },
  session: {
    strategy: "jwt",
  },
};
