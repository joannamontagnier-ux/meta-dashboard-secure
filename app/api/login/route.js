import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json();
  const dashboardPassword =
    process.env.DASHBOARD_PASSWORD ||
    (process.env.NODE_ENV !== "production" ? "admin" : null);

  if (!dashboardPassword) {
    return NextResponse.json(
      {
        success: false,
        error: "DASHBOARD_PASSWORD manquant",
      },
      { status: 500 }
    );
  }

  if (body.password === dashboardPassword) {
    const response = NextResponse.json({ success: true });

    response.cookies.set("auth", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  }

  return NextResponse.json({ success: false });
}
