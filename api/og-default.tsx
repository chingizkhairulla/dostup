import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

export default async function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F6F7F8",
          padding: "48px",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#FF6B00",
            marginBottom: "16px",
          }}
        >
          Dostup
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#1F2328",
            textAlign: "center",
            maxWidth: "900px",
            lineHeight: 1.4,
          }}
        >
          Платформа для проведения уроков и продажи курсов!
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
