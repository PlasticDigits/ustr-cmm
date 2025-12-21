/**
 * Footer Component
 */

export function Footer() {
  return (
    <footer className="border-t border-gray-800 mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Links */}
          <div className="flex items-center gap-6 text-sm">
            <a 
              href="https://github.com/ustr-cmm" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              GitHub
            </a>
            <a 
              href="https://cl8y.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              CL8Y
            </a>
            <a 
              href="/docs" 
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              Documentation
            </a>
          </div>

          {/* Copyright */}
          <p className="text-gray-600 text-sm">
            USTR CMM © {new Date().getFullYear()}. Built on TerraClassic.
          </p>
        </div>
      </div>
    </footer>
  );
}

