import type { Metadata } from 'next';
import './globals.css';
import AuthBar from './AuthBar';

export const metadata: Metadata = {
  title: 'Art Platform',
  description: 'Upload and verify artworks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="vstack" style={{ gap: 16 }}>
          <AuthBar />
          {children}
        </div>
      </body>
    </html>
  );
}

