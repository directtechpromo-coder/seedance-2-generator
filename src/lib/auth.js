export const authOptions = {
  providers: [],
  callbacks: {
    async session({ session }) {
      session.user = {
        id: "guest-user-123",
        name: "Guest User",
        email: "guest@example.com",
        credits: 150,
        image: null,
      };
      return session;
    },
    async jwt({ token }) {
      token.id = "guest-user-123";
      return token;
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
};
