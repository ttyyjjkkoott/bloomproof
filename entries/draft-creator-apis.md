## Problem

Leo Guinan was building a human-centered AI workflow in which a person's skills and context could be used without turning self-reported claims into automatic delivery. The practical problem was narrow: record a capability profile locally, keep private fields bounded, and require a calibrated evaluation before the system can deliver that profile to an owner-controlled workflow.

## Solution

The AI-assisted work assembled and verified a public proof around Creator APIs' local Python MCP reference service. The service exposes a profile-contribution flow, validates submitted fields, keeps the contribution privacy-bounded, and blocks owner-profile auto-delivery until the calibration gate is satisfied. It documents its boundary instead of pretending that a client-reported result is independent human consent.

## Artifact

- Code: https://github.com/leo-guinan/creator-apis/tree/main/implementations/python-mcp
- Open license: CC0 1.0 Universal
- Project site: https://github.com/leo-guinan/creator-apis

The artifact is code-only; there is no live site or app to claim. Local verification ran with `python3 -m pip install -e '.[test]'` followed by `python3 -m pytest -q`: 17 tests passed. The suite exercises the end-to-end profile flow, privacy rejection, profile isolation, payload binding, false-pass rejection, pause behavior, event-count aggregation, and MCP protocol interoperability.

## Human

Leo Guinan has run the local workflow since the reference implementation landed on October 2, 2026. In practice, the calibration boundary rejects locking before the minimum sample count is reached and rejects any calibration set containing a false pass—an evaluator says pass while Leo says revise or reject—before automatic delivery can be enabled. The same workflow keeps raw examples on the client side and sends only an opaque sample hash, bounded labels, and feedback tags to the service. This is a local reference workflow, not a production deployment or independent proof of consent.

Name: Leo Guinan

## License

CC0 1.0 Universal
