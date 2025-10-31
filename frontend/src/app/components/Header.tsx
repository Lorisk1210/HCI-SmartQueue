// =====================================================================
// Header Component - Application Header
// =====================================================================
// Simple header component displaying the application name.
// Currently unused in the main layout but available for future use.

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 py-6">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold">SmartQueue</h1>
      </div>
    </header>
  );
}
