# USTR CMM Frontend

React + TypeScript frontend application for the USTR CMM (Collateralized Stablecoin System) on TerraClassic.

## Prerequisites

- **Node.js**: Version specified in `.nvmrc` (Node 20+)
- **npm**: Comes with Node.js, or use `yarn`/`pnpm` if preferred

### Using nvm (Recommended)

If you have [nvm](https://github.com/nvm-sh/nvm) installed:

```bash
# Install and use the correct Node.js version
nvm install
nvm use
```

This will automatically use the version specified in `.nvmrc`.

### Manual Installation

If you don't use nvm, ensure you have Node.js 20 or higher installed:

```bash
node --version  # Should be v20.x.x or higher
```

## Installation

Install project dependencies:

```bash
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the next available port).

The dev server includes:
- Hot Module Replacement (HMR) for instant updates
- TypeScript type checking
- ESLint integration

## Building

Build the application for production:

```bash
npm run build
```

This will:
1. Run TypeScript type checking (`tsc`)
2. Build optimized production assets using Vite
3. Output files to the `dist/` directory

The production build includes:
- Minified JavaScript and CSS
- Optimized asset bundling
- Tree-shaking for smaller bundle sizes

## Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

This serves the `dist/` directory using Vite's preview server, useful for testing the production build before deployment.

## Code Quality

### Type Checking

Run TypeScript type checking without emitting files:

```bash
npm run type-check
```

### Linting

Run ESLint to check code quality:

```bash
npm run lint
```

The project uses:
- TypeScript ESLint for type-aware linting
- React hooks linting rules
- Strict linting configuration (max warnings: 0)

## Project Structure

```
frontend/
├── src/
│   ├── components/      # React components
│   │   ├── common/     # Reusable UI components
│   │   ├── dashboard/  # Dashboard-specific components
│   │   ├── layout/     # Layout components (Header, Footer)
│   │   └── swap/       # Swap-related components
│   ├── hooks/          # Custom React hooks
│   ├── pages/          # Page components
│   ├── services/       # API and contract services
│   ├── stores/         # State management (Zustand)
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Application entry point
│   └── index.css       # Global styles (Tailwind CSS)
├── public/             # Static assets
├── index.html          # HTML template
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
├── tailwind.config.js  # Tailwind CSS configuration
└── package.json        # Dependencies and scripts
```

## Technologies

- **React 18**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **React Router**: Client-side routing
- **Zustand**: Lightweight state management
- **TanStack Query**: Data fetching and caching
- **ESLint**: Code linting

## Environment Variables

If you need to configure environment-specific variables, create a `.env` file in the root of the `frontend/` directory:

```bash
# Example .env file
VITE_API_URL=https://api.example.com
VITE_CHAIN_ID=columbus-5
```

Variables prefixed with `VITE_` are exposed to the client-side code.

## Deployment

After building the application:

1. The `dist/` directory contains all production-ready files
2. Deploy the contents of `dist/` to your hosting provider (e.g., Vercel, Netlify, AWS S3, etc.)
3. Ensure your hosting provider is configured to serve `index.html` for all routes (SPA routing)

### Example Deployment Commands

**Vercel:**
```bash
npm run build
vercel deploy --prod
```

**Netlify:**
```bash
npm run build
netlify deploy --prod --dir=dist
```

## Troubleshooting

### Port Already in Use

If port 5173 is already in use, Vite will automatically try the next available port. You can also specify a port:

```bash
npm run dev -- --port 3000
```

### Node Version Issues

If you encounter compatibility issues, ensure you're using the correct Node.js version:

```bash
nvm use  # If using nvm
node --version  # Verify version
```

### Dependency Issues

If you encounter dependency-related errors:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## License

AGPL-3.0
