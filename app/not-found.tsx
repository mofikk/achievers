export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        background: "#f3f3f3",
        color: "#1f2933",
        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <section
        style={{
          width: "min(100%, 520px)",
          padding: 24,
          border: "2px solid #d3d3d3",
          borderRadius: 14,
          background: "#ffffff",
          textAlign: "center"
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#64707d",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase"
          }}
        >
          404
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: 28, lineHeight: 1.15 }}>Page Not Found</h1>
        <p style={{ margin: "0 0 18px", color: "#64707d", lineHeight: 1.5 }}>
          The page you are looking for does not exist or may have been moved.
        </p>
        <a
          href="/index.html"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 40,
            padding: "8px 14px",
            borderRadius: 10,
            background: "#010812",
            color: "#ffffff",
            fontWeight: 700,
            textDecoration: "none"
          }}
        >
          Go to Dashboard
        </a>
      </section>
    </main>
  );
}
