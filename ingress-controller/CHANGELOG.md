# Changelog

All notable changes to WSLProxy Ingress Controller will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of WSLProxy Ingress Controller
- Zero-downtime dynamic upstream management
- WSLProxyBackend CRD for backend configuration
- WSLProxyRoute CRD for advanced routing
- Multi-architecture Docker images (amd64, arm64)
- Comprehensive Helm chart with HPA and PDB support
- Prometheus metrics integration
- Active and passive health checking
- Circuit breaking support
- Multiple load balancing algorithms (round-robin, weighted, IP hash)
- HTTP API for controller integration
- Production-ready security (non-root, read-only FS)

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

## [1.0.0] - TBD

### Added
- First stable release
- Complete CRD implementation (WSLProxyBackend, WSLProxyRoute)
- Go controller with Kubernetes integration
- Lua-based dynamic upstream management
- OpenResty with HTTP API endpoints
- Production-grade Helm chart
- Multi-arch Docker builds
- CI/CD pipeline with GitHub Actions
- Comprehensive documentation

[Unreleased]: https://github.com/wslproxy/wslproxy/compare/ingress-v1.0.0...HEAD
[1.0.0]: https://github.com/wslproxy/wslproxy/releases/tag/ingress-v1.0.0
