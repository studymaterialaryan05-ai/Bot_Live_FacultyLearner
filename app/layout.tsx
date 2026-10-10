import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FacultyLens AI | MBA Lecture Intelligence",
  description: "Turn MBA lectures into structured learning, research, and exam practice."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
