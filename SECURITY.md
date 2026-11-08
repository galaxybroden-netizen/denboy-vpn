# Security Policy

## Supported Versions

| Version | Supported          |
|---------|-------------------|
| Latest  | ✅ Yes            |
| Older   | ❌ No             |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

### What to Include

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### How to Report

Send details to the project maintainer through private channels.

**Please do not disclose security vulnerabilities publicly until they have been addressed.**

### What to Expect

- Acknowledgment of your report within 48 hours
- Assessment of the vulnerability
- Timeline for fix and disclosure

### Security Best Practices for Users

1. **Keep secrets secure**: Never commit `.env` files or credentials to version control
2. **Use strong passwords**: Enforce strong password policies for all user accounts
3. **Enable HTTPS**: Always use TLS/SSL in production
4. **Keep dependencies updated**: Regularly update dependencies to patch known vulnerabilities
5. **Restrict network access**: Ensure database and Redis are not exposed to the public internet
6. **Monitor logs**: Review application and access logs regularly

### Encryption

This application uses AES-256-GCM encryption for sensitive data at rest. Ensure `AI_ENCRYPTION_KEY` is set and kept secure in production environments.
