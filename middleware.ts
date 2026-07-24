import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/signup.html") {
    return NextResponse.redirect(new URL("/login.html", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/signup.html"]
};
