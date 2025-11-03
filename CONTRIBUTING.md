# Contributing to Backupr

Thank you for your interest in contributing to Backupr! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/backupr.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit your changes: `git commit -m "Add your feature"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Setup

See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed setup instructions.

## Code Style

### JavaScript/TypeScript
- Use ES6+ features
- Follow existing code patterns
- Use meaningful variable and function names
- Add comments for complex logic

### React Components
- Use functional components with hooks
- Keep components focused and single-purpose
- Use proper prop types validation where applicable

### CSS/Tailwind
- Use Tailwind utility classes
- Follow shadcn/ui patterns for component styling
- Avoid custom CSS when Tailwind utilities are available

## Commit Messages

Use clear and descriptive commit messages:
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Keep the first line under 72 characters
- Add detailed description if needed

Examples:
```
Add file selection dialog to Backup component
Fix MySQL connection timeout issue
Update server API to support batch operations
```

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation if needed
- Add tests if applicable
- Ensure all builds pass
- Reference related issues in the PR description

## Testing

Before submitting a PR:
- Build both client and server: `yarn build:client && yarn build:server`
- Test manually in development mode
- Verify no console errors or warnings

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about the codebase
- Clarifications on contribution process

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
