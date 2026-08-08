---
name: llmuid
description: >-
  Use when integrating LLMUID identifiers into an application -- minting,
  resolving, persisting the registry, binding check symbols to a context, or
  emitting identifiers into prompts that pass through a language model.
  Triggers on "LLMUID", an identifier shaped like K7-M3-XR-9D-Q2, `composer
  require philippelyp/llmuid`, `pip install llmuid`, `npm install llmuid`, or a
  question about identifiers surviving repeated LLM copying.
---

# Using LLMUID

LLMUID is an identifier scheme for systems where identifiers must pass through
large language models -- read, copied and re-emitted across many prompt hops.
An identifier looks like `K7-M3-XR-9D-Q2`: ten symbols over a 29-symbol
alphabet of digits and consonants, eight of them a random payload and two of
them check symbols, written as five groups of two.

The contract is one line: **any single damage event is silently repaired, and
anything more is a failure.**

This file covers how to *use* an implementation correctly. It is not
authoritative over the scheme, and it does not restate it.

## The specification is authoritative

<https://github.com/philippelyp/llmuid/blob/main/llmuid.md>

Fetch it before answering any question about *why* the scheme is shaped the way
it is, and before proposing a change to any parameter. The alphabet, the length
of 10, the payload of 8, the group of 2, the delimiter, and the repair radius of
2 are one versioned unit, never configuration -- there is no option to add and
no constructor argument to introduce. Its "Alternatives considered" section
already records why UUIDs, sequential identifiers, word encodings, Luhn-style
check digits, CRCs and truncated MACs were each rejected.

If this file and the specification ever disagree, this file is wrong.

## Install, and the whole API

| Language | Install | Import |
|---|---|---|
| PHP | `composer require philippelyp/llmuid` | `use LLMUID\LLMUID;` |
| Python | `pip install llmuid` | `from llmuid import LLMUID` |
| JavaScript | `npm install llmuid` | `import { LLMUID } from "llmuid";` |

Five methods, the same shape in all three:

```
mint(context = "")                -> the canonical identifier, or failure
resolve(candidate, context = "")  -> the identifier it stands for, or failure
registry()                        -> every identifier issued, in mint order
last_error()                      -> why the last call failed, or nothing
self_test()                       -> grades the package against 134 vectors
```

**Nothing raises.** Failure is a return value -- `FALSE` in PHP, `None` in
Python, `null` in JavaScript -- so there is nothing to wrap in `try`. Even the
one call that could throw, the system random source, is caught internally and
becomes a failed `mint()` like any other. `last_error()` is a method in every
implementation, never a property or a getter.

## Three things to get right

Everything else in this file is detail. These three are where an integration
goes wrong quietly.

### 1. Extract, then resolve. `resolve()` is not an extractor

Normalization is deliberately liberal -- it discards case, delimiters and
wrapping so that degraded forms can still be found -- which means it will
happily eat the prose around an identifier too:

```
resolve("see invoice K7-M3-XR-9D-Q2 today")
    -> failure: "Too long to be one damage event: 16 symbols, expected 10"
```

Pull candidates out of surrounding text first, then hand `resolve()` one at a
time. In canonical rendering they match:

```
\b[0-9BCDFGHJKMNPQRSTVWXZ]{2}(?:-[0-9BCDFGHJKMNPQRSTVWXZ]{2}){4}\b
```

### 2. Give failure somewhere to go

The specification is explicit: tightening repair does not reduce damage, it
reclassifies it, and **if failure has no answer the strict contract is not
safe.** Decide what the system does when `resolve()` fails, at integration
time, and write it -- typically retry the model call, re-fetch from the source
of truth, or drop the item.

Never soften the boundary. Do not fall back to the nearest registry entry, do
not accept on a checksum pass alone, and do not widen the radius when a guess
looks confident. A heavily damaged string sitting near one issued identifier is
exactly the case most likely to be a genuine identifier pasted into the wrong
role. A detected failure is never traded for a plausible answer.

### 3. If you bind a context, you must store the context

`mint(context)` binds the check symbols to the slot, role or parent an
identifier belongs to, so a genuine identifier in the wrong place fails to
resolve. The same string must reach `resolve()`.

**The registry does not carry it.** The context is not part of the identifier
and cannot be recovered from it, so a registry that survives a restart resolves
nothing unless the application kept the context too:

