import { NextResponse } from "next/server";

export function proxy(request) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const auth = request.cookies.get("auth");

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!auth && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
