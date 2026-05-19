# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `subagent-context` extension — injects a live subagent catalogue (names, descriptions, scope) into the system prompt before each agent turn, so the model reliably knows which agents are available without having to call the tool first.