```
identifier = mint("invoice")            -> DG-17-MM-0H-F5
issued     = registry()                 -> persisted, process ends

# new process, registry restored through the constructor
resolve("DG-17-MM-0H-F5", "invoice")    -> DG-17-MM-0H-F5
resolve("DG-17-MM-0H-F5")               -> failure
    "Wrong context: DG-17-MM-0H-F5 was not issued under this context"
```

So persist the context beside the identifier in your own storage, or derive it
from data you already hold (the row's table name, the parent's key), or keep one
instance per context. Storing the identifier alone is unrecoverable.

## Emitting identifiers into prompts

The write path is short but not optional, and it is the part no library can
enforce for you.

Emit in canonical rendering, wrapped in a consistent quoting mark that signals
*opaque literal, not prose* -- backticks, in a Markdown-flavoured prompt. Then
carry a standing instruction in every prompt that carries identifiers:

```
Identifiers in this conversation look like `K7-M3-XR-9D-Q2`: ten characters
drawn from 0-9 and BCDFGHJKMNPQRSTVWXZ, in five groups of two joined by
hyphens. Copy them character for character. Never abbreviate one, never
reformat one, and never invent one that was not given to you.
```

The instruction is reinforcement, not a guarantee -- models follow it
imperfectly. Its job is to lower the damage rate; the validation layers are
what make the remaining damage safe.

Identifiers are only ever created by `mint()`. No component, human or model,
composes one by hand.

## Validate at every hop

The single-event budget holds *per validated segment*. If a value passes
through three model calls without being checked, three slips can accumulate and
the fourth check sees damage the contract cannot repair.

So at every hop under your control, `resolve()` what arrives and re-emit the
canonical rendering the call returns -- never the string that came in. That is
what keeps each hop's budget independent.

## Persisting the registry

The registry is in-memory and lives in the object. `registry()` hands the issued
set back as canonical renderings, and the constructor takes it back:

```
issued = r.registry()      # persist this
r      = LLMUID(issued)    # same registry, new process
```

It is **append-only**. Never remove an identifier: resolution has to give the
same answer for the same text whenever it runs, and text containing an
identifier can outlive any decision to stop using it. Retiring an identifier is
application state -- a flag on your row -- not a registry operation. A retired
identifier still resolves, and your application decides what that means.

Minting scans the registry to enforce separation, so seed the constructor with
everything ever issued, not just what is currently active.

## Telemetry

Two signals are worth separating, and the specification treats them as distinct
causes: **a repair means the channel is degrading** (contexts too long, too many
identifiers in one prompt, a model change), while **a failure means the pipeline
is faulty**, since honest noise almost never produces multi-event damage.

Counting failures is easy -- `resolve()` returned nothing, and `last_error()`
says which kind. The wordings are stable and worth bucketing separately:

| `last_error()` | What it means |
|---|---|
| `Too long to be one damage event: ...` | prose came along, or a rewrite |
| `Too short to be one damage event: ...` | truncation |
| `Checksum failed and no issued identifier is within 2 edits` | mangled or fabricated |
| `Well-formed but never issued: ...` | fabrication that satisfied the arithmetic |
| `Symbols were inserted or dropped and ...` | length shifted, no match near |
| `Wrong context: ... was not issued under this context` | a valid identifier in the wrong role |
| `Ambiguous: ... within 2 edits` | refused rather than decoded |

**Counting repairs takes a comparison.** A repair is silent by design -- that is
the contract -- so `last_error()` reports nothing after one, exactly as after a
pristine accept. Compare what `resolve()` returned against what you gave it: if
the ten symbols differ, one damage event was repaired. Log that.

## Not a security mechanism

The random payload makes identifiers statistically unguessable, but not
cryptographically so, and the check symbols are public arithmetic anyone can
compute. **Never use an identifier as a secret, a capability or a bearer
token**, and never let possession of a valid one grant authority. The adversary
in this design is a hallucinating model, not an attacker; authentication and
authorization belong to other layers.

Reach for LLMUID when identifiers pass through a model. It is not a
general-purpose replacement for a primary key, and it earns nothing in a system
where a model never sees the value.

## Confirming the install

`self_test()` grades the installed package against all 134 conformance vectors,
which ship inside it, and then against the invariants minting is answerable for.
It mints only into throwaway objects and leaves your registry untouched.

```php
$r->self_test();    // TRUE, or last_error() names the first failing case
```

A failure means the implementation has drifted from the specification -- never
that a vector needs updating.

## Worked examples

`references/integrating.md` carries one complete round trip -- mint, store,
build the prompt, extract from the reply, resolve, handle failure -- in PHP,
Python and JavaScript.
