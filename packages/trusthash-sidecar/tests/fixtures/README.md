# Test Fixtures

This directory contains sample files for testing C2PA functionality.

## Files

### c2pa-sample.jpg

A JPEG image with an embedded C2PA manifest, sourced from the [c2pa-rs](https://github.com/contentauth/c2pa-rs) project.

- **Source**: `https://github.com/contentauth/c2pa-rs/raw/main/sdk/tests/fixtures/CA.jpg`
- **Size**: ~167KB
- **Claim Generator**: `make_test_images/0.33.1`
- **Assertions**: thumbnail, ingredient, actions, hash, CreativeWork schema

## Usage

These fixtures are used by integration tests to verify C2PA manifest reading and validation without requiring network access.

## Adding New Fixtures

When adding new fixtures:

1. Document the source and purpose in this README
2. Prefer small files to minimize repo size
3. Ensure the file has a valid, parseable C2PA manifest
4. Add corresponding test cases in the test files
