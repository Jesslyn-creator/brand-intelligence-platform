import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Intelligence Admin",
  description: "Internal multi-project AI visibility testing for target and competitor brands."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
