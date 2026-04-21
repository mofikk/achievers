export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return Response.json(
      {
        data: null,
        error: "Missing Supabase public environment variables"
      },
      { status: 500 }
    );
  }

  return Response.json({
    data: {
      url,
      anonKey
    },
    error: null
  });
}
