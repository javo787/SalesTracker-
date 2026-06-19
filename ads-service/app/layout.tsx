export const metadata = {
  title: 'Savdo Ads Service',
  description: 'Remote Config for SavdoApp Ads',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#fff', color: '#333' }}>{children}</body>
    </html>
  )
}
