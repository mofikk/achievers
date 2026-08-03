import { NextRequest, NextResponse } from "next/server";

const MAINTENANCE_PATH = "/maintenance.html";
const ASSET_PATH_PATTERN = /\.(?:css|js|map|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/i;

function isMaintenanceModeEnabled() {
  return process.env.MAINTENANCE_MODE?.toLowerCase() === "true";
}

function isAllowedDuringMaintenance(pathname: string) {
  return (
    pathname === MAINTENANCE_PATH ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/css/") ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    ASSET_PATH_PATTERN.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isMaintenanceModeEnabled() && !isAllowedDuringMaintenance(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { data: null, error: "Service temporarily unavailable for maintenance." },
        {
          status: 503,
          headers: {
            "Retry-After": "600"
          }
        }
      );
    }

    return NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url), 307);
  }

  if (pathname === "/signup.html") {
    return NextResponse.redirect(new URL("/login.html", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
