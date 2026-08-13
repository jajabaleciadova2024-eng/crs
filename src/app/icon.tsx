import { ImageResponse } from "next/og";

// Replaces the old favicon.ico with a generated heart icon — see
// node_modules/next/dist/docs/.../app-icons.md: an `icon.tsx` at the app
// root takes over the favicon slot (favicon.ico removed alongside this).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path
            fill="#a13e3e"
            d="M12 21s-6.7-4.35-9.3-8.2C1 10.1 1.6 6.6 4.3 5.1c2.2-1.2 4.8-.5 6.3 1.4l1.4 1.8 1.4-1.8c1.5-1.9 4.1-2.6 6.3-1.4 2.7 1.5 3.3 5 1.6 7.7C18.7 16.65 12 21 12 21Z"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
