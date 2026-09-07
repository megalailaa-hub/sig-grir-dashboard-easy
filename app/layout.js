import './globals.css';

export const metadata = {
  title: 'GRIR Monitoring',
  description: 'SIG Finance Control - GRIR Monitoring'
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
